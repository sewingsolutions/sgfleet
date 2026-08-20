import asyncio
import time

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from . import audit as audit_log
from .auth import (
    _COOKIE_NAME,
    _SESSION_MAX_AGE,
    _USER_COOKIE_NAME,
    create_session_token,
    create_user_session_token,
)
from .db import get_db, get_user_by_token, is_setup_complete, load_admin_api_key, verify_key

router = APIRouter()

_login_attempts: dict[str, list[float]] = {}
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_WINDOW = 300
_LOGIN_DELAY = 2


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    return xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown")


def _is_login_rate_limited(ip: str) -> bool:
    now = time.time()
    if ip not in _login_attempts:
        _login_attempts[ip] = []
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _LOGIN_WINDOW]
    return len(_login_attempts[ip]) >= _LOGIN_MAX_ATTEMPTS


def _record_login_attempt(ip: str) -> None:
    _login_attempts.setdefault(ip, []).append(time.time())


def _cookie_secure(request: Request) -> bool:
    """Session cookies are Secure when the request arrived over HTTPS."""
    proto = request.headers.get("x-forwarded-proto", "")
    return proto.split(",")[0].strip().lower() == "https"


@router.get("/login")
async def login_get():
    return RedirectResponse(url="/login/", status_code=301)


@router.post("/login")
async def login_post(request: Request):
    ip = _client_ip(request)
    if _is_login_rate_limited(ip):
        await asyncio.sleep(_LOGIN_DELAY)
        return RedirectResponse(url="/login", status_code=303)

    if not await is_setup_complete():
        return RedirectResponse(url="/setup", status_code=303)

    form = await request.form()
    key = form.get("key", "")
    if not isinstance(key, str):
        _record_login_attempt(ip)
        return RedirectResponse(url="/login", status_code=303)

    # Try admin key first
    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_hash",)) as cursor:
        row = await cursor.fetchone()
    if row and verify_key(key, row["value"]):
        response = RedirectResponse(url="/admin/", status_code=302)
        admin_key = await load_admin_api_key()
        token = create_session_token(admin_key)
        response.set_cookie(
            key=_COOKIE_NAME,
            value=token,
            httponly=True,
            secure=_cookie_secure(request),
            max_age=_SESSION_MAX_AGE,
            path="/",
            samesite="lax",
        )
        asyncio.create_task(audit_log.log_admin_action("admin_login", None, f"ip={ip}", ip))
        return response

    # Try user token
    user = await get_user_by_token(key)
    if user and user.get("api_key"):
        response = RedirectResponse(url="/user/", status_code=302)
        token = create_user_session_token(user["id"], user["api_key"])
        response.set_cookie(
            key=_USER_COOKIE_NAME,
            value=token,
            httponly=True,
            secure=_cookie_secure(request),
            max_age=_SESSION_MAX_AGE,
            path="/",
            samesite="lax",
        )
        asyncio.create_task(audit_log.log_admin_action("user_login", user.get("name"), f"ip={ip}", ip))
        return response

    _record_login_attempt(ip)
    return RedirectResponse(url="/login", status_code=303)


@router.get("/logout")
async def logout(request: Request):
    if request.cookies.get(_COOKIE_NAME):
        asyncio.create_task(
            audit_log.log_admin_action("admin_logout", None, f"ip={_client_ip(request)}", _client_ip(request))
        )

    response = RedirectResponse(url="/login", status_code=303)
    response.delete_cookie(key=_COOKIE_NAME, path="/")
    response.delete_cookie(key=_COOKIE_NAME, path="/admin")
    response.delete_cookie(key=_USER_COOKIE_NAME, path="/")
    response.delete_cookie(key=_USER_COOKIE_NAME, path="/admin")
    return response
