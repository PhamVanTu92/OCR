"""
API Token management.

GET    /auth/tokens              – List my tokens (name + prefix, no full token)
POST   /auth/tokens              – Create token  (full token returned ONCE)
DELETE /auth/tokens/{token_id}  – Revoke token
"""

import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ForbiddenError, NotFoundError
from app.dependencies import CurrentUser, get_current_user
from app.models.api_token import APIToken

router = APIRouter(prefix="/auth/token", tags=["API Tokens"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class TokenCreate(BaseModel):
    name: str
    expires_at: Optional[str] = None   # ISO datetime string, null = never


class TokenCreatedResponse(BaseModel):
    id: int
    name: str
    token: str          # FULL token – only returned on creation
    token_prefix: str
    is_active: bool
    expires_at: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class TokenListItem(BaseModel):
    id: int
    name: str
    token_prefix: str   # e.g. "oct_a3f8b2…"  (first 12 chars + "…")
    is_active: bool
    expires_at: Optional[str]
    last_used_at: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[TokenListItem], summary="Danh sách API token")
async def list_tokens(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    tokens = (
        db.query(APIToken)
        .filter(APIToken.user_id == current_user.user.id)
        .order_by(APIToken.created_at.desc())
        .all()
    )
    return tokens


@router.post("/", response_model=TokenCreatedResponse, status_code=201, summary="Tạo API token mới")
async def create_token(
    body: TokenCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    raw = "oct_" + secrets.token_hex(20)   # 44 chars total
    prefix = raw[:12] + "…"

    token = APIToken(
        name=body.name,
        token=raw,
        token_prefix=prefix,
        user_id=current_user.user.id,
        is_active=True,
        expires_at=body.expires_at,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return TokenCreatedResponse(
        id=token.id,
        name=token.name,
        token=raw,
        token_prefix=prefix,
        is_active=token.is_active,
        expires_at=token.expires_at,
        created_at=token.created_at,
    )


@router.delete("/{token_id}", status_code=204, summary="Thu hồi API token")
async def revoke_token(
    token_id: int,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    token = db.query(APIToken).filter(APIToken.id == token_id).first()
    if not token:
        raise NotFoundError("Không tìm thấy token")
    # Only owner or admin may revoke
    if token.user_id != current_user.user.id and not current_user.is_admin():
        raise ForbiddenError("Không có quyền thu hồi token này")
    db.delete(token)
    db.commit()
