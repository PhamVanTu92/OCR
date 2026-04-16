"""
Database initialisation & seed script.

Creates all tables and inserts sample data for testing:
  - 3 organisations (tree structure)
  - 1 document category + 1 document type with fields & tables
  - 1 test user

Usage:
  python -m scripts.init_db
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, SessionLocal
from app.models.base import Base
from app.models.organization import Organization
from app.models.user import User, UserOrganization
from app.models.document_type import (
    DocumentCategory,
    DocumentType,
    DocumentTypeField,
    DocumentTypeTable,
    DocumentTypeTableColumn,
)


def init():
    print("Creating tables …")
    Base.metadata.create_all(bind=engine)
    print("Tables created.")


def seed():
    db = SessionLocal()
    try:
        # Skip if data already exists
        if db.query(Organization).first():
            print("Seed data already exists – skipping.")
            return

        # ── Organizations ────────────────────────────────────────────────────
        hq = Organization(name="Trụ sở chính", code="HQ", level=0, path="")
        db.add(hq)
        db.flush()

        finance = Organization(
            name="Phòng Tài chính", code="FIN", parent_id=hq.id,
            level=1, path=str(hq.id),
        )
        it = Organization(
            name="Phòng CNTT", code="IT", parent_id=hq.id,
            level=1, path=str(hq.id),
        )
        db.add_all([finance, it])
        db.flush()

        accounting = Organization(
            name="Tổ Kế toán", code="ACC", parent_id=finance.id,
            level=2, path=f"{hq.id}/{finance.id}",
        )
        db.add(accounting)
        db.flush()

        # ── Test user ────────────────────────────────────────────────────────
        test_user = User(
            keycloak_id="test-kc-001",
            email="admin@ocr.local",
            full_name="Admin Test",
            username="admin_test",
        )
        db.add(test_user)
        db.flush()

        db.add(UserOrganization(
            user_id=test_user.id,
            organization_id=hq.id,
            role="manager",
            is_primary=True,
        ))

        # ── Document category & type ─────────────────────────────────────────
        cat = DocumentCategory(
            name="Hóa đơn", code="INV",
            description="Các loại hóa đơn mua bán hàng hóa, dịch vụ",
        )
        db.add(cat)
        db.flush()

        dt = DocumentType(
            category_id=cat.id,
            name="Hóa đơn GTGT",
            code="VAT_INV",
            description="Hóa đơn giá trị gia tăng",
            system_prompt=(
                "Bạn là chuyên gia trích xuất hóa đơn giá trị gia tăng (VAT invoice) Việt Nam. "
                "Hãy trích xuất chính xác mọi trường thông tin và bảng hàng hóa. "
                "Số tiền phải là số (không dấu phân cách nghìn). Ngày theo định dạng DD/MM/YYYY."
            ),
        )
        db.add(dt)
        db.flush()

        # Fields
        fields = [
            ("Ký hiệu hóa đơn",  "invoice_serial", "string", True, 1),
            ("Số hóa đơn",        "invoice_number", "string", True, 2),
            ("Ngày lập",          "issue_date",     "date",   True, 3),
            ("Tên người bán",     "seller_name",    "string", True, 4),
            ("MST người bán",     "seller_tax_id",  "string", True, 5),
            ("Tên người mua",     "buyer_name",     "string", True, 6),
            ("MST người mua",     "buyer_tax_id",   "string", False, 7),
            ("Cộng tiền hàng",    "subtotal",       "number", True, 8),
            ("Thuế suất (%)",     "tax_rate",       "number", False, 9),
            ("Tiền thuế GTGT",    "tax_amount",     "number", True, 10),
            ("Tổng thanh toán",   "total_amount",   "number", True, 11),
        ]
        for fname, fkey, ftype, req, order in fields:
            db.add(DocumentTypeField(
                document_type_id=dt.id,
                field_name=fname, field_key=fkey,
                field_type=ftype, is_required=req,
                sort_order=order,
            ))

        # Table: line items
        tbl = DocumentTypeTable(
            document_type_id=dt.id,
            table_name="Danh mục hàng hóa, dịch vụ",
            table_key="line_items",
            sort_order=1,
        )
        db.add(tbl)
        db.flush()

        cols = [
            ("STT",       "stt",        "number",  False, 1),
            ("Tên hàng",  "item_name",  "string",  True,  2),
            ("ĐVT",       "unit",       "string",  False, 3),
            ("Số lượng",  "quantity",   "number",  True,  4),
            ("Đơn giá",   "unit_price", "number",  True,  5),
            ("Thành tiền", "amount",    "number",  True,  6),
        ]
        for cname, ckey, ctype, req, order in cols:
            db.add(DocumentTypeTableColumn(
                table_id=tbl.id,
                column_name=cname, column_key=ckey,
                column_type=ctype, is_required=req,
                sort_order=order,
            ))

        db.commit()
        print("Seed data inserted successfully!")

    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    init()
    seed()
