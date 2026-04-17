"""
Keycloak integration.

verify_token():
  - Xác thực JWT bằng JWKS (public key) của Keycloak – KHÔNG gọi /userinfo
  - JWKS được cache 1 giờ → chỉ có 1 network request/giờ, thay vì mỗi request
  - Nhanh hơn ~50-100ms mỗi API call so với gọi /userinfo

Keycloak token lifetime config (Keycloak Admin → Realm Settings → Tokens):
  - Access Token Lifespan        : đặt 30 phút (1800s) hoặc cao hơn
  - SSO Session Idle             : đặt 8 giờ (28800s)
  - SSO Session Max              : đặt 24 giờ (86400s)
  - Refresh Token Lifespan       : theo SSO Session Idle
"""

import base64
import json
import logging
import time
from typing import Optional

import httpx
from jose import jwt as jose_jwt, JWTError
from jose.exceptions import ExpiredSignatureError
from keycloak import KeycloakAdmin, KeycloakOpenID

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Shared Keycloak client ───────────────────────────────────────────────────

keycloak_openid = KeycloakOpenID(
    server_url=settings.KEYCLOAK_URL,
    client_id=settings.KEYCLOAK_CLIENT_ID,
    realm_name=settings.KEYCLOAK_REALM,
    client_secret_key=settings.KEYCLOAK_CLIENT_SECRET,
)


def get_keycloak_admin() -> KeycloakAdmin:
    return KeycloakAdmin(
        server_url=settings.KEYCLOAK_URL,
        username=settings.KEYCLOAK_ADMIN_USERNAME,
        password=settings.KEYCLOAK_ADMIN_PASSWORD,
        realm_name=settings.KEYCLOAK_REALM,
        verify=True,
    )


# ─── JWKS cache (public key từ Keycloak) ─────────────────────────────────────

_JWKS_URL = (
    f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}"
    "/protocol/openid-connect/certs"
)
_JWKS_TTL = 3600          # cache 1 giờ
_jwks_cache: Optional[dict] = None
_jwks_fetched_at: float = 0.0


def _get_jwks(force: bool = False) -> dict:
    """Fetch Keycloak JWKS, cache 1 giờ để tránh gọi network mỗi request."""
    global _jwks_cache, _jwks_fetched_at

    if not force and _jwks_cache and (time.monotonic() - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache

    logger.info("Fetching Keycloak JWKS from %s", _JWKS_URL)
    try:
        with httpx.Client(timeout=10.0) as http:
            resp = http.get(_JWKS_URL)
            resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = time.monotonic()
        logger.info("JWKS cached (%d keys)", len(_jwks_cache.get("keys", [])))
        return _jwks_cache
    except Exception as exc:
        logger.error("Cannot fetch Keycloak JWKS: %s", exc)
        # Nếu có cache cũ → dùng tạm
        if _jwks_cache:
            logger.warning("Using stale JWKS cache")
            return _jwks_cache
        raise ValueError(f"Keycloak JWKS unavailable: {exc}") from exc


# ─── JWT payload decoder (fallback, không verify signature) ──────────────────

def _decode_jwt_payload_unsafe(token: str) -> dict:
    try:
        part = token.split(".")[1]
        part += "=" * (4 - len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part))
    except Exception:
        return {}


# ─── Token verification (local – không cần network mỗi request) ──────────────

def verify_token(token: str) -> dict:
    """
    Xác thực JWT bằng public key (JWKS) của Keycloak.
    - Không gọi /userinfo → nhanh hơn nhiều
    - JWKS được cache 1 giờ → gần như không có network overhead
    - Raise ValueError nếu token không hợp lệ hoặc đã hết hạn
    """
    jwks = _get_jwks()

    try:
        payload = jose_jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={
                "verify_aud": False,   # Keycloak có thể dùng nhiều audience
                "verify_at_hash": False,
            },
        )
        # Enrich với resource_access (đảm bảo có khi lấy roles)
        return payload

    except ExpiredSignatureError:
        raise ValueError("Token expired")

    except JWTError as exc:
        # Nếu lỗi do key rotate → refresh JWKS rồi thử lại 1 lần
        if "Could not deserialize key data" in str(exc) or "Signature verification failed" in str(exc):
            logger.warning("JWT verify failed, refreshing JWKS and retrying: %s", exc)
            jwks = _get_jwks(force=True)
            try:
                return jose_jwt.decode(
                    token,
                    jwks,
                    algorithms=["RS256"],
                    options={"verify_aud": False, "verify_at_hash": False},
                )
            except JWTError as exc2:
                raise ValueError(f"Invalid token after JWKS refresh: {exc2}") from exc2
        raise ValueError(f"Invalid token: {exc}") from exc


# ─── Role helpers ─────────────────────────────────────────────────────────────

def get_user_roles(payload: dict) -> list[str]:
    return payload.get("realm_access", {}).get("roles", [])


def get_client_roles(payload: dict) -> list[str]:
    resource_access = payload.get("resource_access", {})
    return resource_access.get(settings.KEYCLOAK_CLIENT_ID, {}).get("roles", [])
