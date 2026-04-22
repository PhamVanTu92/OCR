"""
Models for per-document-type settings:
  - DocTypeSapConfig   : SAP B1 connection config per document type
  - DocTypeApiSource   : External API source per document type
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, ForeignKey, Integer, Unicode, UnicodeText

from app.models.base import Base


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DocTypeSapConfig(Base):
    """Kết nối SAP B1 Service Layer cho từng loại chứng từ."""
    __tablename__ = "doc_type_sap_configs"

    id               = Column(Integer,      primary_key=True, index=True)
    document_type_id = Column(Integer, ForeignKey("document_types.id"), nullable=False,
                               unique=True, index=True)
    sap_base_url     = Column(Unicode(500), nullable=True)    # VD: https://IP:50000
    sap_company_db   = Column(Unicode(200), nullable=True)    # CompanyDB
    sap_username     = Column(Unicode(100), nullable=True)
    sap_password     = Column(UnicodeText,  nullable=True)
    is_active        = Column(Boolean,      nullable=False, default=True)
    created_at       = Column(Unicode(50),  default=_now)
    updated_at       = Column(Unicode(50),  default=_now, onupdate=_now)


class DocTypeApiSource(Base):
    """API nguồn dữ liệu ngoài (SAP OData, ERP…) cho từng loại chứng từ."""
    __tablename__ = "doc_type_api_sources"

    id               = Column(Integer,      primary_key=True, index=True)
    document_type_id = Column(Integer, ForeignKey("document_types.id"), nullable=False, index=True)
    name             = Column(Unicode(200), nullable=False)
    description      = Column(UnicodeText,  nullable=True)
    base_url         = Column(UnicodeText,  nullable=False)
    select_fields    = Column(UnicodeText,  nullable=True)    # comma-sep $select
    filter_template  = Column(UnicodeText,  nullable=True)    # $filter with {placeholder}
    extra_params     = Column(UnicodeText,  nullable=True)    # VD: $skip=0&$top=100
    field_mappings   = Column(UnicodeText,  nullable=True)    # JSON: [{api_field,label,ocr_field}]
    use_sap_auth     = Column(Boolean,      nullable=False, default=True)
    category         = Column(Unicode(20),  nullable=True)    # None | 'header' | 'line_item'
    source_table_key = Column(Unicode(100), nullable=True)    # table_key to iterate (category=line_item)
    is_active        = Column(Boolean,      nullable=False, default=True)
    created_at       = Column(Unicode(50),  default=_now)
    updated_at       = Column(Unicode(50),  default=_now, onupdate=_now)
