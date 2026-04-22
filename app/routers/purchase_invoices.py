"""
Router: Hóa đơn đầu vào (Matbao API + SAP B1 Service Layer)

Flow Matbao:
  1. Lưu matbao_api_key (UUID) trong config
  2. Tự động POST /auth/token → Bearer JWT (cache theo exp)
  3. Gọi POST /hoa-don-dau-vao/load-data

Flow SAP B1 Service Layer:
  1. Lưu sap_base_url, sap_company_db, sap_username, sap_password
  2. Tự động POST {base_url}/b1s/v1/Login → SessionId (cache 30 phút)
  3. Dùng Cookie: B1SESSION={SessionId}; CompanyDB={CompanyDB}
  4. Gọi GET {base_url}/b1s/v1/PurchaseOrders với OData filter

Endpoints:
  GET  /purchase-invoices/config
  PUT  /purchase-invoices/config
  POST /purchase-invoices/test-token
  POST /purchase-invoices/list
  GET  /purchase-invoices/detail-by-url
  POST /purchase-invoices/save
  GET  /purchase-invoices/saved
  GET  /purchase-invoices/saved/by-inv/{inv_id}
  GET  /purchase-invoices/saved/{record_id}
  PUT  /purchase-invoices/saved/{record_id}
  GET  /purchase-invoices/config/supplier-mappings
  POST /purchase-invoices/config/supplier-mappings
  PUT  /purchase-invoices/config/supplier-mappings/{id}
  DELETE /purchase-invoices/config/supplier-mappings/{id}
  GET  /purchase-invoices/config/product-mappings
  POST /purchase-invoices/config/product-mappings
  PUT  /purchase-invoices/config/product-mappings/{id}
  DELETE /purchase-invoices/config/product-mappings/{id}
  POST /purchase-invoices/sap/test-login
  GET  /purchase-invoices/sap/open-pos
  GET  /purchase-invoices/config/api-sources
  POST /purchase-invoices/config/api-sources
  PUT  /purchase-invoices/config/api-sources/{id}
  DELETE /purchase-invoices/config/api-sources/{id}
  POST /purchase-invoices/config/api-sources/{id}/invoke
"""

import base64
import json
import logging
import time
from typing import Any, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.purchase_invoice import (
    PurchaseInvoiceConfig,
    SavedPurchaseInvoice,
    SupplierMapping,
    ProductMapping,
    ExternalApiSource,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/purchase-invoices", tags=["Hóa đơn đầu vào"])

_TIMEOUT = 30.0

# ─── Matbao Bearer token cache ────────────────────────────────────────────────
_bearer_cache: dict[str, dict] = {}

# ─── SAP B1 Session cache ─────────────────────────────────────────────────────
# Key = "{sap_base_url}|{sap_company_db}|{sap_username}"
# Value = {"session_id": str, "exp": float, "version": str}
_sap_session_cache: dict[str, dict] = {}


def _decode_jwt_exp(token: str) -> float:
    try:
        part = token.split(".")[1]
        part += "=" * (4 - len(part) % 4)
        payload = json.loads(base64.urlsafe_b64decode(part))
        return float(payload.get("exp", time.time() + 3600))
    except Exception:
        return time.time() + 3600


def _get_bearer(cfg: PurchaseInvoiceConfig) -> str:
    if not cfg.matbao_api_key:
        raise HTTPException(
            status_code=400,
            detail="Chưa cấu hình Matbao API Key. Vui lòng vào Thiết lập để nhập key.",
        )
    cached = _bearer_cache.get(cfg.matbao_api_key)
    if cached and time.time() < cached["exp"] - 60:
        return cached["bearer"]

    url = f"{cfg.matbao_base_url}/auth/token"
    logger.info("Fetching Matbao Bearer token from %s", url)
    try:
        with httpx.Client(timeout=10.0, verify=False) as http:
            resp = http.post(
                url,
                headers={"Content-Type": "application/json"},
                json={"token": cfg.matbao_api_key},
            )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối Matbao: {exc}")

    try:
        body = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Matbao /auth/token trả về dữ liệu không hợp lệ")

    if not body.get("Success"):
        detail = body.get("Data") or "API key không hợp lệ"
        raise HTTPException(status_code=401, detail=f"Matbao xác thực thất bại: {detail}")

    bearer: str = body["Data"]
    exp = _decode_jwt_exp(bearer)
    _bearer_cache[cfg.matbao_api_key] = {"bearer": bearer, "exp": exp}
    logger.info("Matbao Bearer token cached, exp=%.0f", exp)
    return bearer


def _sap_cache_key(cfg: PurchaseInvoiceConfig) -> str:
    return f"{cfg.sap_base_url}|{cfg.sap_company_db}|{cfg.sap_username}"


def _get_sap_b1_session(cfg: PurchaseInvoiceConfig) -> str:
    """
    Lấy SAP B1 SessionId từ cache hoặc gọi Login API.
    Tự động renew khi còn dưới 60 giây trước khi hết hạn (timeout mặc định 30 phút).
    """
    if not cfg.sap_base_url:
        raise HTTPException(
            status_code=400,
            detail="Chưa cấu hình SAP Base URL. Vui lòng vào Thiết lập → SAP B1 để nhập URL.",
        )
    if not cfg.sap_company_db or not cfg.sap_username or not cfg.sap_password:
        raise HTTPException(
            status_code=400,
            detail="Chưa đủ thông tin đăng nhập SAP B1 (CompanyDB / Username / Password).",
        )

    key = _sap_cache_key(cfg)
    cached = _sap_session_cache.get(key)
    if cached and time.time() < cached["exp"] - 60:
        return cached["session_id"]

    # Gọi SAP B1 Login API
    login_url = f"{cfg.sap_base_url.rstrip('/')}/b1s/v1/Login"
    logger.info("Logging in to SAP B1 at %s (company=%s)", login_url, cfg.sap_company_db)
    try:
        with httpx.Client(timeout=15.0, verify=False) as http:
            resp = http.post(
                login_url,
                headers={"Content-Type": "application/json"},
                json={
                    "CompanyDB": cfg.sap_company_db,
                    "UserName":  cfg.sap_username,
                    "Password":  cfg.sap_password,
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="SAP B1 Login timeout")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối SAP B1: {exc}")

    if resp.status_code != 200:
        try:
            err = resp.json()
            msg = err.get("error", {}).get("message", {}).get("value", resp.text[:200])
        except Exception:
            msg = resp.text[:200]
        raise HTTPException(
            status_code=401,
            detail=f"SAP B1 đăng nhập thất bại ({resp.status_code}): {msg}",
        )

    try:
        body = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="SAP B1 Login trả về dữ liệu không hợp lệ")

    session_id = body.get("SessionId")
    if not session_id:
        raise HTTPException(status_code=502, detail="SAP B1 không trả về SessionId")

    timeout_min = int(body.get("SessionTimeout", 30))
    exp = time.time() + timeout_min * 60

    _sap_session_cache[key] = {
        "session_id": session_id,
        "exp": exp,
        "version": body.get("Version", ""),
        "timeout_min": timeout_min,
    }
    logger.info(
        "SAP B1 Session cached (company=%s, timeout=%dm, session=%.8s...)",
        cfg.sap_company_db, timeout_min, session_id,
    )
    return session_id


def _sap_b1_headers(cfg: PurchaseInvoiceConfig, session_id: str) -> dict:
    """Trả về headers + cookies đúng chuẩn SAP B1 Service Layer."""
    return {
        "Cookie":       f"B1SESSION={session_id}; CompanyDB={cfg.sap_company_db}",
        "Content-Type": "application/json",
        "Accept":       "application/json",
    }


def _call_matbao(method: str, url: str, **kwargs) -> Any:
    try:
        with httpx.Client(timeout=_TIMEOUT, verify=False) as http:
            resp = getattr(http, method)(url, **kwargs)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Matbao API timeout")
    except Exception as exc:
        logger.error("Matbao API error: %s", exc)
        raise HTTPException(status_code=502, detail=f"Không thể kết nối Matbao API: {exc}")

    try:
        body = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Matbao API trả về dữ liệu không hợp lệ")

    if not body.get("Success", False):
        detail = body.get("Data") or body.get("ErrorCode") or "Lỗi từ Matbao API"
        raise HTTPException(status_code=400, detail=str(detail))

    return body.get("Data")


# ─── Normalize Matbao response ────────────────────────────────────────────────

def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _status_code(trang_thai: Optional[str]) -> int:
    if not trang_thai:
        return -1
    t = trang_thai.upper()
    if "KHÔNG HỢP LỆ" in t:
        return 1
    if "SAI SÓT" in t:
        return 3
    if "HỢP LỆ" in t:
        return 0
    if "TRÙNG" in t:
        return 2
    return -1


def _normalize_invoice(raw: dict) -> dict:
    hdon    = raw.get("HDon") or {}
    dl      = hdon.get("DLHDon") or {}
    ttchung = dl.get("TTChung") or {}
    ndhdon  = dl.get("NDHDon") or {}
    nban    = ndhdon.get("NBan") or {}
    nmua    = ndhdon.get("NMua") or {}
    ttoan   = ndhdon.get("TToan") or {}
    ktra    = raw.get("KTra") or {}

    raw_lines = (ndhdon.get("DSHHDVu") or {}).get("HHDVu") or []
    if isinstance(raw_lines, dict):
        raw_lines = [raw_lines]

    lines = [
        {
            "STT":     l.get("STT"),
            "MHHDVu":  l.get("MHHDVu"),
            "THHDVu":  l.get("THHDVu"),
            "DVTinh":  l.get("DVTinh"),
            "SLuong":  _num(l.get("SLuong")),
            "DGia":    _num(l.get("DGia")),
            "ThTien":  _num(l.get("ThTien")),
            "TSuat":   l.get("TSuat"),
            "TLCKhau": _num(l.get("TLCKhau")),
            "STCKhau": _num(l.get("STCKhau")),
        }
        for l in raw_lines
    ]

    trang_thai_str = ktra.get("TrangThai") or raw.get("KQPhanTich") or ""

    return {
        "InvID":       raw.get("InvID"),
        "TctID":       raw.get("TctID"),
        "THDon":       ttchung.get("THDon"),
        "KHMSHDon":    ttchung.get("KHMSHDon"),
        "KHHDon":      ttchung.get("KHHDon"),
        "SHDon":       ttchung.get("SHDon"),
        "NLap":        ttchung.get("NLap"),
        "NKy":         ktra.get("Ngayky") or "",
        "DVTTe":       ttchung.get("DVTTe"),
        "HTTToan":     ttchung.get("HTTToan"),
        "MCCQT":       hdon.get("MCCQT"),
        "NBanTen":     nban.get("Ten"),
        "NBanMST":     nban.get("MST"),
        "NBanMa":      nban.get("Ma") or nban.get("NBanMa"),
        "NBanDChi":    nban.get("DChi"),
        "NBanSDT":     nban.get("SDThoai"),
        "NMuaTen":     nmua.get("Ten"),
        "NMuaMST":     nmua.get("MST"),
        "NMuaDChi":    nmua.get("DChi"),
        "TgTCThue":    _num(ttoan.get("TgTCThue")),
        "TgTThue":     _num(ttoan.get("TgTThue")),
        "TgTTTBSo":    _num(ttoan.get("TgTTTBSo")),
        "TgTTTBChu":   ttoan.get("TgTTTBChu"),
        "TTCKTMai":    _num(ttoan.get("TTCKTMai")),
        "TThai":       _status_code(trang_thai_str),
        "TenTThai":    trang_thai_str,
        "TrangThaiHD": raw.get("TrangThaiHD"),
        "KQPhanTich":  raw.get("KQPhanTich"),
        "KQKiemTraHDon": raw.get("KQKiemTraHDon"),
        "NguonUpload": raw.get("NguonUpload"),
        "NgayImport":  raw.get("NgayImport"),
        "KTra": {
            "TrangThai":    ktra.get("TrangThai"),
            "NBanTen":      ktra.get("NBanTen"),
            "NBanMST":      ktra.get("NBanMST"),
            "NBanDChi":     ktra.get("NBanDChi"),
            "NMuaTen":      ktra.get("NMuaTen"),
            "NMuaMST":      ktra.get("NMuaMST"),
            "NMuaDChi":     ktra.get("NMuaDChi"),
            "TgTCThue":     ktra.get("TgTCThue"),
            "TgTThue":      ktra.get("TgTThue"),
            "TgTTTBSo":     ktra.get("TgTTTBSo"),
            "TTCKTMai":     ktra.get("TTCKTMai"),
            "NBanTrangThaiHDMST":  ktra.get("NBanTrangThaiHDMST"),
            "NBanNDTrangThaiHDMST": ktra.get("NBanNDTrangThaiHDMST"),
            "NMuaTrangThaiHDMST":  ktra.get("NMuaTrangThaiHDMST"),
            "NMuaNDTrangThaiHDMST": ktra.get("NMuaNDTrangThaiHDMST"),
            "ChuKyMST":     ktra.get("ChuKyMST"),
            "ChuKyHieuLuc": ktra.get("ChuKyHieuLuc"),
        },
        "LinkDownloadXML": ktra.get("LinkDownloadXML"),
        "LinkDownloadPDF": ktra.get("LinkDownloadPDF"),
        "DSHHDVu": lines,
    }


# ─── DB helpers ───────────────────────────────────────────────────────────────

def _get_config(db: Session) -> PurchaseInvoiceConfig:
    cfg = db.query(PurchaseInvoiceConfig).filter(
        PurchaseInvoiceConfig.is_active == True
    ).first()
    if not cfg:
        cfg = PurchaseInvoiceConfig()
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _lookup_supplier_code(db: Session, tax_code: Optional[str]) -> Optional[str]:
    """Tra cứu mã NCC SAP từ MST người bán."""
    if not tax_code:
        return None
    mapping = db.query(SupplierMapping).filter(
        SupplierMapping.tax_code == tax_code
    ).first()
    return mapping.supplier_code if mapping else None


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    id:              int
    name:            str
    matbao_base_url: str
    matbao_api_key:  Optional[str]
    sap_base_url:    Optional[str]
    sap_company_db:  Optional[str]
    sap_username:    Optional[str]
    # sap_password không trả về client
    is_active:       bool
    created_at:      Optional[str]
    updated_at:      Optional[str]

    class Config:
        from_attributes = True


class ConfigUpdate(BaseModel):
    name:            Optional[str]  = None
    matbao_base_url: Optional[str]  = None
    matbao_api_key:  Optional[str]  = None
    sap_base_url:    Optional[str]  = None
    sap_company_db:  Optional[str]  = None
    sap_username:    Optional[str]  = None
    sap_password:    Optional[str]  = None
    is_active:       Optional[bool] = None


class InvoiceListRequest(BaseModel):
    comName:        Optional[str] = None
    comTaxCode:     Optional[str] = None
    no:             Optional[int] = None
    fromDateYMD:    Optional[str] = None
    toDateYMD:      Optional[str] = None
    trangthai:      int           = -1
    pattern:        Optional[str] = None
    serial:         Optional[str] = None
    typeSearchDate: Optional[Any] = 0
    typeDataPDF:    int           = 0


# ─── Supplier mapping schemas ─────────────────────────────────────────────────

class SupplierMappingResponse(BaseModel):
    id:            int
    tax_code:      str
    supplier_code: str
    supplier_name: Optional[str]
    created_at:    Optional[str]
    updated_at:    Optional[str]

    class Config:
        from_attributes = True


class SupplierMappingCreate(BaseModel):
    tax_code:      str
    supplier_code: str
    supplier_name: Optional[str] = None


class SupplierMappingUpdate(BaseModel):
    tax_code:      Optional[str] = None
    supplier_code: Optional[str] = None
    supplier_name: Optional[str] = None


# ─── Product mapping schemas ──────────────────────────────────────────────────

class ProductMappingResponse(BaseModel):
    id:            int
    product_name:  str
    material_code: Optional[str]
    unit_code:     Optional[str]
    tax_code_sap:  Optional[str]
    created_at:    Optional[str]
    updated_at:    Optional[str]

    class Config:
        from_attributes = True


class ProductMappingCreate(BaseModel):
    product_name:  str
    material_code: Optional[str] = None
    unit_code:     Optional[str] = None
    tax_code_sap:  Optional[str] = None


class ProductMappingUpdate(BaseModel):
    product_name:  Optional[str] = None
    material_code: Optional[str] = None
    unit_code:     Optional[str] = None
    tax_code_sap:  Optional[str] = None


# ─── Saved invoice schemas ────────────────────────────────────────────────────

class SavedInvoiceResponse(BaseModel):
    id:               int
    inv_id:           str
    inv_no:           Optional[str]
    khhd:             Optional[str]
    inv_date:         Optional[str]
    seller_tax_code:  Optional[str]
    seller_name:      Optional[str]
    buyer_tax_code:   Optional[str]
    buyer_name:       Optional[str]
    total_before_tax: Optional[float]
    total_tax:        Optional[float]
    total_amount:     Optional[float]
    kq_phan_tich:     Optional[str]
    tthai:            Optional[int]
    supplier_code:    Optional[str]
    reference_po:     Optional[str]
    created_at:       Optional[str]
    updated_at:       Optional[str]

    class Config:
        from_attributes = True


class SaveInvoiceRequest(BaseModel):
    invoice: dict   # Toàn bộ PurchaseInvoiceItem từ frontend


class UpdateSavedInvoice(BaseModel):
    supplier_code: Optional[str] = None
    reference_po:  Optional[str] = None


# ─── Config endpoints ─────────────────────────────────────────────────────────

@router.get("/config", response_model=ConfigResponse, summary="Lấy cấu hình")
async def get_config(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return _get_config(db)


@router.put("/config", response_model=ConfigResponse, summary="Lưu cấu hình")
async def update_config(
    body: ConfigUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    cfg = _get_config(db)
    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(cfg, k, v)
    # Xoá cache Matbao nếu API key thay đổi
    if "matbao_api_key" in updates and cfg.matbao_api_key in _bearer_cache:
        del _bearer_cache[cfg.matbao_api_key]
    # Xoá cache SAP session nếu thông tin SAP thay đổi
    sap_fields = {"sap_base_url", "sap_company_db", "sap_username", "sap_password"}
    if sap_fields.intersection(updates):
        key = _sap_cache_key(cfg)
        _sap_session_cache.pop(key, None)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.post("/test-token", summary="Kiểm tra API key Matbao")
async def test_token(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    if cfg.matbao_api_key and cfg.matbao_api_key in _bearer_cache:
        del _bearer_cache[cfg.matbao_api_key]
    bearer = _get_bearer(cfg)
    exp = _bearer_cache.get(cfg.matbao_api_key, {}).get("exp", 0)
    remaining = max(0, int(exp - time.time()))
    return {
        "success": True,
        "message": "API key hợp lệ, đã lấy Bearer token thành công",
        "token_preview": bearer[:30] + "...",
        "expires_in_seconds": remaining,
    }


# ─── Invoice list ─────────────────────────────────────────────────────────────

@router.post("/list", summary="Danh sách hóa đơn đầu vào")
async def list_invoices(
    body: InvoiceListRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    bearer = _get_bearer(cfg)
    url = f"{cfg.matbao_base_url}/hoa-don-dau-vao/load-data"
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    raw_list = _call_matbao("post", url, headers={
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
    }, json=payload)

    if not raw_list:
        return {"data": [], "total": 0}

    normalized = [_normalize_invoice(item) for item in raw_list if isinstance(item, dict)]

    # Bổ sung supplier_code cho từng hóa đơn từ bảng mapping
    for inv in normalized:
        mst = inv.get("NBanMST")
        inv["SupplierCode"] = _lookup_supplier_code(db, mst)

    return {"data": normalized, "total": len(normalized)}


# ─── Invoice detail ───────────────────────────────────────────────────────────

@router.get("/detail-by-url", summary="Chi tiết hóa đơn từ URL XML")
async def detail_by_url(
    url_xml:         str,
    kiem_tra_hop_le: int = 0,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    bearer = _get_bearer(cfg)
    url = f"{cfg.matbao_base_url}/hoa-don-dau-vao/detail-by-url"
    data = _call_matbao("get", url, headers={
        "Authorization": f"Bearer {bearer}",
        "Content-Type": "application/json",
    }, params={"url_xml": url_xml, "kiem_tra_hop_le": kiem_tra_hop_le})
    return data


# ─── Save invoice to DB ───────────────────────────────────────────────────────

@router.post("/save", response_model=SavedInvoiceResponse, summary="Lưu hóa đơn vào CSDL")
async def save_invoice(
    body: SaveInvoiceRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Lưu hoặc cập nhật hóa đơn vào CSDL nội bộ (upsert theo InvID)."""
    inv = body.invoice
    inv_id = inv.get("InvID")
    if not inv_id:
        raise HTTPException(status_code=400, detail="InvID không được để trống")

    cfg = _get_config(db)
    # Tự động tra mã NCC từ MST người bán
    seller_mst = inv.get("NBanMST")
    supplier_code = _lookup_supplier_code(db, seller_mst)

    record = db.query(SavedPurchaseInvoice).filter(
        SavedPurchaseInvoice.inv_id == inv_id
    ).first()

    if record:
        # Cập nhật thông tin, giữ supplier_code và reference_po nếu đã có
        record.inv_no          = str(inv.get("SHDon") or "")
        record.khhd            = f"{inv.get('KHMSHDon','')}{inv.get('KHHDon','')}"
        record.inv_date        = inv.get("NLap")
        record.seller_tax_code = seller_mst
        record.seller_name     = inv.get("NBanTen")
        record.buyer_tax_code  = inv.get("NMuaMST")
        record.buyer_name      = inv.get("NMuaTen")
        record.total_before_tax= inv.get("TgTCThue")
        record.total_tax       = inv.get("TgTThue")
        record.total_amount    = inv.get("TgTTTBSo")
        record.kq_phan_tich    = inv.get("KQPhanTich")
        record.tthai           = inv.get("TThai")
        record.raw_data        = json.dumps(inv, ensure_ascii=False)
        # Chỉ cập nhật supplier_code nếu chưa có hoặc mapping mới
        if supplier_code and not record.supplier_code:
            record.supplier_code = supplier_code
    else:
        record = SavedPurchaseInvoice(
            inv_id          = inv_id,
            inv_no          = str(inv.get("SHDon") or ""),
            khhd            = f"{inv.get('KHMSHDon','')}{inv.get('KHHDon','')}",
            inv_date        = inv.get("NLap"),
            seller_tax_code = seller_mst,
            seller_name     = inv.get("NBanTen"),
            buyer_tax_code  = inv.get("NMuaMST"),
            buyer_name      = inv.get("NMuaTen"),
            total_before_tax= inv.get("TgTCThue"),
            total_tax       = inv.get("TgTThue"),
            total_amount    = inv.get("TgTTTBSo"),
            kq_phan_tich    = inv.get("KQPhanTich"),
            tthai           = inv.get("TThai"),
            supplier_code   = supplier_code,
            raw_data        = json.dumps(inv, ensure_ascii=False),
            config_id       = cfg.id,
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return record


@router.get("/saved", response_model=List[SavedInvoiceResponse], summary="Danh sách hóa đơn đã lưu")
async def list_saved(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return db.query(SavedPurchaseInvoice).order_by(
        SavedPurchaseInvoice.created_at.desc()
    ).all()


# NOTE: static segment "by-inv" MUST be registered BEFORE the dynamic /{record_id} route
@router.get("/saved/by-inv/{inv_id}", response_model=SavedInvoiceResponse, summary="Tra cứu bản ghi theo InvID")
async def get_saved_by_inv_id(
    inv_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    record = db.query(SavedPurchaseInvoice).filter(
        SavedPurchaseInvoice.inv_id == inv_id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Chưa lưu")
    return record


@router.get("/saved/{record_id}", response_model=SavedInvoiceResponse, summary="Chi tiết bản ghi đã lưu")
async def get_saved(
    record_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    record = db.get(SavedPurchaseInvoice, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")
    return record


@router.put("/saved/{record_id}", response_model=SavedInvoiceResponse, summary="Cập nhật bản ghi")
async def update_saved(
    record_id: int,
    body: UpdateSavedInvoice,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    record = db.get(SavedPurchaseInvoice, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi")
    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


# ─── Supplier mapping CRUD ────────────────────────────────────────────────────

@router.get(
    "/config/supplier-mappings",
    response_model=List[SupplierMappingResponse],
    summary="Danh sách mapping nhà cung cấp",
)
async def list_supplier_mappings(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return db.query(SupplierMapping).order_by(SupplierMapping.tax_code).all()


@router.post(
    "/config/supplier-mappings",
    response_model=SupplierMappingResponse,
    summary="Tạo mapping nhà cung cấp",
)
async def create_supplier_mapping(
    body: SupplierMappingCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    # Kiểm tra trùng tax_code
    existing = db.query(SupplierMapping).filter(
        SupplierMapping.tax_code == body.tax_code
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"MST '{body.tax_code}' đã có mapping. Vui lòng chỉnh sửa bản hiện có."
        )
    cfg = _get_config(db)
    mapping = SupplierMapping(
        tax_code      = body.tax_code,
        supplier_code = body.supplier_code,
        supplier_name = body.supplier_name,
        config_id     = cfg.id,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


@router.put(
    "/config/supplier-mappings/{mapping_id}",
    response_model=SupplierMappingResponse,
    summary="Sửa mapping nhà cung cấp",
)
async def update_supplier_mapping(
    mapping_id: int,
    body: SupplierMappingUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    mapping = db.get(SupplierMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Không tìm thấy")
    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(mapping, k, v)
    db.commit()
    db.refresh(mapping)
    return mapping


@router.delete(
    "/config/supplier-mappings/{mapping_id}",
    summary="Xoá mapping nhà cung cấp",
)
async def delete_supplier_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    mapping = db.get(SupplierMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Không tìm thấy")
    db.delete(mapping)
    db.commit()
    return {"ok": True}


# ─── Product mapping CRUD ─────────────────────────────────────────────────────

@router.get(
    "/config/product-mappings",
    response_model=List[ProductMappingResponse],
    summary="Danh sách mapping hàng hóa",
)
async def list_product_mappings(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return db.query(ProductMapping).order_by(ProductMapping.product_name).all()


@router.post(
    "/config/product-mappings",
    response_model=ProductMappingResponse,
    summary="Tạo mapping hàng hóa",
)
async def create_product_mapping(
    body: ProductMappingCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    cfg = _get_config(db)
    mapping = ProductMapping(
        product_name  = body.product_name,
        material_code = body.material_code,
        unit_code     = body.unit_code,
        tax_code_sap  = body.tax_code_sap,
        config_id     = cfg.id,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


@router.put(
    "/config/product-mappings/{mapping_id}",
    response_model=ProductMappingResponse,
    summary="Sửa mapping hàng hóa",
)
async def update_product_mapping(
    mapping_id: int,
    body: ProductMappingUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    mapping = db.get(ProductMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Không tìm thấy")
    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(mapping, k, v)
    db.commit()
    db.refresh(mapping)
    return mapping


@router.delete(
    "/config/product-mappings/{mapping_id}",
    summary="Xoá mapping hàng hóa",
)
async def delete_product_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    mapping = db.get(ProductMapping, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="Không tìm thấy")
    db.delete(mapping)
    db.commit()
    return {"ok": True}


# ─── External API Source schemas ─────────────────────────────────────────────

class ApiFieldMapping(BaseModel):
    api_field: str
    label:     str
    ocr_field: Optional[str] = None


class ApiSourceCreate(BaseModel):
    name:            str
    description:     Optional[str]  = None
    base_url:        str
    select_fields:   Optional[str]  = None
    filter_template: Optional[str]  = None
    extra_params:    Optional[str]  = None
    field_mappings:  List[ApiFieldMapping] = []
    use_sap_auth:    bool            = True
    category:        Optional[str]  = None   # None | 'seller' | 'line_item'
    is_active:       bool            = True


class ApiSourceUpdate(BaseModel):
    name:            Optional[str]  = None
    description:     Optional[str]  = None
    base_url:        Optional[str]  = None
    select_fields:   Optional[str]  = None
    filter_template: Optional[str]  = None
    extra_params:    Optional[str]  = None
    field_mappings:  Optional[List[ApiFieldMapping]] = None
    use_sap_auth:    Optional[bool] = None
    category:        Optional[str]  = None
    is_active:       Optional[bool] = None


class InvokeApiSourceRequest(BaseModel):
    """Ngữ cảnh hóa đơn để điền vào {placeholder} trong filter_template."""
    context: dict[str, Optional[str]] = {}


def _serialize_api_source(src: ExternalApiSource) -> dict:
    mappings: List[dict] = []
    if src.field_mappings:
        try:
            mappings = json.loads(src.field_mappings)
        except Exception:
            mappings = []
    return {
        "id":              src.id,
        "name":            src.name,
        "description":     src.description,
        "base_url":        src.base_url,
        "select_fields":   src.select_fields,
        "filter_template": src.filter_template,
        "extra_params":    src.extra_params,
        "field_mappings":  mappings,
        "use_sap_auth":    src.use_sap_auth,
        "category":        src.category,
        "is_active":       src.is_active,
        "created_at":      src.created_at,
        "updated_at":      src.updated_at,
    }


# ─── External API Source CRUD ─────────────────────────────────────────────────

@router.get("/config/api-sources", summary="Danh sách API nguồn dữ liệu ngoài")
async def list_api_sources(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    sources = db.query(ExternalApiSource).order_by(ExternalApiSource.name).all()
    return [_serialize_api_source(s) for s in sources]


@router.post("/config/api-sources", summary="Tạo API nguồn dữ liệu ngoài", status_code=201)
async def create_api_source(
    body: ApiSourceCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    cfg = _get_config(db)
    src = ExternalApiSource(
        name            = body.name,
        description     = body.description,
        base_url        = body.base_url,
        select_fields   = body.select_fields,
        filter_template = body.filter_template,
        extra_params    = body.extra_params,
        field_mappings  = json.dumps([m.model_dump() for m in body.field_mappings], ensure_ascii=False),
        use_sap_auth    = body.use_sap_auth,
        category        = body.category,
        is_active       = body.is_active,
        config_id       = cfg.id,
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return _serialize_api_source(src)


@router.put("/config/api-sources/{source_id}", summary="Cập nhật API nguồn dữ liệu ngoài")
async def update_api_source(
    source_id: int,
    body: ApiSourceUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    src = db.get(ExternalApiSource, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Không tìm thấy API source")
    updates = body.model_dump(exclude_none=True)
    if "field_mappings" in updates:
        updates["field_mappings"] = json.dumps(
            [m.model_dump() for m in body.field_mappings], ensure_ascii=False
        )
    for k, v in updates.items():
        setattr(src, k, v)
    db.commit()
    db.refresh(src)
    return _serialize_api_source(src)


@router.delete("/config/api-sources/{source_id}", summary="Xoá API nguồn dữ liệu ngoài")
async def delete_api_source(
    source_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    src = db.get(ExternalApiSource, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Không tìm thấy API source")
    db.delete(src)
    db.commit()
    return {"ok": True}


@router.post("/config/api-sources/{source_id}/invoke", summary="Gọi API nguồn dữ liệu")
async def invoke_api_source(
    source_id: int,
    body: InvokeApiSourceRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """
    Gọi API nguồn dữ liệu với ngữ cảnh hóa đơn.
    {placeholder} trong filter_template được thay thế bằng giá trị trong context.

    VD context: {"NBanMST": "0123456789", "SHDon": "123"}
    filter_template = "U_MDHPT eq '{NBanMST}' and Cancelled eq 'tNO'"
    → $filter = "U_MDHPT eq '0123456789' and Cancelled eq 'tNO'"
    """
    src = db.get(ExternalApiSource, source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Không tìm thấy API source")
    if not src.is_active:
        raise HTTPException(status_code=400, detail="API source đã bị vô hiệu hóa")

    # ── Build query params ────────────────────────────────────────────────────
    params: dict[str, str] = {}

    if src.select_fields and src.select_fields.strip():
        params["$select"] = src.select_fields.strip()

    if src.filter_template and src.filter_template.strip():
        filter_str = src.filter_template.strip()
        for key, val in body.context.items():
            if val is not None:
                filter_str = filter_str.replace(f"{{{key}}}", str(val))
        params["$filter"] = filter_str

    if src.extra_params and src.extra_params.strip():
        for part in src.extra_params.strip().split("&"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                params[k.strip()] = v.strip()

    # ── Auth headers ──────────────────────────────────────────────────────────
    if src.use_sap_auth:
        cfg = _get_config(db)
        session_id = _get_sap_b1_session(cfg)
        headers = _sap_b1_headers(cfg, session_id)
    else:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}

    # ── HTTP call ─────────────────────────────────────────────────────────────
    base_url = src.base_url.rstrip("/")
    logger.info("Invoking API source '%s': GET %s params=%s", src.name, base_url, list(params.keys()))
    try:
        with httpx.Client(timeout=30.0, verify=False) as http:
            resp = http.get(base_url, headers=headers, params=params)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="API timeout")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối API: {exc}")

    if resp.status_code == 401 and src.use_sap_auth:
        cfg = _get_config(db)
        _sap_session_cache.pop(_sap_cache_key(cfg), None)
        raise HTTPException(
            status_code=401,
            detail="Session hết hạn. Vui lòng thử lại để tự động đăng nhập mới.",
        )

    if resp.status_code >= 400:
        try:
            err_msg = resp.json().get("error", {}).get("message", {}).get("value", resp.text[:300])
        except Exception:
            err_msg = resp.text[:300]
        raise HTTPException(status_code=resp.status_code, detail=f"API trả về lỗi: {err_msg}")

    try:
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="API trả về dữ liệu không hợp lệ (non-JSON)")

    rows = data.get("value", data) if isinstance(data, dict) else data
    if not isinstance(rows, list):
        rows = [rows]

    return {
        "success":    True,
        "data":       rows,
        "count":      len(rows),
        "url_called": str(resp.url),
    }


# ─── SAP B1 – Test Login ──────────────────────────────────────────────────────

@router.post("/sap/test-login", summary="Kiểm tra đăng nhập SAP B1")
async def sap_test_login(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """
    Thử đăng nhập SAP B1 Service Layer.
    Xoá cache session cũ → force re-login → trả về thông tin session mới.
    """
    cfg = _get_config(db)
    # Force re-login bằng cách xoá cache
    key = _sap_cache_key(cfg)
    _sap_session_cache.pop(key, None)

    session_id = _get_sap_b1_session(cfg)   # raises HTTPException nếu lỗi
    cached = _sap_session_cache.get(key, {})

    return {
        "success": True,
        "message": f"Đăng nhập SAP B1 thành công (company: {cfg.sap_company_db})",
        "session_preview": session_id[:12] + "...",
        "version": cached.get("version", ""),
        "expires_in_minutes": cached.get("timeout_min", 30),
    }


# ─── SAP B1 – Open Purchase Orders ───────────────────────────────────────────

def _normalize_sap_po(raw: dict) -> dict:
    """
    Chuyển OData response của SAP B1 PurchaseOrders → format frontend SapOpenPO.
    SAP B1 OData fields:
      DocNum, DocDate, CardCode, CardName, DocTotal, DocCurrency, DocumentLines
    """
    lines_raw = raw.get("DocumentLines") or []
    items = [
        {
            "POItem":      str(l.get("LineNum", i + 1)).zfill(5),
            "Material":    l.get("ItemCode"),
            "Description": l.get("ItemDescription"),
            "Quantity":    l.get("Quantity"),
            "Unit":        l.get("MeasureUnit"),
            "NetPrice":    l.get("UnitPrice"),
        }
        for i, l in enumerate(lines_raw)
    ]
    return {
        "PONumber":    str(raw.get("DocNum", "")),
        "DocDate":     raw.get("DocDate"),
        "Vendor":      raw.get("CardCode"),
        "VendorName":  raw.get("CardName"),
        "TotalAmount": raw.get("DocTotal"),
        "Currency":    raw.get("DocCurrency"),
        "Items":       items,
    }


@router.get("/sap/open-pos", summary="Đơn hàng mở trên SAP B1 theo nhà cung cấp")
async def get_sap_open_pos(
    supplier_code: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """
    Lấy danh sách Purchase Orders còn mở (DocumentStatus = 'bost_Open')
    của nhà cung cấp (CardCode) từ SAP B1 Service Layer.

    SAP B1 OData endpoint:
      GET {base_url}/b1s/v1/PurchaseOrders
          ?$filter=CardCode eq '{supplier_code}' and DocumentStatus eq 'bost_Open'
          &$select=DocNum,DocDate,CardCode,CardName,DocTotal,DocCurrency
          &$expand=DocumentLines($select=LineNum,ItemCode,ItemDescription,
                                  Quantity,MeasureUnit,UnitPrice)
    """
    cfg = _get_config(db)
    session_id = _get_sap_b1_session(cfg)  # raises HTTPException nếu chưa cấu hình / lỗi

    base = cfg.sap_base_url.rstrip("/")
    odata_url = f"{base}/b1s/v1/PurchaseOrders"

    # OData $filter + $select + $expand
    odata_filter = (
        f"CardCode eq '{supplier_code}' "
        f"and DocumentStatus eq 'bost_Open'"
    )
    odata_select = "DocNum,DocDate,CardCode,CardName,DocTotal,DocCurrency"
    odata_expand = (
        "DocumentLines($select=LineNum,ItemCode,ItemDescription,"
        "Quantity,MeasureUnit,UnitPrice)"
    )

    try:
        with httpx.Client(timeout=20.0, verify=False) as http:
            resp = http.get(
                odata_url,
                headers=_sap_b1_headers(cfg, session_id),
                params={
                    "$filter": odata_filter,
                    "$select": odata_select,
                    "$expand": odata_expand,
                    "$orderby": "DocDate desc",
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="SAP B1 API timeout")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối SAP B1: {exc}")

    # Session hết hạn → xoá cache và báo lỗi
    if resp.status_code == 401:
        _sap_session_cache.pop(_sap_cache_key(cfg), None)
        raise HTTPException(
            status_code=401,
            detail="SAP B1 session hết hạn. Vui lòng thử lại để tự động đăng nhập mới.",
        )

    if resp.status_code >= 400:
        try:
            err_msg = resp.json().get("error", {}).get("message", {}).get("value", resp.text[:200])
        except Exception:
            err_msg = resp.text[:200]
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"SAP B1 trả về lỗi: {err_msg}",
        )

    try:
        body = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="SAP B1 trả về dữ liệu không hợp lệ")

    raw_list = body.get("value", [])
    normalized = [_normalize_sap_po(po) for po in raw_list]

    return {"data": normalized, "total": len(normalized)}
