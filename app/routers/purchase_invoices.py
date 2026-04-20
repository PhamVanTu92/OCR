"""
Router: Hóa đơn đầu vào (Matbao Purchase Invoice API)

Endpoints:
  GET  /purchase-invoices/config          – lấy cấu hình hiện tại
  PUT  /purchase-invoices/config          – lưu cấu hình
  GET  /purchase-invoices/list            – danh sách hóa đơn (proxy → Matbao)
  GET  /purchase-invoices/list-tct        – danh sách hóa đơn v2 (TCT)
  GET  /purchase-invoices/detail-by-url   – chi tiết từ URL XML
  GET  /purchase-invoices/captcha         – lấy captcha TCT
  POST /purchase-invoices/login-tct       – đăng nhập TCT
"""

import logging
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

_TIMEOUT = 30.0   # giây – Matbao API có thể chậm


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ConfigResponse(BaseModel):
    id:               int
    name:             str
    matbao_base_url:  str
    matbao_token:     Optional[str]
    tct_username:     Optional[str]
    tct_password:     Optional[str]
    is_active:        bool
    created_at:       Optional[str]
    updated_at:       Optional[str]

    class Config:
        from_attributes = True


class ConfigUpdate(BaseModel):
    name:             Optional[str]             = None
    matbao_base_url:  Optional[str]             = None
    matbao_token:     Optional[str]             = None
    tct_username:     Optional[str]             = None
    tct_password:     Optional[str]             = None
    is_active:        Optional[bool]            = None


class LoginTCTRequest(BaseModel):
    username: str
    password: str
    cvalue:   str
    ckey:     str


# ─── Helpers ──────────────────────────────────────────────────────────────────

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


def _matbao_headers(cfg: PurchaseInvoiceConfig) -> dict:
    if not cfg.matbao_token:
        raise HTTPException(
            status_code=400,
            detail="Chưa cấu hình Matbao API token. Vui lòng thiết lập trong phần Cài đặt.",
        )
    return {
        "Authorization": f"Bearer {cfg.matbao_token}",
        "Content-Type": "application/json",
    }


def _call_matbao(method: str, url: str, **kwargs) -> Any:
    """Gọi Matbao API và trả về data, ném HTTPException nếu lỗi."""
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
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    return cfg


# ─── Invoice list v1 ─────────────────────────────────────────────────────────

@router.get("/list", summary="Danh sách hóa đơn đầu vào (Matbao v1)")
async def list_invoices(
    comName:        Optional[str]  = None,
    comTaxCode:     Optional[str]  = None,
    no:             Optional[int]  = None,
    fromDateYMD:    Optional[str]  = None,
    toDateYMD:      Optional[str]  = None,
    trangthai:      int            = -1,
    pattern:        Optional[str]  = None,
    serial:         Optional[str]  = None,
    typeSearchDate: int            = 0,
    typeDataPDF:    int            = 0,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    headers = _matbao_headers(cfg)
    params = {k: v for k, v in {
        "comName":        comName,
        "comTaxCode":     comTaxCode,
        "no":             no,
        "fromDateYMD":    fromDateYMD,
        "toDateYMD":      toDateYMD,
        "trangthai":      trangthai,
        "pattern":        pattern,
        "serial":         serial,
        "typeSearchDate": typeSearchDate,
        "typeDataPDF":    typeDataPDF,
    }.items() if v is not None}

    url = f"{cfg.matbao_base_url}/hoa-don-dau-vao/load-data"
    data = _call_matbao("get", url, headers=headers, params=params)
    return {"data": data or [], "total": len(data) if data else 0}


# ─── Invoice list v2 (TCT) ────────────────────────────────────────────────────

@router.get("/list-tct", summary="Danh sách hóa đơn đầu vào (TCT v2)")
async def list_invoices_tct(
    comName:     Optional[str] = None,
    comTaxCode:  Optional[str] = None,
    no:          Optional[int] = None,
    fromDateYMD: Optional[str] = None,
    toDateYMD:   Optional[str] = None,
    trangthai:   int           = -1,
    loaihoadon:  int           = -1,
    pattern:     Optional[str] = None,
    serial:      Optional[str] = None,
    typeDataPDF: int           = 0,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    headers = _matbao_headers(cfg)
    params = {k: v for k, v in {
        "comName":     comName,
        "comTaxCode":  comTaxCode,
        "no":          no,
        "fromDateYMD": fromDateYMD,
        "toDateYMD":   toDateYMD,
        "trangthai":   trangthai,
        "loaihoadon":  loaihoadon,
        "pattern":     pattern,
        "serial":      serial,
        "typeDataPDF": typeDataPDF,
    }.items() if v is not None}

    url = f"{cfg.matbao_base_url}/hoa-don-dau-vao/load-data-tct"
    data = _call_matbao("get", url, headers=headers, params=params)
    return {"data": data or [], "total": len(data) if data else 0}


# ─── Invoice detail ───────────────────────────────────────────────────────────

@router.get("/detail-by-url", summary="Chi tiết hóa đơn từ URL XML")
async def detail_by_url(
    url_xml:          str,
    kiem_tra_hop_le:  int = 0,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    headers = _matbao_headers(cfg)
    url = f"{cfg.matbao_base_url}/hoa-don-dau-vao/detail-by-url"
    data = _call_matbao("get", url, headers=headers, params={
        "url_xml":         url_xml,
        "kiem_tra_hop_le": kiem_tra_hop_le,
    })
    return data


# ─── Captcha ──────────────────────────────────────────────────────────────────

@router.get("/captcha", summary="Lấy captcha đăng nhập TCT")
async def get_captcha(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    headers = _matbao_headers(cfg)
    url = f"{cfg.matbao_base_url}/hoa-don-dau-vao/get-captcha"
    data = _call_matbao("get", url, headers=headers)
    return data   # { key, content (svg) }


# ─── Login TCT ────────────────────────────────────────────────────────────────

@router.post("/login-tct", summary="Đăng nhập tài khoản TCT")
async def login_tct(
    body: LoginTCTRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_config(db)
    headers = _matbao_headers(cfg)
    url = f"{cfg.matbao_base_url}/hoa-don-dau-vao/login-tct"
    data = _call_matbao("post", url, headers=headers, json=body.model_dump())
    # Lưu lại thông tin đăng nhập TCT vào config
    cfg.tct_username = body.username
    cfg.tct_password = body.password
    db.commit()
    return {"message": data or "Đăng nhập TCT thành công"}
