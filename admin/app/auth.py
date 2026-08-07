import logging
import time

import jwt
from fastapi import HTTPException, Request

from .config import settings
from .db import get_db, verify_key

_COOKIE_NAME = "admin_session"
_SESSION_MAX_AGE = 7 * 86400  # 7 days
_logger = logging.getLogger("sgfleet-admin")


def _check_token(cookie: str) -> bool:
    try:
        jwt.decode(cookie, settings.admin_api_key, algorithms=["HS256"])
        return True
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return False


async def require_admin(request: Request):
    auth = request.headers.get("authorization", "")
    ip = (request.client and request.client.host) or "unknown"
    if auth.startswith("Bearer "):
        token = auth[7:]
        async with (
            get_db() as db,
            db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_hash",)) as cursor,
        ):
            row = await cursor.fetchone()
            if row is None or not verify_key(token, row["value"]):
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
    if cookie and _check_token(cookie):
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


def create_session_token() -> str:
    now = int(time.time())
    payload = {"iat": now, "exp": now + _SESSION_MAX_AGE}
    return jwt.encode(payload, settings.admin_api_key, algorithm="HS256")
