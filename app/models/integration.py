"""
Integration configuration model.

Each DocumentType can have multiple IntegrationConfig records,
one per target external system.  The mapping is stored as JSON columns
to keep the schema simple while allowing full flexibility.

field_mappings  – list of header field mappings
  [{"source_key": "invoice_number", "target_key": "invoiceNo",
    "is_required": false, "default_value": null}, ...]

table_mappings  – list of table (array) mappings
  [{"source_table_key": "line_items",
    "target_key": "items",
    "columns": [
        {"source_key": "product_name", "target_key": "name"},
        {"source_key": "qty",          "target_key": "quantity"}
    ]}, ...]

root_key        – optional envelope wrapper:
    null  → payload is the top-level object
    "data" → payload is wrapped: {"data": {...}}
"""

from sqlalchemy import Column, Integer, Boolean, ForeignKey, JSON
from sqlalchemy import Unicode, UnicodeText
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class IntegrationConfig(Base, TimestampMixin):
    __tablename__ = "integration_configs"

    id               = Column(Integer, primary_key=True, index=True)
    document_type_id = Column(Integer, ForeignKey("document_types.id", ondelete="CASCADE"),
                               nullable=False, index=True)

    # ── Identity ──────────────────────────────────────────────────────────────
    name        = Column(Unicode(200), nullable=False)
    code        = Column(Unicode(100), nullable=False)   # unique per doc_type
    description = Column(UnicodeText, nullable=True)
    is_active   = Column(Boolean, default=True)

    # ── Target endpoint (optional – for auto-push) ────────────────────────────
    target_url        = Column(Unicode(500), nullable=True)
    http_method       = Column(Unicode(10),  default="POST")    # POST | PUT | PATCH
    auth_type         = Column(Unicode(50),  nullable=True)     # bearer | api_key | basic | sap_b1 | none
    auth_header_name  = Column(Unicode(100), nullable=True)     # header name  OR  SAP username
    auth_value        = Column(UnicodeText,  nullable=True)     # token / key  OR  SAP password

    # ── SAP Business One specific ─────────────────────────────────────────────
    # auth_header_name  → SAP username (reused)
    # auth_value        → SAP password (reused)
    # target_url        → specific API endpoint, e.g. https://host:50000/b1s/v1/Drafts
    sap_company_db    = Column(Unicode(200), nullable=True)     # SAP CompanyDB
    sap_base_url      = Column(Unicode(500), nullable=True)     # https://host:50000 (login base)

    # ── Output structure ──────────────────────────────────────────────────────
    root_key       = Column(Unicode(100), nullable=True)   # optional envelope key

    # ── Mapping config (JSON) ─────────────────────────────────────────────────
    field_mappings = Column(JSON, nullable=True)    # List[FieldMappingItem]
    table_mappings = Column(JSON, nullable=True)    # List[TableMappingItem]

    document_type = relationship("DocumentType", back_populates="integrations")
    export_logs   = relationship("IntegrationExportLog", back_populates="integration",
                                 cascade="all, delete-orphan")


class IntegrationExportLog(Base, TimestampMixin):
    """Records every push attempt to an external system."""
    __tablename__ = "integration_export_logs"

    id                    = Column(Integer, primary_key=True, index=True)
    integration_config_id = Column(Integer,
                                   ForeignKey("integration_configs.id", ondelete="CASCADE"),
                                   nullable=False, index=True)
    document_id           = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"),
                                   nullable=False, index=True)

    status          = Column(Unicode(50),  nullable=False)   # success | failed
    response_status = Column(Integer, nullable=True)         # HTTP response code
    error_message   = Column(UnicodeText, nullable=True)
    exported_at     = Column(Unicode(50),  nullable=False)
    exported_payload = Column(JSON, nullable=True)

    integration = relationship("IntegrationConfig", back_populates="export_logs")
    document    = relationship("Document")
