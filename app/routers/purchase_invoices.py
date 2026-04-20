"""
Router: Hóa đơn đầu vào (Matbao Purchase Invoice API)

Flow xác thực:
  1. Lưu matbao_api_key (UUID) trong config
  2. Tự động gọi POST /auth/token để đổi lấy Bearer JWT
  3. Cache Bearer JWT theo thời gian hết hạn (đọc từ exp trong JWT)
  4. Gọi POST /hoa-don-dau-vao/load-data với Bearer JWT

Endpoints:
  GET  /purchase-invoices/config       – lấy cấu hình
  PUT  /purchase-invoices/config       – lưu cấu hình
  POST /purchase-invoices/test-token   – kiểm tra API key hợp lệ
  POST /purchase-invoices/list         – danh sách hóa đơn
  GET  /purchase-invoices/detail-by-url – chi tiết từ URL XML
"""

import base64
import json
import logging
import time
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.purchase_invoice import PurchaseInvoiceConfig

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/purchase-invoices", tags=["Hóa đơn đầu vào"])

_TIMEOUT = 30.0


# ─── Bearer token cache (in-memory, per process) ──────────────────────────────
# Key = matbao_api_key, Value = {"bearer": str, "exp": float}
_bearer_cache: dict[str, dict] = {}


def _decode_jwt_exp(token: str) -> float:
    """Đọc exp từ JWT payload (không verify signature)."""
    try:
        part = token.split(".")[1]
        part += "=" * (4 - len(part) % 4)
        payload = json.loads(base64.urlsafe_b64decode(part))
        return float(payload.get("exp", time.time() + 3600))
    except Exception:
        return time.time() + 3600


def _get_bearer(cfg: PurchaseInvoiceConfig) -> str:
    """
    Lấy Bearer JWT từ cache hoặc gọi /auth/token với API key.
    Tự động renew khi còn dưới 60 giây trước khi hết hạn.
    """
    if not cfg.matbao_api_key:
        raise HTTPException(
            status_code=400,
            detail="Chưa cấu hình Matbao API Key. Vui lòng vào Thiết lập để nhập key.",
        )

    cached = _bearer_cache.get(cfg.matbao_api_key)
    if cached and time.time() < cached["exp"] - 60:
        return cached["bearer"]

    # Gọi /auth/token để đổi lấy Bearer JWT
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
    logger.info("Matbao Bearer token cached, exp=%.0f (%.0fs từ bây giờ)", exp, exp - time.time())
    return bearer


def _call_matbao(method: str, url: str, **kwargs) -> Any:
    """Gọi Matbao API, trả về data hoặc ném HTTPException."""
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


# ─── Normalize nested Matbao response ────────────────────────────────────────

def _num(v: Any) -> Optional[float]:
    """Chuyển string/number → float, trả None nếu không hợp lệ."""
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _status_code(trang_thai: Optional[str]) -> int:
    """Map chuỗi trạng thái → mã số.
    0=hợp lệ, 1=không hợp lệ, 2=trùng, 3=có sai sót, -1=khác/không xác định
    """
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
    """
    Chuyển cấu trúc lồng nhau của Matbao thành flat dict
    tương thích với PurchaseInvoiceItem ở frontend.

    Cấu trúc nguồn:
      raw.HDon.DLHDon.TTChung  → thông tin chung
      raw.HDon.DLHDon.NDHDon   → nội dung (NBan, NMua, DSHHDVu, TToan)
      raw.HDon.MCCQT           → mã CQT
      raw.KTra                 → kiểm tra hợp lệ + link download
    """
    hdon    = raw.get("HDon") or {}
    dl      = hdon.get("DLHDon") or {}
    ttchung = dl.get("TTChung") or {}
    ndhdon  = dl.get("NDHDon") or {}
    nban    = ndhdon.get("NBan") or {}
    nmua    = ndhdon.get("NMua") or {}
    ttoan   = ndhdon.get("TToan") or {}
    ktra    = raw.get("KTra") or {}

    # ── Dòng hàng hóa: HHDVu có thể là list hoặc dict đơn ───────────────────
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
        # ── Định danh ────────────────────────────────────────────────────────
        "InvID":       raw.get("InvID"),
        "TctID":       raw.get("TctID"),
        # ── Thông tin chung ──────────────────────────────────────────────────
        "THDon":       ttchung.get("THDon"),
        "KHMSHDon":    ttchung.get("KHMSHDon"),
        "KHHDon":      ttchung.get("KHHDon"),
        "SHDon":       ttchung.get("SHDon"),
        "NLap":        ttchung.get("NLap"),
        "NKy":         ktra.get("Ngayky") or "",
        "DVTTe":       ttchung.get("DVTTe"),
        "HTTToan":     ttchung.get("HTTToan"),
        "MCCQT":       hdon.get("MCCQT"),
        # ── Người bán ────────────────────────────────────────────────────────
        "NBanTen":     nban.get("Ten"),
        "NBanMST":     nban.get("MST"),
        "NBanDChi":    nban.get("DChi"),
        "NBanSDT":     nban.get("SDThoai"),
        # ── Người mua ────────────────────────────────────────────────────────
        "NMuaTen":     nmua.get("Ten"),
        "NMuaMST":     nmua.get("MST"),
        "NMuaDChi":    nmua.get("DChi"),
        # ── Thanh toán ───────────────────────────────────────────────────────
        "TgTCThue":    _num(ttoan.get("TgTCThue")),
        "TgTThue":     _num(ttoan.get("TgTThue")),
        "TgTTTBSo":    _num(ttoan.get("TgTTTBSo")),
        "TgTTTBChu":   ttoan.get("TgTTTBChu"),
        "TTCKTMai":    _num(ttoan.get("TTCKTMai")),
        # ── Trạng thái ──────────────────────────────────────────────────────
        "TThai":       _status_code(trang_thai_str),
        "TenTThai":    trang_thai_str,
        "TrangThaiHD": raw.get("TrangThaiHD"),
        "KQPhanTich":  raw.get("KQPhanTich"),
        "KQKiemTraHDon": raw.get("KQKiemTraHDon"),
        "NguonUpload": raw.get("NguonUpload"),
        "NgayImport":  raw.get("NgayImport"),
        # ── Kiểm tra hợp lệ (KTra) ──────────────────────────────────────────
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
        # ── Download links ───────────────────────────────────────────────────
        "LinkDownloadXML": ktra.get("LinkDownloadXML"),
        "LinkDownloadPDF": ktra.get("LinkDownloadPDF"),
        # ── Dòng hàng hóa ───────────────────────────────────────────────────
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


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    id:              int
    name:            str
    matbao_base_url: str
    matbao_api_key:  Optional[str]
    is_active:       bool
    created_at:      Optional[str]
    updated_at:      Optional[str]

    class Config:
        from_attributes = True


class ConfigUpdate(BaseModel):
    name:            Optional[str]  = None
    matbao_base_url: Optional[str]  = None
    matbao_api_key:  Optional[str]  = None
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


# ─── Config endpoints ─────────────────────────────────────────────────────────

@router.get("/config", response_model=ConfigResponse, summary="Lấy cấu hình Matbao API")
async def get_config(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return _get_config(db)


@router.put("/config", response_model=ConfigResponse, summary="Lưu cấu hình Matbao API")
async def update_config(
    body: ConfigUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    cfg = _get_config(db)
    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(cfg, k, v)
    # Xoá cache Bearer nếu API key thay đổi
    if "matbao_api_key" in updates and cfg.matbao_api_key in _bearer_cache:
        del _bearer_cache[cfg.matbao_api_key]
    db.commit()
    db.refresh(cfg)
    return cfg


@router.post("/test-token", summary="Kiểm tra API key hợp lệ")
async def test_token(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    """Thử lấy Bearer token để xác nhận API key đúng."""
    cfg = _get_config(db)
    # Force refresh
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
    """
    Proxy đến POST /hoa-don-dau-vao/load-data của Matbao.
    Tự động lấy/renew Bearer token từ API key đã cấu hình.
    """
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
