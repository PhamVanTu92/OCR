"""
Models cho hệ thống hóa đơn đầu vào:
  - PurchaseInvoiceConfig   : cấu hình kết nối Matbao + SAP
  - SupplierMapping         : MST → Mã nhà cung cấp SAP
  - ProductMapping          : Tên hàng hóa → Mã vật liệu / ĐVT / Mã thuế SAP
  - SavedPurchaseInvoice    : Hóa đơn đã lưu vào CSDL
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, Unicode, UnicodeText

from app.models.base import Base


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Cấu hình kết nối ──────────────────────────────────────────────────────────

class PurchaseInvoiceConfig(Base):
    __tablename__ = "purchase_invoice_configs"

    id               = Column(Integer,        primary_key=True, index=True)
    name             = Column(Unicode(200),   nullable=False, default="Cấu hình mặc định")
    matbao_base_url  = Column(Unicode(500),   nullable=False,
                              default="https://api-hoadondauvao.matbao.in")
    matbao_api_key   = Column(UnicodeText,    nullable=True)
    # SAP B1 Service Layer
    sap_base_url     = Column(Unicode(500),   nullable=True)   # VD: https://IP:50000
    sap_company_db   = Column(Unicode(200),   nullable=True)   # CompanyDB
    sap_username     = Column(Unicode(100),   nullable=True)
    sap_password     = Column(UnicodeText,    nullable=True)
    is_active        = Column(Boolean,        nullable=False, default=True)
    created_at       = Column(Unicode(50),    default=_now)
    updated_at       = Column(Unicode(50),    default=_now, onupdate=_now)


# ─── Ánh xạ nhà cung cấp ────────────────────────────────────────────────────────

class SupplierMapping(Base):
    """MST người bán → Mã nhà cung cấp trong SAP (Vendor Code)"""
    __tablename__ = "purchase_invoice_supplier_mappings"

    id             = Column(Integer,       primary_key=True, index=True)
    tax_code       = Column(Unicode(20),   nullable=False, index=True)   # MST người bán
    supplier_code  = Column(Unicode(50),   nullable=False)               # Vendor code SAP
    supplier_name  = Column(Unicode(300),  nullable=True)                # Tên gợi nhớ
    config_id      = Column(Integer, ForeignKey("purchase_invoice_configs.id"), nullable=True)
    created_at     = Column(Unicode(50),   default=_now)
    updated_at     = Column(Unicode(50),   default=_now, onupdate=_now)


# ─── Ánh xạ hàng hóa ────────────────────────────────────────────────────────────

class ProductMapping(Base):
    """Tên hàng hóa → Mã vật liệu / Mã ĐVT / Mã thuế SAP"""
    __tablename__ = "purchase_invoice_product_mappings"

    id            = Column(Integer,        primary_key=True, index=True)
    product_name  = Column(Unicode(500),   nullable=False)   # Tên hàng hóa (THHDVu)
    material_code = Column(Unicode(50),    nullable=True)    # Mã hàng SAP (Material)
    unit_code     = Column(Unicode(20),    nullable=True)    # Mã ĐVT SAP (UoM)
    tax_code_sap  = Column(Unicode(20),    nullable=True)    # Mã thuế SAP
    config_id     = Column(Integer, ForeignKey("purchase_invoice_configs.id"), nullable=True)
    created_at    = Column(Unicode(50),    default=_now)
    updated_at    = Column(Unicode(50),    default=_now, onupdate=_now)


# ─── Hóa đơn đã lưu ─────────────────────────────────────────────────────────────

class ExternalApiSource(Base):
    """Cấu hình API nguồn dữ liệu ngoài (SAP OData, ERP…) để tra cứu theo ngữ cảnh hóa đơn"""
    __tablename__ = "purchase_invoice_api_sources"

    id              = Column(Integer,      primary_key=True, index=True)
    name            = Column(Unicode(200), nullable=False)
    description     = Column(UnicodeText,  nullable=True)
    base_url        = Column(UnicodeText,  nullable=False)   # VD: https://IP:50000/b1s/v1/Orders
    select_fields   = Column(UnicodeText,  nullable=True)   # Comma-sep cho $select
    filter_template = Column(UnicodeText,  nullable=True)   # $filter với {placeholder}
    extra_params    = Column(UnicodeText,  nullable=True)   # VD: $skip=40&$orderby=DocDate desc
    field_mappings  = Column(UnicodeText,  nullable=True)   # JSON: [{api_field,label,ocr_field}]
    use_sap_auth    = Column(Boolean,      nullable=False, default=True)
    category        = Column(Unicode(20),  nullable=True)   # None | 'seller' | 'line_item'
    is_active       = Column(Boolean,      nullable=False, default=True)
    config_id       = Column(Integer, ForeignKey("purchase_invoice_configs.id"), nullable=True)
    created_at      = Column(Unicode(50),  default=_now)
    updated_at      = Column(Unicode(50),  default=_now, onupdate=_now)


class SavedPurchaseInvoice(Base):
    """Bản ghi hóa đơn đầu vào đã được lưu vào CSDL nội bộ"""
    __tablename__ = "purchase_invoice_records"

    id               = Column(Integer,       primary_key=True, index=True)
    inv_id           = Column(Unicode(100),  nullable=False, unique=True, index=True)  # InvID từ Matbao
    inv_no           = Column(Unicode(50),   nullable=True)    # SHDon
    khhd             = Column(Unicode(100),  nullable=True)    # KHMSHDon + KHHDon
    inv_date         = Column(Unicode(20),   nullable=True)    # NLap
    seller_tax_code  = Column(Unicode(20),   nullable=True, index=True)
    seller_name      = Column(Unicode(300),  nullable=True)
    buyer_tax_code   = Column(Unicode(20),   nullable=True)
    buyer_name       = Column(Unicode(300),  nullable=True)
    total_before_tax = Column(Float,         nullable=True)
    total_tax        = Column(Float,         nullable=True)
    total_amount     = Column(Float,         nullable=True)
    kq_phan_tich     = Column(Unicode(200),  nullable=True)    # KQPhanTich
    tthai            = Column(Integer,       nullable=True)    # TThai (0=hợp lệ...)
    # SAP mapping
    supplier_code    = Column(Unicode(50),   nullable=True)    # Mã NCC SAP
    reference_po     = Column(Unicode(100),  nullable=True)    # Số đơn hàng tham chiếu SAP
    # Raw data
    raw_data         = Column(UnicodeText,   nullable=True)    # JSON toàn bộ hóa đơn
    config_id        = Column(Integer, ForeignKey("purchase_invoice_configs.id"), nullable=True)
    created_at       = Column(Unicode(50),   default=_now)
    updated_at       = Column(Unicode(50),   default=_now, onupdate=_now)
