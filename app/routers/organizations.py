from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.organization import Organization
from app.models.user import User, UserOrganization
from app.schemas.organization import (
    AssignUserRequest,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationTree,
    OrganizationUpdate,
)

router = APIRouter(prefix="/organizations", tags=["Organizations"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _build_tree(orgs: List[Organization], parent_id=None) -> List[OrganizationTree]:
    result = []
    for org in orgs:
        if org.parent_id == parent_id:
            node = OrganizationTree.model_validate(org)
            node.children = _build_tree(orgs, org.id)
            result.append(node)
    return result


def _compute_path(parent: Organization | None) -> tuple[int, str]:
    """Returns (level, path) for a new child of *parent*."""
    if parent is None:
        return 0, ""
    level = parent.level + 1
    path = f"{parent.path}/{parent.id}" if parent.path else str(parent.id)
    return level, path


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/tree", response_model=List[OrganizationTree], summary="Cây cơ cấu tổ chức")
async def get_org_tree(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    orgs = db.query(Organization).filter(Organization.is_active == True).all()
    return _build_tree(orgs)


@router.get("/", response_model=List[OrganizationResponse], summary="Danh sách đơn vị")
async def list_organizations(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    q = db.query(Organization).filter(Organization.is_active == True)
    if search:
        q = q.filter(or_(
            Organization.name.ilike(f"%{search}%"),
            Organization.code.ilike(f"%{search}%"),
            Organization.group_name.ilike(f"%{search}%"),
        ))
    return q.all()


@router.post(
    "/",
    response_model=OrganizationResponse,
    status_code=201,
    summary="Tạo đơn vị tổ chức",
)
async def create_organization(
    data: OrganizationCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    if db.query(Organization).filter(Organization.code == data.code).first():
        raise ConflictError(f"Mã đơn vị '{data.code}' đã tồn tại")

    parent = None
    if data.parent_id:
        parent = db.query(Organization).filter(Organization.id == data.parent_id).first()
        if not parent:
            raise NotFoundError("Đơn vị cha không tồn tại")

    level, path = _compute_path(parent)
    org = Organization(**data.model_dump(), level=level, path=path)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrganizationResponse, summary="Chi tiết đơn vị")
async def get_organization(
    org_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundError("Không tìm thấy đơn vị")
    return org


@router.put("/{org_id}", response_model=OrganizationResponse, summary="Cập nhật đơn vị")
async def update_organization(
    org_id: int,
    data: OrganizationUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundError("Không tìm thấy đơn vị")
    for key, val in data.model_dump(exclude_none=True).items():
        setattr(org, key, val)
    db.commit()
    db.refresh(org)
    return org


@router.delete("/{org_id}", status_code=204, summary="Vô hiệu hoá đơn vị")
async def deactivate_organization(
    org_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise NotFoundError("Không tìm thấy đơn vị")
    org.is_active = False
    db.commit()


# ─── User ↔ Org mapping ──────────────────────────────────────────────────────

@router.get("/{org_id}/users", summary="Danh sách thành viên đơn vị")
async def list_org_users(
    org_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    if not db.query(Organization).filter(Organization.id == org_id).first():
        raise NotFoundError("Không tìm thấy đơn vị")

    rows = (
        db.query(UserOrganization)
        .filter(UserOrganization.organization_id == org_id)
        .all()
    )
    return [
        {
            "user_id": r.user_id,
            "role": r.role,
            "is_primary": r.is_primary,
            "email": r.user.email,
            "full_name": r.user.full_name,
            "username": r.user.username,
        }
        for r in rows
    ]


@router.post("/{org_id}/users", status_code=201, summary="Gán người dùng vào đơn vị")
async def assign_user(
    org_id: int,
    data: AssignUserRequest,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    if not db.query(Organization).filter(Organization.id == org_id).first():
        raise NotFoundError("Không tìm thấy đơn vị")
    if not db.query(User).filter(User.id == data.user_id).first():
        raise NotFoundError("Không tìm thấy người dùng")

    existing = (
        db.query(UserOrganization)
        .filter(
            UserOrganization.user_id == data.user_id,
            UserOrganization.organization_id == org_id,
        )
        .first()
    )
    if existing:
        existing.role = data.role
        existing.is_primary = data.is_primary
    else:
        db.add(
            UserOrganization(
                user_id=data.user_id,
                organization_id=org_id,
                role=data.role,
                is_primary=data.is_primary,
            )
        )
    db.commit()
    return {"message": "Gán thành công"}


@router.delete("/{org_id}/users/{user_id}", status_code=204, summary="Xoá người dùng khỏi đơn vị")
async def remove_user(
    org_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "org_manager")),
):
    uo = (
        db.query(UserOrganization)
        .filter(
            UserOrganization.user_id == user_id,
            UserOrganization.organization_id == org_id,
        )
        .first()
    )
    if not uo:
        raise NotFoundError("Không tìm thấy liên kết người dùng – đơn vị")
    db.delete(uo)
    db.commit()
