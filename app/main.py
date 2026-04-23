"""
FOXAI NATIVE – FastAPI Application Entry Point
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, get_db
from app.models.base import Base
from app.routers import auth, document_types, integrations, ocr, organizations, users
from app.routers import roles as roles_router
from app.routers import api_tokens as api_tokens_router
from app.routers import purchase_invoices as purchase_invoices_router
from app.routers import doc_type_settings as doc_type_settings_router

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s │ %(levelname)-7s │ %(name)s │ %(message)s",
)
logger = logging.getLogger(__name__)


def _run_column_migrations() -> None:
    """
    Add new columns to existing tables (SQL Server compatible).
    Uses IF NOT EXISTS guards so it is safe to run on every startup.
    """
    migrations: list[tuple[str, str, str]] = [
        # (table_name, column_name, sql_type)
        ("documents",         "confirmed_at",         "NVARCHAR(50)  NULL"),
        ("documents",         "confirmed_by_user_id",  "INT           NULL"),
        ("document_results",  "is_manually_edited",    "BIT           NOT NULL DEFAULT 0"),
        ("document_results",  "edited_at",             "NVARCHAR(50)  NULL"),
        ("document_results",  "edited_by_user_id",     "INT           NULL"),
        # SAP B1 integration
        ("integration_configs", "sap_company_db",      "NVARCHAR(200) NULL"),
        ("integration_configs", "sap_base_url",        "NVARCHAR(500) NULL"),
        # Purchase invoice – rename matbao_token → matbao_api_key
        ("purchase_invoice_configs", "matbao_api_key",  "NVARCHAR(MAX) NULL"),
        # SAP B1 integration fields on config
        ("purchase_invoice_configs", "sap_base_url",    "NVARCHAR(500) NULL"),
        ("purchase_invoice_configs", "sap_company_db",  "NVARCHAR(200) NULL"),
        ("purchase_invoice_configs", "sap_username",    "NVARCHAR(100) NULL"),
        ("purchase_invoice_configs", "sap_password",    "NVARCHAR(MAX) NULL"),
        # External API source category
        ("purchase_invoice_api_sources", "category",   "NVARCHAR(20)  NULL"),
        # Per-doc-type API sources: source_table_key column
        ("doc_type_api_sources", "source_table_key", "NVARCHAR(100) NULL"),
    ]
    # ── Đổi VARCHAR → NVARCHAR cho purchase_invoice_configs ──────────────────
    # SQL Server: ALTER COLUMN không hỗ trợ DEFAULT inline → chỉ đổi kiểu dữ liệu
    nvarchar_alters = [
        # (table, column, new_type_def)
        ("purchase_invoice_configs", "name",            "NVARCHAR(200) NOT NULL"),
        ("purchase_invoice_configs", "matbao_base_url", "NVARCHAR(500) NOT NULL"),
        ("purchase_invoice_configs", "created_at",      "NVARCHAR(50)  NULL"),
        ("purchase_invoice_configs", "updated_at",      "NVARCHAR(50)  NULL"),
    ]
    with engine.connect() as conn:
        for table, col, new_type in nvarchar_alters:
            conn.execute(text(f"""
                IF EXISTS (
                    SELECT 1 FROM sys.columns c
                    JOIN sys.types t ON c.user_type_id = t.user_type_id
                    WHERE c.object_id = OBJECT_ID(N'{table}')
                      AND c.name      = N'{col}'
                      AND t.name      = 'varchar'
                )
                BEGIN
                    ALTER TABLE [{table}] ALTER COLUMN [{col}] {new_type}
                END
            """))
        conn.commit()
    logger.info("NVARCHAR column migrations applied")
    with engine.connect() as conn:
        for table, col, col_def in migrations:
            conn.execute(text(f"""
                IF NOT EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'{table}') AND name = N'{col}'
                )
                BEGIN
                    ALTER TABLE [{table}] ADD [{col}] {col_def}
                END
            """))
        conn.commit()
    logger.info("Column migrations applied")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Creating database tables (if not exist) …")
    Base.metadata.create_all(bind=engine)
    _run_column_migrations()

    # Seed permissions and system roles
    try:
        from app.services.role_seeder import seed_roles_and_permissions
        db = next(get_db())
        seed_roles_and_permissions(db)
    except Exception as exc:
        logger.warning("Role seeding failed (non-fatal): %s", exc)

    logger.info("Application started")
    yield
    logger.info("Application shutting down")


app = FastAPI(
    title="FOXAI NATIVE",
    description=(
        "Hệ thống Quản trị & OCR trích xuất dữ liệu chứng từ động\n\n"
        "**Cách dùng Swagger:**\n"
        "1. Gọi `POST /api/v1/auth/token` để lấy `access_token`\n"
        "2. Click nút **Authorize 🔒** ở trên cùng, dán token vào (không cần 'Bearer')\n"
        "3. Tất cả request sau sẽ tự gắn header `Authorization: Bearer <token>`\n\n"
        "**API Token:**\n"
        "Tạo token dài hạn tại `POST /api/v1/auth/tokens` để tích hợp hệ thống ngoài."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth.router,              prefix=API_PREFIX)
app.include_router(api_tokens_router.router, prefix=API_PREFIX)
app.include_router(organizations.router,     prefix=API_PREFIX)
app.include_router(document_types.router,    prefix=API_PREFIX)
app.include_router(users.router,             prefix=API_PREFIX)
app.include_router(roles_router.router,      prefix=API_PREFIX)
app.include_router(ocr.router,               prefix=API_PREFIX)
app.include_router(integrations.router,              prefix=API_PREFIX)
app.include_router(purchase_invoices_router.router,  prefix=API_PREFIX)
app.include_router(doc_type_settings_router.router,  prefix=API_PREFIX)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


# ─── Custom OpenAPI – thêm BearerAuth scheme ──────────────────────────────────
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    schema.setdefault("components", {})
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT or API Token",
            "description": (
                "Nhập access_token lấy từ POST /api/v1/auth/token\n"
                "Hoặc API Token (oct_…) lấy từ POST /api/v1/auth/tokens"
            ),
        }
    }

    public_paths = {"/api/v1/auth/token", "/api/v1/auth/refresh", "/health"}
    for path, path_item in schema.get("paths", {}).items():
        if path in public_paths:
            continue
        for method_item in path_item.values():
            if isinstance(method_item, dict):
                method_item.setdefault("security", [{"BearerAuth": []}])

    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi  # type: ignore
