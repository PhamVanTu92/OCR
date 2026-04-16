from sqlalchemy import Column, Integer, Boolean, ForeignKey, BigInteger, Float, JSON
from sqlalchemy import Unicode, UnicodeText
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class Document(Base, TimestampMixin):
    """
    Represents an uploaded file waiting for or having completed OCR processing.
    JSON columns are stored as NVARCHAR(MAX) in SQL Server.

    Status flow:
        pending → processing → completed → confirmed
                                         ↑ (can revert via unconfirm)
    """

    __tablename__ = "documents"

    id               = Column(Integer, primary_key=True, index=True)
    organization_id  = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    user_id          = Column(Integer, ForeignKey("users.id"), nullable=False)
    document_type_id = Column(Integer, ForeignKey("document_types.id"), nullable=False)

    file_name     = Column(Unicode(500),  nullable=False)
    file_path     = Column(Unicode(1000), nullable=False)
    file_size     = Column(BigInteger, nullable=True)
    mime_type     = Column(Unicode(100),  nullable=True)

    # pending | processing | completed | confirmed | failed
    status        = Column(Unicode(50), default="pending", index=True)
    error_message = Column(UnicodeText, nullable=True)
    processed_at  = Column(Unicode(50),  nullable=True)   # ISO-8601 timestamp string

    # Confirmation tracking
    confirmed_at           = Column(Unicode(50),  nullable=True)
    confirmed_by_user_id   = Column(Integer, ForeignKey("users.id"), nullable=True)

    organization  = relationship("Organization", back_populates="documents")
    user          = relationship("User",         back_populates="documents",
                                 foreign_keys="Document.user_id")
    confirmed_by  = relationship("User",         back_populates="confirmed_documents",
                                 foreign_keys="Document.confirmed_by_user_id")
    document_type = relationship("DocumentType", back_populates="documents")
    result        = relationship("DocumentResult", back_populates="document", uselist=False)


class DocumentResult(Base, TimestampMixin):
    """Stores the raw OCR text and the structured extraction results."""

    __tablename__ = "document_results"

    id                = Column(Integer, primary_key=True, index=True)
    document_id       = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"),
                                unique=True, nullable=False)

    raw_text          = Column(UnicodeText, nullable=True)
    extracted_fields  = Column(JSON, nullable=True)    # {"invoice_number": "...", ...}
    extracted_tables  = Column(JSON, nullable=True)    # {"line_items": [{...}, ...]}
    confidence_score  = Column(Float, nullable=True)
    processing_time_ms = Column(Integer, nullable=True)
    model_used        = Column(Unicode(100), nullable=True)

    # Manual editing tracking
    is_manually_edited   = Column(Boolean, default=False, nullable=False)
    edited_at            = Column(Unicode(50),  nullable=True)
    edited_by_user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)

    document  = relationship("Document", back_populates="result")
    edited_by = relationship("User", foreign_keys="DocumentResult.edited_by_user_id")
