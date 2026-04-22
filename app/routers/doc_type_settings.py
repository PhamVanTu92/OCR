"""
Router: Thiết lập SAP B1 + API nguồn dữ liệu ngoài theo loại chứng từ

Endpoints:
  GET  /document-types/{dt_id}/sap-config
  PUT  /document-types/{dt_id}/sap-config
  POST /document-types/{dt_id}/sap-config/test-login
  GET  /document-types/{dt_id}/api-sources
  POST /document-types/{dt_id}/api-sources
  PUT  /document-types/{dt_id}/api-sources/{source_id}
  DELETE /document-types/{dt_id}/api-sources/{source_id}
  POST /document-types/{dt_id}/api-sources/{source_id}/invoke
"""

import json
import logging
import time
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.doc_type_settings import DocTypeSapConfig, DocTypeApiSource

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/document-types", tags=["Thiết lập loại chứng từ"])

# ─── SAP B1 session cache (per doc type) ─────────────────────────────────────
# Key = "{sap_base_url}|{sap_company_db}|{sap_username}"
_dt_sap_session_cache: dict[str, dict] = {}


def _sap_cache_key(cfg: DocTypeSapConfig) -> str:
    return f"{cfg.sap_base_url}|{cfg.sap_company_db}|{cfg.sap_username}"


def _get_sap_b1_session(cfg: DocTypeSapConfig) -> str:
    """Lấy SAP B1 SessionId từ cache hoặc gọi Login API."""
    if not cfg.sap_base_url:
        raise HTTPException(status_code=400,
            detail="Chưa cấu hình SAP Base URL.")
    if not cfg.sap_company_db or not cfg.sap_username or not cfg.sap_password:
        raise HTTPException(status_code=400,
            detail="Chưa đủ thông tin đăng nhập SAP B1 (CompanyDB / Username / Password).")

    key = _sap_cache_key(cfg)
    cached = _dt_sap_session_cache.get(key)
    if cached and time.time() < cached["exp"] - 60:
        return cached["session_id"]

    login_url = f"{cfg.sap_base_url.rstrip('/')}/b1s/v1/Login"
    logger.info("Logging in to SAP B1 (doc_type=%s) at %s", cfg.document_type_id, login_url)
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
        raise HTTPException(status_code=401,
            detail=f"SAP B1 đăng nhập thất bại ({resp.status_code}): {msg}")

    try:
        body = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="SAP B1 Login trả về dữ liệu không hợp lệ")

    session_id = body.get("SessionId")
    if not session_id:
        raise HTTPException(status_code=502, detail="SAP B1 không trả về SessionId")

    timeout_min = int(body.get("SessionTimeout", 30))
    _dt_sap_session_cache[key] = {
        "session_id": session_id,
        "exp":         time.time() + timeout_min * 60,
        "version":     body.get("Version", ""),
        "timeout_min": timeout_min,
    }
    logger.info("SAP B1 Session cached (doc_type=%s, company=%s)", cfg.document_type_id, cfg.sap_company_db)
    return session_id


def _sap_b1_headers(cfg: DocTypeSapConfig, session_id: str) -> dict:
    return {
        "Cookie":       f"B1SESSION={session_id}; CompanyDB={cfg.sap_company_db}",
        "Content-Type": "application/json",
        "Accept":       "application/json",
    }


# ─── DB helpers ───────────────────────────────────────────────────────────────

def _get_or_create_sap_cfg(db: Session, dt_id: int) -> DocTypeSapConfig:
    cfg = db.query(DocTypeSapConfig).filter(
        DocTypeSapConfig.document_type_id == dt_id
    ).first()
    if not cfg:
        cfg = DocTypeSapConfig(document_type_id=dt_id)
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _serialize_api_source(src: DocTypeApiSource) -> dict:
    mappings: list = []
    if src.field_mappings:
        try:
            mappings = json.loads(src.field_mappings)
        except Exception:
            mappings = []
    return {
        "id":              src.id,
        "document_type_id": src.document_type_id,
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


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class SapConfigResponse(BaseModel):
    id:               int
    document_type_id: int
    sap_base_url:     Optional[str]
    sap_company_db:   Optional[str]
    sap_username:     Optional[str]
    # sap_password NOT returned
    is_active:        bool
    created_at:       Optional[str]
    updated_at:       Optional[str]

    class Config:
        from_attributes = True


class SapConfigUpdate(BaseModel):
    sap_base_url:   Optional[str]  = None
    sap_company_db: Optional[str]  = None
    sap_username:   Optional[str]  = None
    sap_password:   Optional[str]  = None
    is_active:      Optional[bool] = None


class ApiFieldMapping(BaseModel):
    api_field: str
    label:     str
    ocr_field: Optional[str] = None


class ApiSourceCreate(BaseModel):
    name:            str
    description:     Optional[str]       = None
    base_url:        str
    select_fields:   Optional[str]       = None
    filter_template: Optional[str]       = None
    extra_params:    Optional[str]       = None
    field_mappings:  List[ApiFieldMapping] = []
    use_sap_auth:    bool                = True
    category:        Optional[str]       = None   # None | 'seller' | 'line_item'
    is_active:       bool                = True


class ApiSourceUpdate(BaseModel):
    name:            Optional[str]              = None
    description:     Optional[str]              = None
    base_url:        Optional[str]              = None
    select_fields:   Optional[str]              = None
    filter_template: Optional[str]              = None
    extra_params:    Optional[str]              = None
    field_mappings:  Optional[List[ApiFieldMapping]] = None
    use_sap_auth:    Optional[bool]             = None
    category:        Optional[str]              = None
    is_active:       Optional[bool]             = None


class InvokeRequest(BaseModel):
    context: dict[str, Optional[str]] = {}


# ─── SAP Config endpoints ─────────────────────────────────────────────────────

@router.get("/{dt_id}/sap-config", response_model=SapConfigResponse,
            summary="Lấy cấu hình SAP cho loại chứng từ")
async def get_sap_config(
    dt_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return _get_or_create_sap_cfg(db, dt_id)


@router.put("/{dt_id}/sap-config", response_model=SapConfigResponse,
            summary="Lưu cấu hình SAP cho loại chứng từ")
async def update_sap_config(
    dt_id: int,
    body: SapConfigUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    cfg = _get_or_create_sap_cfg(db, dt_id)
    updates = body.model_dump(exclude_none=True)
    sap_changed = {"sap_base_url", "sap_company_db", "sap_username", "sap_password"}.intersection(updates)
    if sap_changed:
        _dt_sap_session_cache.pop(_sap_cache_key(cfg), None)
    for k, v in updates.items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    return cfg


@router.post("/{dt_id}/sap-config/test-login",
             summary="Kiểm tra đăng nhập SAP B1 cho loại chứng từ")
async def test_sap_login(
    dt_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    cfg = _get_or_create_sap_cfg(db, dt_id)
    # Force re-login
    key = _sap_cache_key(cfg)
    _dt_sap_session_cache.pop(key, None)
    session_id = _get_sap_b1_session(cfg)
    cached = _dt_sap_session_cache.get(key, {})
    return {
        "success": True,
        "message": f"Đăng nhập SAP B1 thành công (company: {cfg.sap_company_db})",
        "session_preview": session_id[:12] + "...",
        "version": cached.get("version", ""),
        "expires_in_minutes": cached.get("timeout_min", 30),
    }


# ─── API Sources CRUD ─────────────────────────────────────────────────────────

@router.get("/{dt_id}/api-sources", summary="Danh sách API nguồn dữ liệu của loại chứng từ")
async def list_api_sources(
    dt_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    sources = db.query(DocTypeApiSource).filter(
        DocTypeApiSource.document_type_id == dt_id
    ).order_by(DocTypeApiSource.name).all()
    return [_serialize_api_source(s) for s in sources]


@router.post("/{dt_id}/api-sources", summary="Tạo API nguồn dữ liệu cho loại chứng từ", status_code=201)
async def create_api_source(
    dt_id: int,
    body: ApiSourceCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    src = DocTypeApiSource(
        document_type_id = dt_id,
        name             = body.name,
        description      = body.description,
        base_url         = body.base_url,
        select_fields    = body.select_fields,
        filter_template  = body.filter_template,
        extra_params     = body.extra_params,
        field_mappings   = json.dumps([m.model_dump() for m in body.field_mappings], ensure_ascii=False),
        use_sap_auth     = body.use_sap_auth,
        category         = body.category,
        is_active        = body.is_active,
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return _serialize_api_source(src)


@router.put("/{dt_id}/api-sources/{source_id}", summary="Cập nhật API nguồn dữ liệu")
async def update_api_source(
    dt_id: int,
    source_id: int,
    body: ApiSourceUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    src = db.get(DocTypeApiSource, source_id)
    if not src or src.document_type_id != dt_id:
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


@router.delete("/{dt_id}/api-sources/{source_id}", summary="Xoá API nguồn dữ liệu")
async def delete_api_source(
    dt_id: int,
    source_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    src = db.get(DocTypeApiSource, source_id)
    if not src or src.document_type_id != dt_id:
        raise HTTPException(status_code=404, detail="Không tìm thấy API source")
    db.delete(src)
    db.commit()
    return {"ok": True}


@router.post("/{dt_id}/api-sources/{source_id}/invoke", summary="Gọi API nguồn dữ liệu")
async def invoke_api_source(
    dt_id: int,
    source_id: int,
    body: InvokeRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    src = db.get(DocTypeApiSource, source_id)
    if not src or src.document_type_id != dt_id:
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
        cfg = _get_or_create_sap_cfg(db, dt_id)
        session_id = _get_sap_b1_session(cfg)
        headers = _sap_b1_headers(cfg, session_id)
    else:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}

    # ── HTTP call ─────────────────────────────────────────────────────────────
    base_url = src.base_url.rstrip("/")
    logger.info("Invoking API source '%s' (dt=%d): GET %s", src.name, dt_id, base_url)
    try:
        with httpx.Client(timeout=30.0, verify=False) as http:
            resp = http.get(base_url, headers=headers, params=params)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="API timeout")
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối API: {exc}")

    if resp.status_code == 401 and src.use_sap_auth:
        cfg = _get_or_create_sap_cfg(db, dt_id)
        _dt_sap_session_cache.pop(_sap_cache_key(cfg), None)
        raise HTTPException(status_code=401,
            detail="Session hết hạn. Vui lòng thử lại để tự động đăng nhập mới.")

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
