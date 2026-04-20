"""
Model lưu cấu hình kết nối Matbao Purchase Invoice API.
Mỗi tổ chức có thể có 1 cấu hình riêng.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Integer, String, Text

from app.models.base import Base


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class PurchaseInvoiceConfig(Base):
    __tablename__ = "purchase_invoice_configs"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(200), nullable=False, default="Cấu hình mặc định")
    matbao_base_url = Column(
        String(500),
        nullable=False,
        default="https://api-hoadondauvao.matbao.in",
    )
    matbao_token  = Column(Text, nullable=True)   # token Matbao
    # Thông tin đăng nhập TCT (Tổng cục Thuế) – lưu để tự động renew
    tct_username  = Column(String(200), nullable=True)   # MST
    tct_password  = Column(String(200), nullable=True)
    is_active     = Column(Boolean, nullable=False, default=True)
    created_at    = Column(String(50), default=_now)
    updated_at    = Column(String(50), default=_now, onupdate=_now)
