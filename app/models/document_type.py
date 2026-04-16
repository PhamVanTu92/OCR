from sqlalchemy import Column, Integer, Boolean, ForeignKey, JSON
from sqlalchemy import Unicode, UnicodeText
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class DocumentCategory(Base, TimestampMixin):
    __tablename__ = "document_categories"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(Unicode(255), nullable=False)
    code        = Column(Unicode(50),  unique=True, nullable=False, index=True)
    description = Column(UnicodeText, nullable=True)
    is_active   = Column(Boolean, default=True)

    document_types = relationship("DocumentType", back_populates="category")


class DocumentType(Base, TimestampMixin):
    __tablename__ = "document_types"

    id              = Column(Integer, primary_key=True, index=True)
    category_id     = Column(Integer, ForeignKey("document_categories.id"), nullable=False)
    name            = Column(Unicode(255), nullable=False)
    code            = Column(Unicode(50),  unique=True, nullable=False, index=True)
    description     = Column(UnicodeText,  nullable=True)
    system_prompt   = Column(UnicodeText,  nullable=True)
    allowed_formats = Column(JSON, nullable=True)     # ["PDF","JPG","PNG","DOCX","XLSX"]
    allow_multiple  = Column(Boolean, default=False)  # Cho phép chọn nhiều file
    is_active       = Column(Boolean, default=True)

    category  = relationship("DocumentCategory", back_populates="document_types")
    fields    = relationship(
        "DocumentTypeField", back_populates="document_type",
        cascade="all, delete-orphan", order_by="DocumentTypeField.sort_order",
    )
    tables    = relationship(
        "DocumentTypeTable", back_populates="document_type",
        cascade="all, delete-orphan", order_by="DocumentTypeTable.sort_order",
    )
    documents    = relationship("Document",          back_populates="document_type")
    integrations = relationship("IntegrationConfig", back_populates="document_type",
                                cascade="all, delete-orphan")


class DocumentTypeField(Base, TimestampMixin):
    __tablename__ = "document_type_fields"

    id               = Column(Integer, primary_key=True, index=True)
    document_type_id = Column(Integer, ForeignKey("document_types.id", ondelete="CASCADE"), nullable=False)
    field_name       = Column(Unicode(255), nullable=False)
    field_key        = Column(Unicode(100), nullable=False)
    field_type       = Column(Unicode(50),  default="string")   # string|number|date|boolean
    position         = Column(Unicode(20),  default="HEADER")   # HEADER | FOOTER
    is_required      = Column(Boolean, default=False)
    description      = Column(UnicodeText, nullable=True)
    sort_order       = Column(Integer, default=0)

    document_type = relationship("DocumentType", back_populates="fields")


class DocumentTypeTable(Base, TimestampMixin):
    __tablename__ = "document_type_tables"

    id               = Column(Integer, primary_key=True, index=True)
    document_type_id = Column(Integer, ForeignKey("document_types.id", ondelete="CASCADE"), nullable=False)
    table_name       = Column(Unicode(255), nullable=False)
    table_key        = Column(Unicode(100), nullable=False)
    description      = Column(UnicodeText, nullable=True)
    sort_order       = Column(Integer, default=0)

    document_type = relationship("DocumentType", back_populates="tables")
    columns       = relationship(
        "DocumentTypeTableColumn", back_populates="table",
        cascade="all, delete-orphan", order_by="DocumentTypeTableColumn.sort_order",
    )


class DocumentTypeTableColumn(Base, TimestampMixin):
    __tablename__ = "document_type_table_columns"

    id          = Column(Integer, primary_key=True, index=True)
    table_id    = Column(Integer, ForeignKey("document_type_tables.id", ondelete="CASCADE"), nullable=False)
    column_name = Column(Unicode(255), nullable=False)
    column_key  = Column(Unicode(100), nullable=False)
    column_type = Column(Unicode(50),  default="string")
    is_required = Column(Boolean, default=False)
    sort_order  = Column(Integer, default=0)

    table = relationship("DocumentTypeTable", back_populates="columns")
