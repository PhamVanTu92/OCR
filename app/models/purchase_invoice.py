"""
Model lưu cấu hình kết nối Matbao Purchase Invoice API.
Dùng Unicode/UnicodeText → NVARCHAR trong SQL Server (hỗ trợ tiếng Việt).
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Integer, Unicode, UnicodeText

from app.models.base import Base


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PurchaseInvoiceConfig(Base):
    __tablename__ = "purchase_invoice_configs"

    id               = Column(Integer,        primary_key=True, index=True)
    name             = Column(Unicode(200),   nullable=False, default="Cấu hình mặc định")
    matbao_base_url  = Column(Unicode(500),   nullable=False,
                              default="https://api-hoadondauvao.matbao.in")
    matbao_api_key   = Column(UnicodeText,    nullable=True)   # UUID API key → đổi lấy Bearer JWT
    is_active        = Column(Boolean,        nullable=False, default=True)
    created_at       = Column(Unicode(50),    default=_now)
    updated_at       = Column(Unicode(50),    default=_now, onupdate=_now)
