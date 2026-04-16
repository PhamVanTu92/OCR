"""
OCR upload & processing router.

Flow
────
POST /ocr/upload
  1. Validate file type & size
  2. Persist file to UPLOAD_DIR
  3. Create Document record (status=pending)
  4. Kick off background processing task

Background task
  1. extract_text_from_file()   → raw text via Gemini Vision
  2. extract_structured_data()  → typed JSON via Gemini LLM
  3. Save DocumentResult; set status=completed (or failed)
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.core.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.dependencies import CurrentUser, get_current_user
from app.models.document import Document, DocumentResult
from app.models.document_type import DocumentType
from app.schemas.document import (
    DocumentDetailResponse,
    DocumentListItem,
    DocumentResultUpdate,
    DocumentUploadResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ocr", tags=["OCR & Document Processing"])

ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


# ─── Background processing ───────────────────────────────────────────────────

async def _process_document(document_id: int) -> None:
    """
    Async background task:
    OCR → LLM extraction → persist DocumentResult.
    Opens its own DB session (background tasks run outside the request scope).
    """
    from app.services.llm_service import extract_structured_data
    from app.services.ocr_service import extract_text_from_file

    db: Session = SessionLocal()
    doc: Optional[Document] = None
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            logger.error("Document %d not found for processing", document_id)
            return

        doc.status = "processing"
        db.commit()

        # ── Step 1: OCR ──────────────────────────────────────────────────────
        raw_text = await extract_text_from_file(doc.file_path)

        # ── Step 2: Structured extraction ───────────────────────────────────
        document_type = (
            db.query(DocumentType).filter(DocumentType.id == doc.document_type_id).first()
        )
        extracted_data, processing_time_ms = await extract_structured_data(raw_text, document_type)

        # ── Step 3: Persist ──────────────────────────────────────────────────
        # Remove stale result if retrying
        existing_result = db.query(DocumentResult).filter(DocumentResult.document_id == doc.id).first()
        if existing_result:
            db.delete(existing_result)
            db.flush()

        db.add(
            DocumentResult(
                document_id=doc.id,
                raw_text=raw_text,
                extracted_fields=extracted_data.get("fields", {}),
                extracted_tables=extracted_data.get("tables", {}),
                processing_time_ms=processing_time_ms,
                model_used=settings.GEMINI_MODEL,
            )
        )
        doc.status = "completed"
        doc.processed_at = datetime.now(timezone.utc).isoformat()
        db.commit()
        logger.info(
            "Document %d processed successfully in %d ms", document_id, processing_time_ms
        )

    except Exception as exc:
        logger.exception("Failed to process document %d: %s", document_id, exc)
        if doc:
            doc.status = "failed"
            doc.error_message = str(exc)
            db.commit()
    finally:
        db.close()


# ─── Upload ──────────────────────────────────────────────────────────────────

@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=201,
    summary="Tải lên chứng từ để xử lý OCR",
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PDF hoặc ảnh (jpg/png/webp)"),
    document_type_id: int = Form(..., description="ID loại chứng từ"),
    organization_id: int = Form(..., description="ID đơn vị tổ chức"),
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    # ── Authorisation ────────────────────────────────────────────────────────
    if not current_user.is_admin() and organization_id not in current_user.org_ids:
        raise ForbiddenError("Bạn không có quyền truy cập đơn vị này")

    # ── Validate document type ───────────────────────────────────────────────
    doc_type = (
        db.query(DocumentType)
        .filter(DocumentType.id == document_type_id, DocumentType.is_active == True)
        .first()
    )
    if not doc_type:
        raise NotFoundError("Loại chứng từ không tồn tại hoặc đã bị vô hiệu hoá")

    # ── Validate file ────────────────────────────────────────────────────────
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise BadRequestError(
            f"Định dạng file không được hỗ trợ. Cho phép: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise BadRequestError(
            f"File quá lớn. Kích thước tối đa: {settings.MAX_FILE_SIZE // 1024 // 1024} MB"
        )

    # ── Persist file ─────────────────────────────────────────────────────────
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    unique_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
    with open(file_path, "wb") as fp:
        fp.write(content)

    # ── Create DB record ─────────────────────────────────────────────────────
    doc = Document(
        organization_id=organization_id,
        user_id=current_user.user.id,
        document_type_id=document_type_id,
        file_name=file.filename,
        file_path=file_path,
        file_size=len(content),
        mime_type=file.content_type,
        status="pending",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # ── Kick off async processing ─────────────────────────────────────────────
    background_tasks.add_task(_process_document, doc.id)
    logger.info("Document %d queued for processing (type=%s)", doc.id, doc_type.code)

    return doc


# ─── List & detail ───────────────────────────────────────────────────────────

@router.get("/documents", response_model=List[DocumentListItem], summary="Danh sách chứng từ")
async def list_documents(
    organization_id: Optional[int] = None,
    document_type_id: Optional[int] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 20,
    offset: int = 0,
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(Document)

    # Data scoping — admins see everything; others see only their org subtree
    if not current_user.is_admin():
        q = q.filter(Document.organization_id.in_(current_user.org_ids))

    if organization_id:
        if not current_user.is_admin() and organization_id not in current_user.org_ids:
            raise ForbiddenError("Không có quyền truy cập đơn vị này")
        q = q.filter(Document.organization_id == organization_id)

    if document_type_id:
        q = q.filter(Document.document_type_id == document_type_id)

    if status:
        q = q.filter(Document.status == status)

    if search:
        q = q.filter(Document.file_name.ilike(f"%{search}%"))

    total = q.count()
    if response is not None:
        response.headers["X-Total-Count"] = str(total)

    return q.order_by(Document.created_at.desc()).offset(offset).limit(limit).all()


@router.get(
    "/documents/{doc_id}",
    response_model=DocumentDetailResponse,
    summary="Chi tiết chứng từ + kết quả OCR",
)
async def get_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền truy cập chứng từ này")
    return doc


@router.get(
    "/documents/{doc_id}/file",
    summary="Xem file gốc đã upload",
)
async def get_document_file(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    from fastapi.responses import FileResponse

    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền truy cập chứng từ này")
    if not os.path.exists(doc.file_path):
        raise NotFoundError("File không còn tồn tại trên server")
    return FileResponse(
        path=doc.file_path,
        media_type=doc.mime_type or "application/octet-stream",
        filename=doc.file_name,
    )


@router.patch(
    "/documents/{doc_id}/result",
    response_model=DocumentDetailResponse,
    summary="Chỉnh sửa thủ công kết quả OCR",
)
async def update_document_result(
    doc_id: int,
    data: DocumentResultUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền truy cập chứng từ này")
    if doc.status not in ("completed", "confirmed"):
        raise BadRequestError(
            f"Chỉ có thể sửa khi trạng thái là 'completed' hoặc 'confirmed'. "
            f"Hiện tại: {doc.status}"
        )

    result = db.query(DocumentResult).filter(DocumentResult.document_id == doc_id).first()
    if not result:
        raise NotFoundError("Chưa có kết quả OCR để chỉnh sửa")

    if data.extracted_fields is not None:
        result.extracted_fields = data.extracted_fields
    if data.extracted_tables is not None:
        result.extracted_tables = data.extracted_tables

    result.is_manually_edited = True
    result.edited_at = datetime.now(timezone.utc).isoformat()
    result.edited_by_user_id = current_user.user.id

    db.commit()
    db.refresh(doc)
    return doc


@router.post(
    "/documents/{doc_id}/confirm",
    response_model=DocumentDetailResponse,
    summary="Xác nhận kết quả OCR sau khi kiểm tra",
)
async def confirm_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền truy cập chứng từ này")
    if doc.status != "completed":
        raise BadRequestError(
            f"Chỉ có thể xác nhận khi trạng thái là 'completed'. Hiện tại: {doc.status}"
        )

    doc.status = "confirmed"
    doc.confirmed_at = datetime.now(timezone.utc).isoformat()
    doc.confirmed_by_user_id = current_user.user.id
    db.commit()
    db.refresh(doc)
    return doc


@router.post(
    "/documents/{doc_id}/unconfirm",
    response_model=DocumentDetailResponse,
    summary="Huỷ xác nhận – chuyển về trạng thái chờ xác nhận",
)
async def unconfirm_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền truy cập chứng từ này")
    if doc.status != "confirmed":
        raise BadRequestError(
            f"Chỉ có thể huỷ xác nhận khi trạng thái là 'confirmed'. Hiện tại: {doc.status}"
        )

    doc.status = "completed"
    doc.confirmed_at = None
    doc.confirmed_by_user_id = None
    db.commit()
    db.refresh(doc)
    return doc


@router.post(
    "/documents/{doc_id}/retry",
    status_code=202,
    summary="Thử lại xử lý chứng từ bị lỗi",
)
async def retry_processing(
    doc_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise NotFoundError("Không tìm thấy chứng từ")
    if doc.status not in ("failed", "pending"):
        raise BadRequestError(f"Chỉ có thể thử lại khi trạng thái là 'failed' hoặc 'pending'. Hiện tại: {doc.status}")
    if not current_user.is_admin() and doc.organization_id not in current_user.org_ids:
        raise ForbiddenError("Không có quyền thao tác chứng từ này")

    doc.status = "pending"
    doc.error_message = None
    db.commit()

    background_tasks.add_task(_process_document, doc.id)
    return {"message": "Đã khởi động lại xử lý", "document_id": doc_id}
