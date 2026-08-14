import asyncio
import os
import time

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response

from . import audit as audit_log
from .auth import _COOKIE_NAME, _SESSION_MAX_AGE, _check_token, create_session_token
from .db import get_db, load_admin_api_key, verify_key

router = APIRouter()

# Rate limiting for admin login: max 5 attempts per 300s window per IP
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
    # Prune old attempts
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _LOGIN_WINDOW]
    return len(_login_attempts[ip]) >= _LOGIN_MAX_ATTEMPTS


def _record_login_attempt(ip: str) -> None:
    _login_attempts.setdefault(ip, []).append(time.time())


spa_dir = os.path.join(os.path.dirname(__file__), "frontend_dist")


@router.post("/admin/login")
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


@router.get("/admin/logout")
async def logout(request: Request):
    response = RedirectResponse(url="/admin/login", status_code=303)
    response.delete_cookie(key=_COOKIE_NAME, path="/admin")
    asyncio.create_task(
        audit_log.log_admin_action("admin_logout", None, f"ip={_client_ip(request)}", _client_ip(request))
    )
    return response


@router.get("/favicon.ico")
@router.get("/favicon.svg")
@router.get("/favicon-16x16.png")
@router.get("/favicon-32x32.png")
@router.get("/apple-touch-icon.png")
@router.get("/site.webmanifest")
@router.get("/android-chrome-192x192.png")
@router.get("/android-chrome-512x512.png")
async def serve_root_static(request: Request):
    filename = request.url.path.strip("/")
    file_path = os.path.join(spa_dir, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return Response(status_code=204)


@router.get("/admin/assets/{path:path}")
async def serve_assets(path: str):
    file_path = os.path.join(spa_dir, "assets", path)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return HTMLResponse("<h1>Not found</h1>", status_code=404)


@router.get("/admin/login")
async def login_page(request: Request):
    index = os.path.join(spa_dir, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return HTMLResponse("<h1>SPA not built</h1>")


@router.get("/admin/setup")
async def setup_page(request: Request):
    index = os.path.join(spa_dir, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return HTMLResponse("<h1>SPA not built</h1>")


@router.get("/admin")
async def admin_redirect(request: Request):
    cookie = request.cookies.get(_COOKIE_NAME)
    if cookie:
        key = await load_admin_api_key()
        if key and _check_token(cookie, key):
            return RedirectResponse(url="/admin/", status_code=301)
    return RedirectResponse(url="/admin/login", status_code=302)


@router.get("/admin/")
async def admin_home(request: Request):
    cookie = request.cookies.get(_COOKIE_NAME)
    if cookie:
        key = await load_admin_api_key()
        if key and _check_token(cookie, key):
            return FileResponse(os.path.join(spa_dir, "index.html"))
    return RedirectResponse(url="/admin/login", status_code=302)


@router.get("/admin/users")
@router.get("/admin/settings")
@router.get("/admin/system")
@router.get("/admin/models")
@router.get("/admin/models/new")
@router.get("/admin/models/download")
@router.get("/admin/models/{path:path}")
@router.get("/admin/audit")
@router.get("/admin/version")
@router.get("/admin/metrics")
@router.get("/admin/logs")
async def spa_pages(request: Request):
    index = os.path.join(spa_dir, "index.html")
    if os.path.exists(index):
        return FileResponse(index)
    return HTMLResponse("<h1>Not found</h1>", status_code=404)


@router.get("/admin/{path:path}")
async def serve_static(path: str):
    file_path = os.path.join(spa_dir, path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return HTMLResponse("<h1>Not found</h1>", status_code=404)
