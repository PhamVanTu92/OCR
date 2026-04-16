"""
Keycloak integration.

verify_token():
  1. Gọi Keycloak /userinfo với Bearer token → xác nhận token còn sống
  2. Decode JWT payload (không verify signature) để lấy roles, sub, email
     (an toàn vì userinfo đã xác nhận token hợp lệ ở bước 1)
"""

import base64
import json
import logging

import httpx
from keycloak import KeycloakAdmin, KeycloakOpenID

from app.core.config import settings

logger = logging.getLogger(__name__)

# ─── Shared clients ──────────────────────────────────────────────────────────

keycloak_openid = KeycloakOpenID(
    server_url=settings.KEYCLOAK_URL,
    client_id=settings.KEYCLOAK_CLIENT_ID,
    realm_name=settings.KEYCLOAK_REALM,
    client_secret_key=settings.KEYCLOAK_CLIENT_SECRET,
)

USERINFO_URL = (
    f"{settings.KEYCLOAK_URL}/realms/{settings.KEYCLOAK_REALM}"
    "/protocol/openid-connect/userinfo"
)


def get_keycloak_admin() -> KeycloakAdmin:
    return KeycloakAdmin(
        server_url=settings.KEYCLOAK_URL,
        username=settings.KEYCLOAK_ADMIN_USERNAME,
        password=settings.KEYCLOAK_ADMIN_PASSWORD,
        realm_name=settings.KEYCLOAK_REALM,
        verify=True,
    )


# ─── JWT payload decoder (no signature check) ────────────────────────────────

def _decode_jwt_payload(token: str) -> dict:
    """
    Decode JWT payload từ base64 – KHÔNG verify signature.
    Chỉ dùng sau khi đã xác nhận token qua userinfo endpoint.
    """
    try:
        part = token.split(".")[1]
        # JWT dùng base64url không có padding → thêm vào
        part += "=" * (4 - len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part))
    except Exception as e:
        logger.warning("Cannot decode JWT payload: %s", e)
        return {}


# ─── Token verification ───────────────────────────────────────────────────────

def verify_token(token: str) -> dict:
    """
    Xác thực access token qua Keycloak /userinfo.
    Không cần client_secret hay public key – chỉ cần token còn sống.

    Trả về dict chứa: sub, email, preferred_username, realm_access, ...
    Raise ValueError nếu token không hợp lệ.
    """
    try:
        with httpx.Client(timeout=10.0) as http:
            resp = http.get(
                USERINFO_URL,
                headers={"Authorization": f"Bearer {token}"},
            )

        logger.debug("Keycloak /userinfo → HTTP %s", resp.status_code)

        if resp.status_code == 401:
            raise ValueError("Token rejected by Keycloak (401)")
        if resp.status_code != 200:
            raise ValueError(f"Keycloak /userinfo returned HTTP {resp.status_code}")

        userinfo: dict = resp.json()

    except ValueError:
        raise
    except Exception as exc:
        logger.error("Cannot reach Keycloak /userinfo: %s", exc)
        raise ValueError(f"Keycloak unreachable: {exc}") from exc

    # Enrich userinfo với claims từ JWT (roles không có trong /userinfo)
    jwt_payload = _decode_jwt_payload(token)
    userinfo.setdefault("realm_access",    jwt_payload.get("realm_access", {}))
    userinfo.setdefault("resource_access", jwt_payload.get("resource_access", {}))
    userinfo.setdefault("exp",             jwt_payload.get("exp"))

    return userinfo


# ─── Role helpers ─────────────────────────────────────────────────────────────

def get_user_roles(payload: dict) -> list[str]:
    return payload.get("realm_access", {}).get("roles", [])


def get_client_roles(payload: dict) -> list[str]:
    resource_access = payload.get("resource_access", {})
    return resource_access.get(settings.KEYCLOAK_CLIENT_ID, {}).get("roles", [])
