"""
Roles & Permissions router.

GET    /roles/permissions   – All system permissions (admin/org_manager)
GET    /roles/              – List all roles
POST   /roles/              – Create role (admin)
GET    /roles/{role_id}     – Role detail
PUT    /roles/{role_id}     – Update role (admin)
DELETE /roles/{role_id}     – Delete role (admin, non-system)
"""

from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import BadRequestError, ConflictError, NotFoundError
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.role import Permission, RolePermission, SystemRole
from app.schemas.role import (
    PermissionResponse,
    RoleCreate,
    RoleResponse,
    RoleUpdate,
)

router = APIRouter(prefix="/roles", tags=["Roles & Permissions"])


def _role_to_response(role: SystemRole) -> RoleResponse:
    return RoleResponse(
        id=role.id,
        name=role.name,
        display_name=role.display_name,
        description=role.description,
        is_system=role.is_system,
        color=role.color,
        permissions=[
            PermissionResponse(
                id=rp.permission.id,
                code=rp.permission.code,
                name=rp.permission.name,
                category=rp.permission.category,
                description=rp.permission.description,
            )
            for rp in role.role_permissions
        ],
        created_at=role.created_at,
    )


# ─── Permissions ──────────────────────────────────────────────────────────────

@router.get(
    "/permissions",
    response_model=List[PermissionResponse],
    summary="Danh sách tất cả quyền trong hệ thống",
)
async def list_permissions(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    perms = db.query(Permission).order_by(Permission.category, Permission.id).all()
    return [
        PermissionResponse(
            id=p.id,
            code=p.code,
            name=p.name,
            category=p.category,
            description=p.description,
        )
        for p in perms
    ]


# ─── Roles CRUD ───────────────────────────────────────────────────────────────

@router.get("/", response_model=List[RoleResponse], summary="Danh sách vai trò")
async def list_roles(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    roles = db.query(SystemRole).order_by(SystemRole.is_system.desc(), SystemRole.id).all()
    return [_role_to_response(r) for r in roles]


@router.post("/", response_model=RoleResponse, status_code=201, summary="Tạo vai trò mới")
async def create_role(
    body: RoleCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    if db.query(SystemRole).filter(SystemRole.name == body.name).first():
        raise ConflictError(f"Tên vai trò '{body.name}' đã tồn tại")

    role = SystemRole(
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        color=body.color,
        is_system=False,
    )
    db.add(role)
    db.flush()

    if body.permission_ids:
        perms = db.query(Permission).filter(Permission.id.in_(body.permission_ids)).all()
        for p in perms:
            db.add(RolePermission(role_id=role.id, permission_id=p.id))

    db.commit()
    db.refresh(role)
    return _role_to_response(role)


@router.get("/{role_id}", response_model=RoleResponse, summary="Chi tiết vai trò")
async def get_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise NotFoundError("Không tìm thấy vai trò")
    return _role_to_response(role)


@router.put("/{role_id}", response_model=RoleResponse, summary="Cập nhật vai trò")
async def update_role(
    role_id: int,
    body: RoleUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise NotFoundError("Không tìm thấy vai trò")

    if body.display_name is not None:
        role.display_name = body.display_name
    if body.description is not None:
        role.description = body.description
    if body.color is not None:
        role.color = body.color

    if body.permission_ids is not None:
        # Replace permission set
        for rp in list(role.role_permissions):
            db.delete(rp)
        db.flush()
        perms = db.query(Permission).filter(Permission.id.in_(body.permission_ids)).all()
        for p in perms:
            db.add(RolePermission(role_id=role.id, permission_id=p.id))

    db.commit()
    db.refresh(role)
    return _role_to_response(role)


@router.delete("/{role_id}", status_code=204, summary="Xoá vai trò")
async def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    role = db.query(SystemRole).filter(SystemRole.id == role_id).first()
    if not role:
        raise NotFoundError("Không tìm thấy vai trò")
    if role.is_system:
        raise BadRequestError("Không thể xoá vai trò hệ thống")

    db.delete(role)
    db.commit()
