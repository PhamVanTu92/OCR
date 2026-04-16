"""
Migration script – thêm các cột mới vào bảng đã tồn tại.

Chạy:
    python -m scripts.migrate
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from app.core.database import engine


MIGRATIONS = [
    # ── organizations ────────────────────────────────────────────────────────
    (
        "organizations.group_name",
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME='organizations' AND COLUMN_NAME='group_name'",
        "ALTER TABLE organizations ADD group_name NVARCHAR(100) NULL",
    ),
    (
        "organizations.manager_name",
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME='organizations' AND COLUMN_NAME='manager_name'",
        "ALTER TABLE organizations ADD manager_name NVARCHAR(255) NULL",
    ),

    # ── document_types ───────────────────────────────────────────────────────
    (
        "document_types.allowed_formats",
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME='document_types' AND COLUMN_NAME='allowed_formats'",
        "ALTER TABLE document_types ADD allowed_formats NVARCHAR(MAX) NULL",
    ),
    (
        "document_types.allow_multiple",
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME='document_types' AND COLUMN_NAME='allow_multiple'",
        "ALTER TABLE document_types ADD allow_multiple BIT NOT NULL DEFAULT 0",
    ),

    # ── document_type_fields ─────────────────────────────────────────────────
    (
        "document_type_fields.position",
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME='document_type_fields' AND COLUMN_NAME='position'",
        "ALTER TABLE document_type_fields ADD position NVARCHAR(20) NOT NULL DEFAULT 'HEADER'",
    ),
]


def run():
    with engine.connect() as conn:
        for label, check_sql, alter_sql in MIGRATIONS:
            result = conn.execute(text(check_sql)).fetchone()
            if result:
                print(f"  [skip]  {label} – đã tồn tại")
            else:
                conn.execute(text(alter_sql))
                conn.commit()
                print(f"  [added] {label}")

    print("\nMigration hoàn tất.")


if __name__ == "__main__":
    run()
