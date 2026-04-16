from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime


class DocumentUploadResponse(BaseModel):
    id: int
    file_name: str
    file_size: Optional[int]
    mime_type: Optional[str]
    document_type_id: int
    organization_id: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentResultResponse(BaseModel):
    id: int
    document_id: int
    raw_text: Optional[str]
    extracted_fields: Optional[Dict[str, Any]]
    extracted_tables: Optional[Dict[str, List[Dict[str, Any]]]]
    confidence_score: Optional[float]
    processing_time_ms: Optional[int]
    model_used: Optional[str]
    is_manually_edited: bool = False
    edited_at: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetailResponse(DocumentUploadResponse):
    error_message: Optional[str]
    processed_at: Optional[str]
    confirmed_at: Optional[str] = None
    confirmed_by_user_id: Optional[int] = None
    result: Optional[DocumentResultResponse] = None


class DocumentListItem(BaseModel):
    id: int
    file_name: str
    document_type_id: int
    organization_id: int
    status: str
    confirmed_at: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Edit / Confirm ─────────────────────────────────────────────────────────────

class DocumentResultUpdate(BaseModel):
    """Payload for PATCH /ocr/documents/{id}/result – manual correction of OCR output."""
    extracted_fields: Optional[Dict[str, Any]] = None
    extracted_tables: Optional[Dict[str, List[Dict[str, Any]]]] = None
