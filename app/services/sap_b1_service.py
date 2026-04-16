"""
SAP Business One – Service Layer session manager.

SAP B1 uses cookie-based sessions:
  1. POST {sap_base_url}/b1s/v1/Login  →  get SessionId (body) + B1SESSION + ROUTEID (cookies)
  2. Subsequent calls use:  Cookie: B1SESSION=<id>; ROUTEID=<routeid>

Fields used per IntegrationConfig:
  sap_base_url      – e.g. https://172.16.10.1:50000   (login host, no trailing slash)
  target_url        – e.g. https://172.16.10.1:50000/b1s/v1/Drafts  (data endpoint)
  auth_header_name  – SAP username
  auth_value        – SAP password
  sap_company_db    – SAP CompanyDB name

Sessions are cached per integration_config.id with a 25-minute TTL
(SAP default is 30 min; we refresh 5 min early to avoid mid-call expiry).

Self-signed certificates are common on SAP B1 installations, so verify=False
is used for all requests.
"""

import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── In-process session cache ───────────────────────────────────────────────────
# { integration_config_id: (b1session, routeid, expires_at_monotonic) }
_session_cache: dict[int, tuple[str, str, float]] = {}

_SESSION_TTL_SECONDS = 25 * 60   # refresh 5 min before SAP's 30-min default


def invalidate_session(integration_id: int) -> None:
    """Force a new login on the next call (e.g. after receiving HTTP 401)."""
    _session_cache.pop(integration_id, None)


async def get_b1_session(
    integration_id: int,
    base_url: str,       # e.g. https://172.16.10.1:50000  – used for login
    company_db: str,
    username: str,
    password: str,
) -> tuple[str, str]:
    """
    Return (b1session_cookie_value, routeid_cookie_value).

    Reads from cache; performs a fresh login when the entry is absent or expired.
    Raises httpx.HTTPStatusError on a non-2xx login response.
    """
    # ── Cache hit ──────────────────────────────────────────────────────────────
    cached = _session_cache.get(integration_id)
    if cached:
        b1session, routeid, expires_at = cached
        if time.monotonic() < expires_at:
            logger.debug("SAP B1 session cache hit  integration_id=%d", integration_id)
            return b1session, routeid

    # ── Login ──────────────────────────────────────────────────────────────────
    login_url = f"{base_url.rstrip('/')}/b1s/v1/Login"
    logger.info("SAP B1 login → %s  (db=%s, user=%s)", login_url, company_db, username)

    async with httpx.AsyncClient(verify=False, timeout=30) as client:
        resp = await client.post(
            login_url,
            json={
                "CompanyDB": company_db,
                "Password":  password,
                "UserName":  username,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    # SAP B1 puts SessionId in both the JSON body and the B1SESSION cookie.
    # Prefer the cookie value; fall back to body field.
    b1session: Optional[str] = (
        resp.cookies.get("B1SESSION")
        or data.get("SessionId")
    )
    if not b1session:
        raise ValueError(
            f"SAP B1 login to {login_url} returned HTTP {resp.status_code} "
            "but no SessionId was found in the response body or cookies."
        )

    # ROUTEID may or may not be present depending on SAP server configuration.
    routeid: str = resp.cookies.get("ROUTEID") or ""
    logger.info(
        "SAP B1 session acquired  integration_id=%d  B1SESSION=%.8s…  ROUTEID=%s",
        integration_id, b1session, routeid or "(none)",
    )

    # ── Store in cache ─────────────────────────────────────────────────────────
    _session_cache[integration_id] = (
        b1session,
        routeid,
        time.monotonic() + _SESSION_TTL_SECONDS,
    )
    return b1session, routeid


def build_sap_cookie_header(b1session: str, routeid: str) -> str:
    """Build the Cookie header value for SAP B1 API calls."""
    parts = [f"B1SESSION={b1session}"]
    if routeid:
        parts.append(f"ROUTEID={routeid}")
    return "; ".join(parts)
