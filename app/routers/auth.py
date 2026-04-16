from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.dependencies import get_current_user, CurrentUser
from app.services.keycloak_service import keycloak_openid

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token:  str
    token_type:    str = "bearer"
    expires_in:    int
    refresh_token: Optional[str] = None
    refresh_expires_in: Optional[int] = None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/token", response_model=TokenResponse, summary="Đăng nhập – lấy Access Token")
async def login(body: LoginRequest):
    """Xác thực username/password qua Keycloak, trả về Access Token + Refresh Token."""
    try:
        token = keycloak_openid.token(
            username=body.username,
            password=body.password,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không đúng")

    return TokenResponse(
        access_token=token["access_token"],
        token_type="bearer",
        expires_in=token.get("expires_in", 300),
        refresh_token=token.get("refresh_token"),
        refresh_expires_in=token.get("refresh_expires_in"),
    )


@router.post("/refresh", response_model=TokenResponse, summary="Làm mới Access Token")
async def refresh_token(body: RefreshRequest):
    """Dùng refresh_token để lấy access_token mới mà không cần đăng nhập lại."""
    try:
        token = keycloak_openid.refresh_token(body.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Refresh token hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
        )

    return TokenResponse(
        access_token=token["access_token"],
        token_type="bearer",
        expires_in=token.get("expires_in", 300),
        refresh_token=token.get("refresh_token"),
        refresh_expires_in=token.get("refresh_expires_in"),
    )


@router.post("/logout", summary="Đăng xuất")
async def logout(
    body: LogoutRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Huỷ session phía Keycloak bằng refresh_token."""
    try:
        keycloak_openid.logout(body.refresh_token)
    except Exception:
        pass  # best-effort
    return {"message": "Đăng xuất thành công"}


@router.get("/me", summary="Thông tin tài khoản hiện tại")
async def get_me(current_user: CurrentUser = Depends(get_current_user)):
    """Trả về thông tin người dùng từ Access Token."""
    u = current_user.user
    return {
        "id": u.id,
        "keycloak_id": u.keycloak_id,
        "email": u.email,
        "full_name": u.full_name,
        "username": u.username,
        "roles": current_user.roles,
        "organization_ids": current_user.org_ids,
    }
