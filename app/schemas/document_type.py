from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ─── Category ─────────────────────────────────────────────────────────────────

class DocumentCategoryCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class DocumentCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class DocumentCategoryResponse(BaseModel):
    id: int
    name: str
    code: str
    description: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Field ────────────────────────────────────────────────────────────────────

class DocumentTypeFieldCreate(BaseModel):
    field_name: str
    field_key: str
    field_type: str = "string"          # string | number | date | boolean
    position: str = "HEADER"            # HEADER | FOOTER
    is_required: bool = False
    description: Optional[str] = None
    sort_order: int = 0


class DocumentTypeFieldUpdate(BaseModel):
    field_name: Optional[str] = None
    field_key: Optional[str] = None
    field_type: Optional[str] = None
    position: Optional[str] = None
    is_required: Optional[bool] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class DocumentTypeFieldResponse(BaseModel):
    id: int
    document_type_id: int
    field_name: str
    field_key: str
    field_type: str
    position: str
    is_required: bool
    description: Optional[str]
    sort_order: int

    model_config = {"from_attributes": True}


# ─── Table Column ─────────────────────────────────────────────────────────────

class DocumentTypeTableColumnCreate(BaseModel):
    column_name: str
    column_key: str
    column_type: str = "string"
    is_required: bool = False
    sort_order: int = 0


class DocumentTypeTableColumnUpdate(BaseModel):
    column_name: Optional[str] = None
    column_key: Optional[str] = None
    column_type: Optional[str] = None
    is_required: Optional[bool] = None
    sort_order: Optional[int] = None


class DocumentTypeTableColumnResponse(BaseModel):
    id: int
    table_id: int
    column_name: str
    column_key: str
    column_type: str
    is_required: bool
    sort_order: int

    model_config = {"from_attributes": True}


# ─── Table ────────────────────────────────────────────────────────────────────

class DocumentTypeTableCreate(BaseModel):
    table_name: str
    table_key: str
    description: Optional[str] = None
    sort_order: int = 0
    columns: List[DocumentTypeTableColumnCreate] = []


class DocumentTypeTableUpdate(BaseModel):
    table_name: Optional[str] = None
    table_key: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class DocumentTypeTableResponse(BaseModel):
    id: int
    document_type_id: int
    table_name: str
    table_key: str
    description: Optional[str]
    sort_order: int
    columns: List[DocumentTypeTableColumnResponse] = []

    model_config = {"from_attributes": True}


# ─── Document Type ────────────────────────────────────────────────────────────

class DocumentTypeCreate(BaseModel):
    category_id: int
    name: str
    code: str
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    allowed_formats: Optional[List[str]] = ["PDF"]   # ["PDF","JPG","PNG","DOCX","XLSX"]
    allow_multiple: bool = False
    fields: List[DocumentTypeFieldCreate] = []
    tables: List[DocumentTypeTableCreate] = []


class DocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    allowed_formats: Optional[List[str]] = None
    allow_multiple: Optional[bool] = None
    is_active: Optional[bool] = None
    # Khi gửi kèm fields / tables → thay thế toàn bộ (full-replace)
    fields: Optional[List[DocumentTypeFieldCreate]] = None
    tables: Optional[List[DocumentTypeTableCreate]] = None


class DocumentTypeResponse(BaseModel):
    id: int
    category_id: int
    name: str
    code: str
    description: Optional[str]
    system_prompt: Optional[str]
    allowed_formats: Optional[List[str]]
    allow_multiple: bool
    is_active: bool
    created_at: datetime
    fields: List[DocumentTypeFieldResponse] = []
    tables: List[DocumentTypeTableResponse] = []

    model_config = {"from_attributes": True}
