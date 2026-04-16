"""
Integration configuration router.

Mounted under /document-types/{dt_id}/integrations for CRUD,
and /ocr/documents/{doc_id}/... for preview & export actions.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.document import Document, DocumentResult
from app.models.document_type import DocumentType
from app.models.integration import IntegrationConfig, IntegrationExportLog
from app.schemas.integration import (
    ExportLogResponse,
    IntegrationConfigCreate,
    IntegrationConfigResponse,
    IntegrationConfigUpdate,
    PreviewExportResponse,
    SapTestResponse,
)
from app.services import sap_b1_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Integrations"])


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_integration_or_404(db: Session, int_id: int, dt_id: int) -> IntegrationConfig:
    obj = db.query(IntegrationConfig).filter(
        IntegrationConfig.id == int_id,
        IntegrationConfig.document_type_id == dt_id,
    ).first()
    if not obj:
        raise NotFoundError("Không tìm thấy cấu hình tích hợp")
    return obj


def _build_payload(
    integration: IntegrationConfig,
    extracted_fields: Dict[str, Any],
    extracted_tables: Dict[str, List[Dict[str, Any]]],
) -> tuple[Dict[str, Any], List[str]]:
    """
    Apply the integration's field_mappings and table_mappings to the OCR result
    and return (payload_dict, warnings_list).
    """
    warnings: List[str] = []
    body: Dict[str, Any] = {}

    field_mappings  = integration.field_mappings  or []
    table_mappings  = integration.table_mappings  or []

    # ── Header fields ──────────────────────────────────────────────────────────
    for fm in field_mappings:
        src = fm.get("source_key") if isinstance(fm, dict) else fm.source_key
        tgt = fm.get("target_key") if isinstance(fm, dict) else fm.target_key
        req = fm.get("is_required", False) if isinstance(fm, dict) else fm.is_required
        dflt = fm.get("default_value") if isinstance(fm, dict) else fm.default_value

        val = extracted_fields.get(src, dflt)
        if val is None and req:
            warnings.append(f"Trường bắt buộc '{src}' không có giá trị")
        body[tgt] = val

    # ── Tables ─────────────────────────────────────────────────────────────────
    for tm in table_mappings:
        src_tbl  = tm.get("source_table_key") if isinstance(tm, dict) else tm.source_table_key
        tgt_key  = tm.get("target_key")        if isinstance(tm, dict) else tm.target_key
        col_maps = tm.get("columns", [])        if isinstance(tm, dict) else tm.columns

        source_rows = extracted_tables.get(src_tbl, [])
        mapped_rows: List[Dict[str, Any]] = []

        for row in source_rows:
            new_row: Dict[str, Any] = {}
            if col_maps:
                for cm in col_maps:
                    sc = cm.get("source_key") if isinstance(cm, dict) else cm.source_key
                    tc = cm.get("target_key") if isinstance(cm, dict) else cm.target_key
                    new_row[tc] = row.get(sc)
            else:
                # No column mapping → pass all columns through as-is
                new_row = dict(row)
            mapped_rows.append(new_row)

        body[tgt_key] = mapped_rows

    # ── Optional envelope ──────────────────────────────────────────────────────
    if integration.root_key:
        payload = {integration.root_key: body}
    else:
        payload = body

    return payload, warnings


# ═══════════════════════════════════════════════════════════════════════════════
# CRUD – /document-types/{dt_id}/integrations
# ═══════════════════════════════════════════════════════════════════════════════

@router.get(
    "/document-types/{dt_id}/integrations",
    response_model=List[IntegrationConfigResponse],
    summary="Danh sách cấu hình tích hợp của loại chứng từ",
)
async def list_integrations(
    dt_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    if not db.query(DocumentType).filter(DocumentType.id == dt_id).first():
        raise NotFoundError("Không tìm thấy loại chứng từ")
    return db.query(IntegrationConfig).filter(
        IntegrationConfig.document_type_id == dt_id
    ).all()


@router.post(
    "/document-types/{dt_id}/integrations",
    response_model=IntegrationConfigResponse,
    status_code=201,
    summary="Tạo cấu hình tích hợp",
)
async def create_integration(
    dt_id: int,
    data: IntegrationConfigCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    if not db.query(DocumentType).filter(DocumentType.id == dt_id).first():
        raise NotFoundError("Không tìm thấy loại chứng từ")

    # code unique per document type
    exists = db.query(IntegrationConfig).filter(
        IntegrationConfig.document_type_id == dt_id,
        IntegrationConfig.code == data.code,
    ).first()
    if exists:
        raise ConflictError(f"Mã tích hợp '{data.code}' đã tồn tại cho loại chứng từ này")

    # model_dump() serialises nested Pydantic models → plain dicts suitable
    # for SQLAlchemy JSON columns.
    obj = IntegrationConfig(document_type_id=dt_id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get(
    "/document-types/{dt_id}/integrations/{int_id}",
    response_model=IntegrationConfigResponse,
    summary="Chi tiết cấu hình tích hợp",
)
async def get_integration(
    dt_id: int,
    int_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return _get_integration_or_404(db, int_id, dt_id)


@router.put(
    "/document-types/{dt_id}/integrations/{int_id}",
    response_model=IntegrationConfigResponse,
    summary="Cập nhật cấu hình tích hợp",
)
async def update_integration(
    dt_id: int,
    int_id: int,
    data: IntegrationConfigUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    obj = _get_integration_or_404(db, int_id, dt_id)

    for k, v in data.model_dump(exclude_none=True).items():
        setattr(obj, k, v)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete(
    "/document-types/{dt_id}/integrations/{int_id}",
    status_code=204,
    summary="Xoá cấu hình tích hợp",
)
async def delete_integration(
    dt_id: int,
    int_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    obj = _get_integration_or_404(db, int_id, dt_id)
    db.delete(obj)
    db.commit()


@router.post(
    "/document-types/{dt_id}/integrations/{int_id}/test-sap",
    response_model=SapTestResponse,
    summary="Kiểm tra kết nối SAP Business One",
)
async def test_sap_connection(
    dt_id: int,
    int_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    """
    Attempt a fresh SAP B1 login (ignoring cache) and return the result.
    Useful for verifying credentials before saving or after a connection error.
    """
    integration = _get_integration_or_404(db, int_id, dt_id)

    if integration.auth_type != "sap_b1":
        raise BadRequestError("Cấu hình này không sử dụng xác thực SAP B1")
    if not integration.sap_base_url:
        raise BadRequestError("Chưa cấu hình SAP Base URL (sap_base_url)")
    if not integration.sap_company_db:
        raise BadRequestError("Chưa cấu hình SAP Company DB (sap_company_db)")
    if not integration.auth_header_name:
        raise BadRequestError("Chưa cấu hình SAP username (auth_header_name)")
    if not integration.auth_value:
        raise BadRequestError("Chưa cấu hình SAP password (auth_value)")

    # Force a fresh login by invalidating any cached session
    sap_b1_service.invalidate_session(integration.id)

    try:
        b1session, routeid = await sap_b1_service.get_b1_session(
            integration_id=integration.id,
            base_url=integration.sap_base_url,
            company_db=integration.sap_company_db,
            username=integration.auth_header_name,
            password=integration.auth_value,
        )
        return SapTestResponse(
            success=True,
            session_id=b1session[:12] + "…",   # partial, for display only
            routeid=routeid or None,
            message="Kết nối SAP B1 thành công",
        )
    except httpx.HTTPStatusError as exc:
        return SapTestResponse(
            success=False,
            message=f"SAP B1 trả về lỗi HTTP {exc.response.status_code}: {exc.response.text[:200]}",
        )
    except Exception as exc:
        return SapTestResponse(
            success=False,
            message=f"Kết nối thất bại: {exc}",
        )


# ═══════════════════════════════════════════════════════════════════════════════
# PREVIEW & EXPORT – /ocr/documents/{doc_id}/...
# ═══════════════════════════════════════════════════════════════════════════════

def _resolve_document(db, doc_id, current_user) -> Document:
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền truy cập chứng từ này")
    if doc.status not in ("completed", "confirmed"):
        raise BadRequestError("Chứng từ chưa có kết quả OCR để xuất dữ liệu")
    return doc


@router.post(
    "/ocr/documents/{doc_id}/preview-export/{int_id}",
    response_model=PreviewExportResponse,
    summary="Xem trước JSON sẽ gửi đến hệ thống tích hợp",
)
async def preview_export(
    doc_id: int,
    int_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = _resolve_document(db, doc_id, current_user)
    result = db.query(DocumentResult).filter(DocumentResult.document_id == doc_id).first()
    if not result:
        raise NotFoundError("Chứng từ chưa có kết quả OCR")

    integration = db.query(IntegrationConfig).filter(
        IntegrationConfig.id == int_id,
        IntegrationConfig.document_type_id == doc.document_type_id,
    ).first()
    if not integration:
        raise NotFoundError("Không tìm thấy cấu hình tích hợp")

    payload, warnings = _build_payload(
        integration,
        result.extracted_fields or {},
        result.extracted_tables or {},
    )

    return PreviewExportResponse(
        integration_id=integration.id,
        integration_name=integration.name,
        document_id=doc.id,
        payload=payload,
        warnings=warnings,
    )


@router.post(
    "/ocr/documents/{doc_id}/export/{int_id}",
    response_model=ExportLogResponse,
    summary="Xuất dữ liệu đến hệ thống tích hợp",
)
async def export_document(
    doc_id: int,
    int_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = _resolve_document(db, doc_id, current_user)
    result = db.query(DocumentResult).filter(DocumentResult.document_id == doc_id).first()
    if not result:
        raise NotFoundError("Chứng từ chưa có kết quả OCR")

    integration = db.query(IntegrationConfig).filter(
        IntegrationConfig.id == int_id,
        IntegrationConfig.document_type_id == doc.document_type_id,
        IntegrationConfig.is_active == True,
    ).first()
    if not integration:
        raise NotFoundError("Không tìm thấy cấu hình tích hợp hoặc đã bị tắt")

    payload, _ = _build_payload(
        integration,
        result.extracted_fields or {},
        result.extracted_tables or {},
    )

    exported_at = datetime.now(timezone.utc).isoformat()
    log_status  = "success"
    resp_status: Optional[int] = None
    err_msg: Optional[str] = None

    # ── Actual HTTP push (only if target_url is set) ───────────────────────────
    if integration.target_url:
        headers: Dict[str, str] = {"Content-Type": "application/json"}

        if integration.auth_type == "bearer" and integration.auth_value:
            hdr = integration.auth_header_name or "Authorization"
            headers[hdr] = f"Bearer {integration.auth_value}"

        elif integration.auth_type == "api_key" and integration.auth_value:
            hdr = integration.auth_header_name or "X-API-Key"
            headers[hdr] = integration.auth_value

        elif integration.auth_type == "basic" and integration.auth_value:
            hdr = integration.auth_header_name or "Authorization"
            headers[hdr] = f"Basic {integration.auth_value}"

        elif integration.auth_type == "sap_b1":
            # SAP Business One – session-cookie authentication
            if not integration.sap_base_url:
                log_status = "failed"
                err_msg = "SAP B1: sap_base_url chưa được cấu hình"
            elif not integration.sap_company_db:
                log_status = "failed"
                err_msg = "SAP B1: sap_company_db chưa được cấu hình"
            elif not integration.auth_header_name:
                log_status = "failed"
                err_msg = "SAP B1: username (auth_header_name) chưa được cấu hình"
            elif not integration.auth_value:
                log_status = "failed"
                err_msg = "SAP B1: password (auth_value) chưa được cấu hình"
            else:
                try:
                    b1session, routeid = await sap_b1_service.get_b1_session(
                        integration_id=integration.id,
                        base_url=integration.sap_base_url,
                        company_db=integration.sap_company_db,
                        username=integration.auth_header_name,
                        password=integration.auth_value,
                    )
                    headers["Cookie"] = sap_b1_service.build_sap_cookie_header(
                        b1session, routeid
                    )
                except Exception as exc:
                    log_status = "failed"
                    err_msg = f"SAP B1 login thất bại: {exc}"
                    logger.exception(
                        "SAP B1 login failed for integration=%d doc=%d", int_id, doc_id
                    )

        if log_status == "success":   # skip HTTP call if auth already failed
            try:
                # SAP B1 uses self-signed certs; verify=False for sap_b1 auth type
                ssl_verify = integration.auth_type != "sap_b1"
                async with httpx.AsyncClient(timeout=30, verify=ssl_verify) as client:
                    method = (integration.http_method or "POST").upper()
                    resp   = await client.request(
                        method, integration.target_url,
                        json=payload, headers=headers,
                    )
                    resp_status = resp.status_code
                    if not resp.is_success:
                        # If 401 on SAP B1, invalidate the cached session so next call re-logins
                        if integration.auth_type == "sap_b1" and resp_status == 401:
                            sap_b1_service.invalidate_session(integration.id)
                        log_status = "failed"
                        err_msg = f"HTTP {resp_status}: {resp.text[:500]}"
            except Exception as exc:
                log_status = "failed"
                err_msg = str(exc)
                logger.exception(
                    "Integration export failed for doc=%d int=%d: %s", doc_id, int_id, exc
                )
    else:
        logger.info(
            "Integration %d has no target_url – payload built but not pushed (doc=%d)",
            int_id, doc_id,
        )

    # ── Persist log ────────────────────────────────────────────────────────────
    log = IntegrationExportLog(
        integration_config_id=int_id,
        document_id=doc_id,
        status=log_status,
        response_status=resp_status,
        error_message=err_msg,
        exported_at=exported_at,
        exported_payload=payload,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get(
    "/ocr/documents/{doc_id}/export-logs",
    response_model=List[ExportLogResponse],
    summary="Lịch sử xuất dữ liệu của chứng từ",
)
async def list_export_logs(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền truy cập")
    return (
        db.query(IntegrationExportLog)
        .filter(IntegrationExportLog.document_id == doc_id)
        .order_by(IntegrationExportLog.id.desc())
        .all()
    )
