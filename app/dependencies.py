"""
FastAPI dependency functions for authentication and authorisation.

Supports two auth methods:
  1. Keycloak JWT Bearer token  (standard user login)
  2. API Token (oct_*)          (long-lived service tokens)

Usage examples
──────────────
  # Any authenticated user
  current_user: CurrentUser = Depends(get_current_user)

  # Only admins or users with role "doc_manager"
  current_user: CurrentUser = Depends(require_roles("admin", "doc_manager"))
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import AuthenticationError, ForbiddenError
from app.models.user import User, UserOrganization
from app.models.organization import Organization
from app.services.keycloak_service import verify_token, get_user_roles

logger = logging.getLogger(__name__)

# Khai báo scheme – FastAPI tự render icon 🔒 trên mỗi endpoint trong Swagger
http_bearer = HTTPBearer(auto_error=False)


# ─── Current-user container ──────────────────────────────────────────────────

class CurrentUser:
    """
    Carries the resolved DB user, Keycloak roles, and the set of
    organisation IDs the user may access (their own org + all descendants).
    """

    def __init__(self, user: User, roles: list[str], org_ids: list[int]):
        self.user = user
        self.roles = roles
        self.org_ids = org_ids  # expanded: own orgs + sub-orgs

    def has_role(self, *roles: str) -> bool:
        return any(r in self.roles for r in roles)

    def is_admin(self) -> bool:
        return self.has_role("admin", "super_admin")


# ─── Helper: expand org IDs to include descendants ───────────────────────────

def _expand_org_ids(user: User, db: Session) -> list[int]:
    own_org_ids = [
        uo.organization_id
        for uo in db.query(UserOrganization)
        .filter(UserOrganization.user_id == user.id)
        .all()
    ]
    expanded: set[int] = set(own_org_ids)
    for oid in own_org_ids:
        descendants = (
            db.query(Organization.id)
            .filter(
                Organization.path.like(f"%/{oid}/%")
                | Organization.path.like(f"%/{oid}")
                | Organization.path.like(f"{oid}/%")
                | (Organization.id == oid)
            )
            .all()
        )
        expanded.update(row[0] for row in descendants)
    return list(expanded)


# ─── API Token auth helper ────────────────────────────────────────────────────

def _try_api_token_auth(token: str, db: Session) -> Optional[CurrentUser]:
    """Returns CurrentUser if token is a valid active API token, else None."""
    if not token.startswith("oct_"):
        return None

    from app.models.api_token import APIToken

    api_token = (
        db.query(APIToken)
        .filter(APIToken.token == token, APIToken.is_active == True)
        .first()
    )
    if not api_token:
        return None

    # Check expiry
    if api_token.expires_at:
        try:
            exp = datetime.fromisoformat(api_token.expires_at)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                return None
        except ValueError:
            pass

    # Update last_used_at
    from datetime import datetime as dt
    api_token.last_used_at = dt.now(timezone.utc).isoformat()
    db.commit()

    user = db.query(User).filter(User.id == api_token.user_id).first()
    if not user or not user.is_active:
        return None

    # API tokens get roles from system UserRole assignments
    try:
        from app.models.role import UserRole
        roles = [
            ur.role.name
            for ur in db.query(UserRole).filter(UserRole.user_id == user.id).all()
            if ur.role is not None
        ]
    except Exception:
        roles = []

    org_ids = _expand_org_ids(user, db)
    return CurrentUser(user=user, roles=roles, org_ids=org_ids)


# ─── Core dependency ─────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """
    1. Try API Token auth (oct_* prefix).
    2. Verify the Bearer JWT with Keycloak.
    3. Auto-provision the user in the local DB on first login.
    4. Expand the user's org memberships to include child organisations.
    """
    token = credentials.credentials if credentials else None
    if not token:
        raise AuthenticationError("No authentication token provided")

    # ── API Token path ──────────────────────────────────────────────────────
    if token.startswith("oct_"):
        result = _try_api_token_auth(token, db)
        if result:
            return result
        raise AuthenticationError("API token không hợp lệ hoặc đã hết hạn")

    # ── Keycloak JWT path ───────────────────────────────────────────────────
    try:
        payload = verify_token(token)
    except Exception as exc:
        logger.warning("Authentication failed – %s: %s", type(exc).__name__, exc)
        raise AuthenticationError("Invalid or expired token")

    keycloak_id: Optional[str] = payload.get("sub")
    if not keycloak_id:
        raise AuthenticationError("Token missing subject claim")

    # ── Auto-provision user ─────────────────────────────────────────────────
    user = db.query(User).filter(User.keycloak_id == keycloak_id).first()
    if not user:
        user = User(
            keycloak_id=keycloak_id,
            email=payload.get("email", ""),
            full_name=payload.get("name", ""),
            username=payload.get("preferred_username", keycloak_id),
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info("Auto-provisioned user keycloak_id=%s", keycloak_id)

    if not user.is_active:
        raise AuthenticationError("User account is inactive")

    roles = get_user_roles(payload)

    # Merge with locally assigned system roles (safe – table may not exist yet)
    try:
        from app.models.role import UserRole
        local_roles = [
            ur.role.name
            for ur in db.query(UserRole).filter(UserRole.user_id == user.id).all()
            if ur.role is not None
        ]
        combined_roles = list(set(roles) | set(local_roles))
    except Exception:
        combined_roles = roles

    org_ids = _expand_org_ids(user, db)
    return CurrentUser(user=user, roles=combined_roles, org_ids=org_ids)


# ─── Role-guard factory ──────────────────────────────────────────────────────

def require_roles(*roles: str):
    """
    Returns a dependency that raises HTTP 403 unless the current user
    holds at least one of the specified roles (or is an admin).
    """

    async def checker(
        current_user: CurrentUser = Depends(get_current_user),
    ) -> CurrentUser:
        if not current_user.is_admin() and not current_user.has_role(*roles):
            raise ForbiddenError(f"Required role(s): {', '.join(roles)}")
        return current_user

    return checker
