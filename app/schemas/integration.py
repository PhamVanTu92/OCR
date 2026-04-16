from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from datetime import datetime


# ── Mapping atoms ──────────────────────────────────────────────────────────────

class FieldMappingItem(BaseModel):
    """Maps one OCR header field → one target JSON key."""
    source_key:    str
    target_key:    str
    is_required:   bool = False
    default_value: Optional[str] = None


class ColumnMappingItem(BaseModel):
    """Maps one table column: OCR column_key → target JSON key."""
    source_key: str
    target_key: str


class TableMappingItem(BaseModel):
    """Maps one OCR table → a target JSON array, with per-column mappings."""
    source_table_key: str
    target_key:       str
    columns:          List[ColumnMappingItem] = []


# ── CRUD payloads ──────────────────────────────────────────────────────────────

class IntegrationConfigCreate(BaseModel):
    name:        str
    code:        str
    description: Optional[str] = None
    is_active:   bool = True

    # Target endpoint
    target_url:       Optional[str] = None
    http_method:      str = "POST"
    auth_type:        Optional[str] = None   # bearer | api_key | basic | sap_b1 | none
    auth_header_name: Optional[str] = None   # header name  OR  SAP username
    auth_value:       Optional[str] = None   # token / key  OR  SAP password

    # SAP Business One
    sap_base_url:   Optional[str] = None   # base URL for login: https://host:50000
    sap_company_db: Optional[str] = None   # CompanyDB name

    # Output envelope
    root_key: Optional[str] = None

    # Mapping
    field_mappings: Optional[List[FieldMappingItem]] = None
    table_mappings: Optional[List[TableMappingItem]] = None


class IntegrationConfigUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    is_active:   Optional[bool] = None

    target_url:       Optional[str] = None
    http_method:      Optional[str] = None
    auth_type:        Optional[str] = None
    auth_header_name: Optional[str] = None
    auth_value:       Optional[str] = None

    # SAP Business One
    sap_base_url:   Optional[str] = None
    sap_company_db: Optional[str] = None

    root_key: Optional[str] = None

    field_mappings: Optional[List[FieldMappingItem]] = None
    table_mappings: Optional[List[TableMappingItem]] = None


class IntegrationConfigResponse(BaseModel):
    id:              int
    document_type_id: int
    name:            str
    code:            str
    description:     Optional[str]
    is_active:       bool

    target_url:       Optional[str]
    http_method:      str
    auth_type:        Optional[str]
    auth_header_name: Optional[str]
    auth_value:       Optional[str]   # returned as-is; masking can be added at router level

    # SAP Business One
    sap_base_url:   Optional[str]
    sap_company_db: Optional[str]

    root_key:       Optional[str]
    field_mappings: Optional[List[FieldMappingItem]]
    table_mappings: Optional[List[TableMappingItem]]
    created_at:     datetime

    model_config = {"from_attributes": True}


# ── Export log ─────────────────────────────────────────────────────────────────

class ExportLogResponse(BaseModel):
    id:                    int
    integration_config_id: int
    document_id:           int
    status:                str
    response_status:       Optional[int]
    error_message:         Optional[str]
    exported_at:           str
    exported_payload:      Optional[Dict[str, Any]]
    created_at:            datetime

    model_config = {"from_attributes": True}


# ── Preview / export result ────────────────────────────────────────────────────

class PreviewExportResponse(BaseModel):
    integration_id:   int
    integration_name: str
    document_id:      int
    payload:          Dict[str, Any]
    warnings:         List[str] = []


# ── SAP B1 test connection ─────────────────────────────────────────────────────

class SapTestResponse(BaseModel):
    success:    bool
    session_id: Optional[str] = None
    routeid:    Optional[str] = None
    message:    str
