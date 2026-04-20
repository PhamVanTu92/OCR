"""
User management router.

POST   /users/                       – Tạo người dùng mới
GET    /users/                       – List users
GET    /users/{user_id}              – User detail (with roles)
PATCH  /users/{user_id}              – Update user (full_name, is_active)
DELETE /users/{user_id}              – Xoá người dùng
GET    /users/{user_id}/roles        – List roles assigned to user
POST   /users/{user_id}/roles        – Assign role
DELETE /users/{user_id}/roles/{rid}  – Remove role
GET    /users/{user_id}/organizations – Orgs of user
POST   /users/{user_id}/organizations – Assign to org
DELETE /users/{user_id}/organizations/{org_id} – Remove from org
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.role import SystemRole, UserRole
from app.models.user import User, UserOrganization
from app.models.organization import Organization
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["Users"])


# ─── Extra schemas ─────────────────────────────────────────────────────────────

class UserCreateRequest(BaseModel):
    username:  str
    email:     str
    full_name: Optional[str] = None
    password:  str
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


class RoleAssignRequest(BaseModel):
    role_id: int


class OrgAssignRequest(BaseModel):
    organization_id: int
    role: str = "member"   # manager | member | viewer
    is_primary: bool = False


class UserDetailResponse(UserResponse):
    roles: List[dict] = []
    organization_ids: List[int] = []


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _user_detail(user: User, db: Session) -> dict:
    roles = [
        {
            "id": ur.role.id,
            "name": ur.role.name,
            "display_name": ur.role.display_name,
            "color": ur.role.color,
        }
        for ur in db.query(UserRole).filter(UserRole.user_id == user.id).all()
    ]
    org_ids = [
        uo.organization_id
        for uo in db.query(UserOrganization).filter(UserOrganization.user_id == user.id).all()
    ]
    return {
        "id": user.id,
        "keycloak_id": user.keycloak_id,
        "email": user.email,
        "full_name": user.full_name,
        "username": user.username,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "roles": roles,
        "organization_ids": org_ids,
    }


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", summary="Danh sách người dùng")
async def list_users(
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    q = db.query(User)

    # Non-admin: only users in their org subtree
    if not current_user.is_admin():
        user_ids_in_scope = (
            db.query(UserOrganization.user_id)
            .filter(UserOrganization.organization_id.in_(current_user.org_ids))
            .distinct()
        )
        q = q.filter(User.id.in_(user_ids_in_scope))

    if is_active is not None:
        q = q.filter(User.is_active == is_active)

    if search:
        like = f"%{search}%"
        q = q.filter(
            User.full_name.ilike(like) |
            User.username.ilike(like)  |
            User.email.ilike(like)
        )

    total = q.count()
    users = q.order_by(User.id).offset(offset).limit(limit).all()

    from fastapi.responses import JSONResponse
    import json
    result = [_user_detail(u, db) for u in users]
    return result


@router.post("/", status_code=201, summary="Tạo người dùng mới")
async def create_user(
    body: UserCreateRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    """Tạo tài khoản trên Keycloak rồi ghi bản ghi local."""
    from app.services.keycloak_service import get_keycloak_admin

    # Kiểm tra trùng email / username trong DB local
    if db.query(User).filter(User.email == body.email).first():
        raise ConflictError("Email đã tồn tại trong hệ thống")
    if db.query(User).filter(User.username == body.username).first():
        raise ConflictError("Tên đăng nhập đã tồn tại trong hệ thống")

    # Tạo user trên Keycloak
    try:
        admin = get_keycloak_admin()
        result = admin.create_user(
            {
                "username":      body.username,
                "email":         body.email,
                "firstName":     (body.full_name or "").split(" ")[0],
                "lastName":      " ".join((body.full_name or "").split(" ")[1:]),
                "enabled":       body.is_active,
                "emailVerified": True,
                "credentials": [
                    {"type": "password", "value": body.password, "temporary": False}
                ],
            },
            exist_ok=False,
        )
        # python-keycloak 4.x trả về str UUID; bản cũ có thể trả về dict
        keycloak_id = result if isinstance(result, str) else str(result)
    except ConflictError:
        raise
    except Exception as exc:
        logger.error("Keycloak create_user failed: %s", exc)
        detail = str(exc)
        # Bắt lỗi duplicate từ Keycloak (4xx response)
        if "409" in detail or "already exists" in detail.lower() or "conflict" in detail.lower():
            raise ConflictError("Tên đăng nhập hoặc email đã tồn tại trên hệ thống xác thực")
        raise HTTPException(
            status_code=502,
            detail=f"Không thể tạo người dùng trên Keycloak: {exc}",
        )

    # Ghi vào DB local
    user = User(
        keycloak_id=keycloak_id,
        email=body.email,
        username=body.username,
        full_name=body.full_name,
        is_active=body.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created user %s (keycloak_id=%s)", body.username, keycloak_id)
    return _user_detail(user, db)


@router.delete("/{user_id}", status_code=204, summary="Xoá người dùng")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles("admin")),
):
    """Xoá người dùng khỏi DB local và Keycloak."""
    from app.services.keycloak_service import get_keycloak_admin
    from app.models.document import Document

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("Không tìm thấy người dùng")

    if user.id == current_user.user.id:
        raise BadRequestError("Không thể xoá tài khoản của chính mình")

    # Kiểm tra tài liệu thuộc về user (user_id NOT NULL → không thể set NULL)
    doc_count = db.query(Document).filter(Document.user_id == user_id).count()
    if doc_count > 0:
        raise BadRequestError(
            f"Không thể xoá người dùng đang có {doc_count} chứng từ trong hệ thống. "
            "Hãy vô hiệu hoá tài khoản thay thế."
        )

    # confirmed_by_user_id là nullable → clear trước khi xoá
    db.query(Document).filter(Document.confirmed_by_user_id == user_id).update(
        {"confirmed_by_user_id": None}, synchronize_session=False
    )

    # Xoá trên Keycloak (không fail nếu không tìm thấy)
    try:
        admin = get_keycloak_admin()
        admin.delete_user(user.keycloak_id)
        logger.info("Deleted Keycloak user %s", user.keycloak_id)
    except Exception as exc:
        logger.warning("Could not delete Keycloak user %s: %s", user.keycloak_id, exc)

    # Xoá DB local (cascade: roles, orgs, api_tokens)
    db.delete(user)
    db.commit()


@router.get("/{user_id}", summary="Chi tiết người dùng")
async def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("Không tìm thấy người dùng")
    return _user_detail(user, db)


@router.patch("/{user_id}", summary="Cập nhật người dùng")
async def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    # Must be admin / org_manager, or editing own profile
    if (not current_user.is_admin()
            and not current_user.has_role("org_manager")
            and current_user.user.id != user_id):
        raise ForbiddenError("Không có quyền chỉnh sửa người dùng này")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("Không tìm thấy người dùng")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.is_active is not None:
        # Prevent deactivating self
        if not body.is_active and user.id == current_user.user.id:
            raise BadRequestError("Không thể tự vô hiệu hoá tài khoản của mình")
        user.is_active = body.is_active

    db.commit()
    db.refresh(user)
    return _user_detail(user, db)


# ─── Role assignment ──────────────────────────────────────────────────────────

@router.get("/{user_id}/roles", summary="Danh sách vai trò của người dùng")
async def get_user_roles(
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("Không tìm thấy người dùng")

    return [
        {
            "id": ur.role.id,
            "name": ur.role.name,
            "display_name": ur.role.display_name,
            "color": ur.role.color,
        }
        for ur in db.query(UserRole).filter(UserRole.user_id == user_id).all()
    ]


@router.post("/{user_id}/roles", status_code=201, summary="Gán vai trò cho người dùng")
async def assign_role(
    user_id: int,
    body: RoleAssignRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("Không tìm thấy người dùng")

    role = db.query(SystemRole).filter(SystemRole.id == body.role_id).first()
    if not role:
        raise NotFoundError("Không tìm thấy vai trò")

    existing = (
        db.query(UserRole)
        .filter(UserRole.user_id == user_id, UserRole.role_id == body.role_id)
        .first()
    )
    if existing:
        raise ConflictError("Người dùng đã có vai trò này")

    db.add(UserRole(user_id=user_id, role_id=body.role_id))
    db.commit()
    return {"message": f"Đã gán vai trò '{role.display_name}'"}


@router.delete("/{user_id}/roles/{role_id}", status_code=204, summary="Thu hồi vai trò")
async def remove_role(
    user_id: int,
    role_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    ur = (
        db.query(UserRole)
        .filter(UserRole.user_id == user_id, UserRole.role_id == role_id)
        .first()
    )
    if not ur:
        raise NotFoundError("Người dùng không có vai trò này")
    db.delete(ur)
    db.commit()


# ─── Organization assignment ──────────────────────────────────────────────────

@router.get("/{user_id}/organizations", summary="Danh sách đơn vị của người dùng")
async def get_user_orgs(
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    rows = (
        db.query(UserOrganization)
        .filter(UserOrganization.user_id == user_id)
        .all()
    )
    return [
        {
            "organization_id": r.organization_id,
            "organization_name": r.organization.name,
            "organization_code": r.organization.code,
            "role": r.role,
            "is_primary": r.is_primary,
        }
        for r in rows
    ]


@router.post("/{user_id}/organizations", status_code=201, summary="Phân bổ đơn vị")
async def assign_org(
    user_id: int,
    body: OrgAssignRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise NotFoundError("Không tìm thấy người dùng")

    org = db.query(Organization).filter(Organization.id == body.organization_id).first()
    if not org:
        raise NotFoundError("Không tìm thấy đơn vị")

    existing = (
        db.query(UserOrganization)
        .filter(
            UserOrganization.user_id == user_id,
            UserOrganization.organization_id == body.organization_id,
        )
        .first()
    )
    if existing:
        existing.role = body.role
        existing.is_primary = body.is_primary
    else:
        db.add(UserOrganization(
            user_id=user_id,
            organization_id=body.organization_id,
            role=body.role,
            is_primary=body.is_primary,
        ))

    db.commit()
    return {"message": f"Đã phân bổ vào đơn vị '{org.name}'"}


@router.delete("/{user_id}/organizations/{org_id}", status_code=204, summary="Xoá khỏi đơn vị")
async def remove_org(
    user_id: int,
    org_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    uo = (
        db.query(UserOrganization)
        .filter(UserOrganization.user_id == user_id, UserOrganization.organization_id == org_id)
        .first()
    )
    if not uo:
        raise NotFoundError("Không tìm thấy liên kết")
    db.delete(uo)
    db.commit()
