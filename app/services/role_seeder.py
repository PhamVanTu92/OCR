"""
Seed built-in permissions and system roles on application startup.
Safe to run multiple times – uses INSERT-if-not-exists logic.
"""

import logging
from sqlalchemy.orm import Session

from app.models.role import Permission, RolePermission, SystemRole

logger = logging.getLogger(__name__)

# ─── Canonical permission list ────────────────────────────────────────────────
# (code, name, category, description)
PERMISSIONS: list[tuple[str, str, str, str]] = [
    # Tổ chức
    ("org.view",        "Xem cơ cấu tổ chức",        "Tổ chức",       "Xem danh sách và cây đơn vị"),
    ("org.create",      "Thêm đơn vị",                "Tổ chức",       "Tạo phòng ban / đơn vị mới"),
    ("org.edit",        "Chỉnh sửa đơn vị",           "Tổ chức",       "Cập nhật thông tin đơn vị"),
    ("org.delete",      "Vô hiệu hoá đơn vị",         "Tổ chức",       "Vô hiệu hoá đơn vị"),
    # Loại chứng từ
    ("doctype.view",    "Xem loại chứng từ",          "Loại chứng từ", "Xem danh sách và chi tiết"),
    ("doctype.create",  "Thêm loại chứng từ",         "Loại chứng từ", "Tạo loại và danh mục mới"),
    ("doctype.edit",    "Chỉnh sửa loại chứng từ",    "Loại chứng từ", "Cập nhật cấu trúc trường"),
    ("doctype.delete",  "Xoá loại chứng từ",          "Loại chứng từ", "Vô hiệu hoá loại chứng từ"),
    # OCR
    ("ocr.view",        "Xem chứng từ OCR",           "OCR",           "Xem danh sách chứng từ"),
    ("ocr.upload",      "Tải lên chứng từ",           "OCR",           "Upload file để xử lý OCR"),
    ("ocr.edit",        "Chỉnh sửa kết quả OCR",      "OCR",           "Sửa trường trích xuất thủ công"),
    ("ocr.confirm",     "Xác nhận chứng từ",          "OCR",           "Xác nhận / huỷ xác nhận"),
    ("ocr.retry",       "Xử lý lại chứng từ",         "OCR",           "Retry các chứng từ lỗi"),
    # Tích hợp
    ("integration.view",   "Xem cấu hình tích hợp",  "Tích hợp",      "Xem danh sách integration"),
    ("integration.create", "Thêm tích hợp",           "Tích hợp",      "Tạo cấu hình mới"),
    ("integration.edit",   "Chỉnh sửa tích hợp",     "Tích hợp",      "Cập nhật cấu hình tích hợp"),
    ("integration.delete", "Xoá tích hợp",            "Tích hợp",      "Xoá cấu hình tích hợp"),
    ("integration.export", "Xuất dữ liệu tích hợp",  "Tích hợp",      "Đẩy dữ liệu ra hệ thống ngoài"),
    # Người dùng
    ("user.view",       "Xem người dùng",             "Người dùng",    "Xem danh sách người dùng"),
    ("user.edit",       "Chỉnh sửa người dùng",       "Người dùng",    "Cập nhật thông tin cá nhân"),
    ("user.deactivate", "Vô hiệu hoá người dùng",     "Người dùng",    "Khoá / mở khoá tài khoản"),
    ("user.assign_role","Gán vai trò",                 "Người dùng",    "Gán / thu hồi vai trò người dùng"),
    ("user.assign_org", "Phân bổ đơn vị",             "Người dùng",    "Gán người dùng vào đơn vị"),
    # Vai trò
    ("role.view",       "Xem vai trò",                "Vai trò",       "Xem danh sách vai trò"),
    ("role.create",     "Thêm vai trò",               "Vai trò",       "Tạo vai trò mới"),
    ("role.edit",       "Chỉnh sửa vai trò",          "Vai trò",       "Cập nhật quyền trong vai trò"),
    ("role.delete",     "Xoá vai trò",                "Vai trò",       "Xoá vai trò không phải hệ thống"),
    # API Token
    ("token.view",      "Xem API token",              "API Token",     "Xem danh sách token của mình"),
    ("token.create",    "Tạo API token",              "API Token",     "Tạo token mới"),
    ("token.revoke",    "Thu hồi API token",          "API Token",     "Vô hiệu hoá token"),
]

# ─── System role definitions ──────────────────────────────────────────────────
# (name, display_name, description, color, [permission_codes])
_ALL = [p[0] for p in PERMISSIONS]

SYSTEM_ROLES: list[tuple[str, str, str, str, list[str]]] = [
    (
        "admin",
        "Quản trị viên",
        "Toàn quyền hệ thống",
        "red",
        _ALL,
    ),
    (
        "doc_manager",
        "Quản lý chứng từ",
        "Quản lý loại chứng từ, OCR và tích hợp",
        "indigo",
        [
            "doctype.view", "doctype.create", "doctype.edit", "doctype.delete",
            "ocr.view", "ocr.upload", "ocr.edit", "ocr.confirm", "ocr.retry",
            "integration.view", "integration.create", "integration.edit",
            "integration.delete", "integration.export",
        ],
    ),
    (
        "org_manager",
        "Quản lý tổ chức",
        "Quản lý cơ cấu tổ chức và người dùng",
        "blue",
        [
            "org.view", "org.create", "org.edit", "org.delete",
            "user.view", "user.edit", "user.deactivate", "user.assign_role", "user.assign_org",
            "role.view",
        ],
    ),
    (
        "ocr_operator",
        "Nhân viên OCR",
        "Tải lên, xem và xác nhận chứng từ",
        "green",
        [
            "ocr.view", "ocr.upload", "ocr.edit", "ocr.confirm",
            "doctype.view",
        ],
    ),
    (
        "viewer",
        "Chỉ xem",
        "Quyền xem tất cả nhưng không thể thay đổi",
        "gray",
        [
            "org.view", "doctype.view", "ocr.view",
            "integration.view", "user.view", "role.view",
        ],
    ),
]


# ─── Seeder function ──────────────────────────────────────────────────────────

def seed_roles_and_permissions(db: Session) -> None:
    """Idempotent: inserts missing permissions and system roles."""

    # 1. Upsert permissions
    perm_map: dict[str, Permission] = {}
    for code, name, category, description in PERMISSIONS:
        existing = db.query(Permission).filter(Permission.code == code).first()
        if not existing:
            existing = Permission(
                code=code, name=name, category=category, description=description
            )
            db.add(existing)
            db.flush()
            logger.debug("Seeded permission: %s", code)
        else:
            # Update display fields in case they changed
            existing.name = name
            existing.category = category
        perm_map[code] = existing

    db.flush()

    # 2. Upsert system roles
    for name, display_name, description, color, perm_codes in SYSTEM_ROLES:
        role = db.query(SystemRole).filter(SystemRole.name == name).first()
        if not role:
            role = SystemRole(
                name=name,
                display_name=display_name,
                description=description,
                is_system=True,
                color=color,
            )
            db.add(role)
            db.flush()
            logger.debug("Seeded system role: %s", name)
        else:
            role.display_name = display_name
            role.description = description
            role.color = color
            role.is_system = True

        # Sync permissions
        existing_perm_ids = {rp.permission_id for rp in role.role_permissions}
        desired_perm_ids  = {perm_map[c].id for c in perm_codes if c in perm_map}

        for pid in desired_perm_ids - existing_perm_ids:
            db.add(RolePermission(role_id=role.id, permission_id=pid))

        for rp in role.role_permissions:
            if rp.permission_id not in desired_perm_ids:
                db.delete(rp)

    db.commit()
    logger.info("Role/Permission seeding complete")
