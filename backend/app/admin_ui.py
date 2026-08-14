import asyncio
import time

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from . import audit as audit_log
from .auth import _COOKIE_NAME, _SESSION_MAX_AGE, create_session_token
from .db import get_db, load_admin_api_key, verify_key

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


@router.post("/login")
async def login_post(request: Request):
    ip = _client_ip(request)
    if _is_login_rate_limited(ip):
        await asyncio.sleep(_LOGIN_DELAY)
        return RedirectResponse(url="/admin/login", status_code=303)

    form = await request.form()
    key = form.get("key", "")
    if not isinstance(key, str):
        _record_login_attempt(ip)
        return RedirectResponse(url="/admin/login", status_code=303)

    async with get_db() as db, db.execute("SELECT value FROM config WHERE key = ?", ("admin_api_key_hash",)) as cursor:
        row = await cursor.fetchone()
        if row is None:
            _record_login_attempt(ip)
            return RedirectResponse(url="/admin/login", status_code=303)
        if not verify_key(key, row["value"]):
            _record_login_attempt(ip)
            return RedirectResponse(url="/admin/login", status_code=303)

    response = RedirectResponse(url="/admin/", status_code=302)
    admin_key = await load_admin_api_key()
    token = create_session_token(admin_key)
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=_SESSION_MAX_AGE,
        path="/admin",
        samesite="lax",
    )
    asyncio.create_task(audit_log.log_admin_action("admin_login", None, f"ip={ip}", ip))
    return response


@router.get("/logout")
async def logout(request: Request):
    response = RedirectResponse(url="/admin/login", status_code=303)
    response.delete_cookie(key=_COOKIE_NAME, path="/admin")
    asyncio.create_task(
        audit_log.log_admin_action("admin_logout", None, f"ip={_client_ip(request)}", _client_ip(request))
    )
    return response
