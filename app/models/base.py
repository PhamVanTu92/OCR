from sqlalchemy.orm import DeclarativeBase, MappedColumn, mapped_column
from sqlalchemy import DateTime, func


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    """Adds created_at / updated_at to any model."""

    created_at: MappedColumn[DateTime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: MappedColumn[DateTime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
