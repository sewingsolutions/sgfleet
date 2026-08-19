import logging
import time

import jwt
from fastapi import HTTPException, Request

from .db import get_db, get_user_by_id, verify_key

_COOKIE_NAME = "admin_session"
_USER_COOKIE_NAME = "user_session"
_SESSION_MAX_AGE = 7 * 86400  # 7 days
_logger = logging.getLogger("sgfleet-admin")


def _check_token(cookie: str, key: str) -> bool:
    try:
        jwt.decode(cookie, key, algorithms=["HS256"])
        return True
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return False


async def require_admin(request: Request):
    from .db import is_setup_complete

    if not await is_setup_complete():
        raise HTTPException(status_code=403, detail="System setup not complete. Please complete the setup wizard.")

    auth = request.headers.get("authorization", "")
    ip = (request.client and request.client.host) or "unknown"
    if auth.startswith("Bearer "):
        token = auth[7:]
        async with get_db() as db:
            async with db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_hash",)) as cursor:
                row = await cursor.fetchone()
            authenticated = False
            if row and verify_key(token, row["value"]):
                authenticated = True
            if not authenticated:
                async with db.execute(
                    "SELECT key, value FROM config WHERE key IN (?, ?)",
                    ("admin_api_key_hash_old", "admin_api_key_old_expires"),
                ) as cursor:
                    rows = await cursor.fetchall()
                config = {row["key"]: row["value"] for row in rows}
                if config.get("admin_api_key_hash_old"):
                    from datetime import datetime

                    expires = datetime.fromisoformat(config["admin_api_key_old_expires"])
                    if datetime.now() < expires and verify_key(token, config["admin_api_key_hash_old"]):
                        authenticated = True
            if not authenticated:
                _logger.log(
                    logging.INFO,
                    "",
                    extra={
                        "request": {
                            "event": "auth_failure",
                            "method": request.method,
                            "path": request.url.path,
                            "status": 401,
                            "latency_ms": 0,
                            "user": None,
                            "request_id": "",
                            "ip": ip,
                            "error": "invalid_admin_key",
                        }
                    },
                )
                raise HTTPException(status_code=401, detail="Invalid admin key")
        return

    cookie = request.cookies.get(_COOKIE_NAME)
    if cookie:
        async with (
            get_db() as db,
            db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_enc",)) as cursor,
        ):
            row = await cursor.fetchone()
            if row and row["value"]:
                from .crypto import decrypt

                key = decrypt(row["value"])
                if _check_token(cookie, key):
                    return

    _logger.log(
        logging.INFO,
        "",
        extra={
            "request": {
                "event": "auth_failure",
                "method": request.method,
                "path": request.url.path,
                "status": 401,
                "latency_ms": 0,
                "user": None,
                "request_id": "",
                "ip": ip,
                "error": "missing_admin_key",
            }
        },
    )
    raise HTTPException(status_code=401, detail="Missing or invalid admin key")


def create_session_token(key: str) -> str:
    now = int(time.time())
    payload = {"iat": now, "exp": now + _SESSION_MAX_AGE}
    return jwt.encode(payload, key, algorithm="HS256")


def create_user_session_token(user_id: int, api_key: str) -> str:
    now = int(time.time())
    payload = {"user_id": user_id, "iat": now, "exp": now + _SESSION_MAX_AGE}
    return jwt.encode(payload, api_key, algorithm="HS256")


async def require_user(request: Request):
    from .db import is_setup_complete

    if not await is_setup_complete():
        raise HTTPException(status_code=403, detail="System setup not complete. Please complete the setup wizard.")

    cookie = request.cookies.get(_USER_COOKIE_NAME)
    if not cookie:
        raise HTTPException(status_code=401, detail="Missing or invalid user session")

    try:
        decoded = jwt.decode(cookie, options={"verify_signature": False})
        user_id = decoded.get("user_id")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail="Invalid user session") from e

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user session")

    user = await get_user_by_id(user_id)
    if not user or not user.get("is_active"):
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Verify cookie signature before returning user data
    raw_key = user.get("api_key")
    if not raw_key:
        raise HTTPException(status_code=401, detail="No stored API key — session invalid")
    if not _check_token(cookie, raw_key):
        raise HTTPException(status_code=401, detail="Invalid user session")

    request.state.user = user


async def require_admin_or_user(request: Request):
    """Accept an admin session (Bearer key or cookie) or a user session cookie."""
    if request.headers.get("authorization", "").startswith("Bearer ") or request.cookies.get(_COOKIE_NAME):
        await require_admin(request)
        return
    await require_user(request)
