import os
from typing import cast

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import jwt
import pytest
from app.auth import _USER_COOKIE_NAME, create_user_session_token
from app.db import create_user, get_user_by_name, mark_setup_complete, soft_delete
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_login_user_token_redirects_to_user():
    """Login with a valid user token should redirect to /user/."""
    import app.admin_ui
    import app.db
    from fastapi.testclient import TestClient

    await create_user("login_redirect_user", "sk-login-redirect")
    await mark_setup_complete()

    client = TestClient(app.admin_ui.router)
    resp = client.post("/login", data={"key": "sk-login-redirect"}, follow_redirects=False)
    assert resp.status_code == 302
    assert "/user/" in resp.headers["location"]


@pytest.mark.asyncio
async def test_login_admin_cookie_secure_flag_matches_scheme():
    """Session cookie Secure flag follows X-Forwarded-Proto, not the configured base URL."""
    import app.admin_ui
    from app.db import set_admin_credentials

    await set_admin_credentials("admin", "sk-secure-flag-test")
    client = TestClient(app.admin_ui.router)

    resp = client.post(
        "/login",
        data={"key": "sk-secure-flag-test"},
        headers={"x-forwarded-proto": "https"},
        follow_redirects=False,
    )
    assert resp.status_code == 302
    assert "/admin/" in resp.headers["location"]
    set_cookie = resp.headers["set-cookie"]
    assert "admin_session=" in set_cookie
    assert "secure" in set_cookie.lower()

    resp_http = client.post(
        "/login",
        data={"key": "sk-secure-flag-test"},
        headers={"x-forwarded-proto": "http"},
        follow_redirects=False,
    )
    assert resp_http.status_code == 302
    set_cookie_http = resp_http.headers["set-cookie"]
    assert "admin_session=" in set_cookie_http
    assert "secure" not in set_cookie_http.lower()


@pytest.mark.asyncio
async def test_login_invalid_key_redirects_back():
    import app.admin_ui

    await mark_setup_complete()

    client = TestClient(app.admin_ui.router)
    resp = client.post("/login", data={"key": "sk-invalid-not-real"}, follow_redirects=False)
    assert resp.status_code == 303
    assert "/login" in resp.headers["location"]


@pytest.mark.asyncio
async def test_logout_clears_both_cookies():
    import app.admin_ui

    client = TestClient(app.admin_ui.router)
    resp = client.get("/logout", follow_redirects=False)
    assert resp.status_code == 303
    assert "/login" in resp.headers["location"]


@pytest.mark.asyncio
async def test_user_session_token_verify_roundtrip():
    """Create a user session token and verify it decodes correctly."""
    user_id = 42
    api_key = "sk-verify-roundtrip"
    token = create_user_session_token(user_id, api_key)

    decoded = jwt.decode(token, api_key, algorithms=["HS256"])
    assert decoded["user_id"] == user_id

    import app.auth

    assert app.auth._check_token(token, "sk-wrong") is False


@pytest.mark.asyncio
async def test_require_user_valid_cookie():
    from app.auth import require_user

    await create_user("require_user_test", "sk-require-test")
    await mark_setup_complete()
    user = await get_user_by_name("require_user_test")

    token = create_user_session_token(cast(dict, user)["id"], "sk-require-test")

    mock_state = cast(dict, {"user": None})

    class MockState:
        def __setattr__(self, name: str, value: None | dict = None):
            mock_state[name] = value

    class MockRequest:  # type: ignore
        cookies = {_USER_COOKIE_NAME: token}
        headers = {}
        state = MockState()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    await require_user(MockRequest())  # type: ignore[arg-type]
    assert mock_state["user"] is not None
    assert mock_state["user"]["name"] == "require_user_test"


@pytest.mark.asyncio
async def test_require_user_missing_cookie_raises():
    from app.auth import require_user
    from fastapi import HTTPException

    await mark_setup_complete()

    class MockReq2:  # type: ignore
        cookies = {}
        headers = {}
        state = type("State", (), {})()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    with pytest.raises(HTTPException, match="Missing or invalid"):
        await require_user(MockReq2())  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_require_user_invalid_token_raises():
    from app.auth import require_user
    from fastapi import HTTPException

    await mark_setup_complete()

    class MockReq3:  # type: ignore
        cookies = {_USER_COOKIE_NAME: "definitely-not-a-jwt"}
        headers = {}
        state = type("State", (), {})()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    with pytest.raises(HTTPException, match="Invalid user session"):
        await require_user(MockReq3())  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_require_user_inactive_user_raises():
    from app.auth import require_user
    from fastapi import HTTPException

    await create_user("inactive_user_test", "sk-inactive")
    await mark_setup_complete()
    user = await get_user_by_name("inactive_user_test")
    uid = cast(dict, user)["id"]
    await soft_delete(uid)

    token = create_user_session_token(uid, "sk-inactive")

    mock_state_inactive = cast(dict, {"user": None})

    class MockRequestInactive:  # type: ignore
        cookies = {_USER_COOKIE_NAME: token}
        headers = {}
        state = type("State", (), mock_state_inactive)()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    with pytest.raises(HTTPException, match="User not found or inactive"):
        await require_user(MockRequestInactive())  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_require_admin_or_user_accepts_user_cookie():
    from app.auth import require_admin_or_user

    await create_user("admin_or_user_test", "sk-admin-or-user")
    await mark_setup_complete()
    user = await get_user_by_name("admin_or_user_test")
    token = create_user_session_token(cast(dict, user)["id"], "sk-admin-or-user")

    mock_state_ou = cast(dict, {"user": None})

    class MockStateOU:
        def __setattr__(self, name: str, value: None | dict = None):
            mock_state_ou[name] = value

    class MockRequestOU:  # type: ignore
        cookies = {_USER_COOKIE_NAME: token}
        headers = {}
        state = MockStateOU()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    await require_admin_or_user(MockRequestOU())  # type: ignore[arg-type]
    assert mock_state_ou["user"] is not None
    assert mock_state_ou["user"]["name"] == "admin_or_user_test"


@pytest.mark.asyncio
async def test_require_admin_or_user_accepts_admin_bearer():
    from app.auth import require_admin_or_user
    from app.db import set_admin_credentials

    await set_admin_credentials("admin", "sk-admin-or-admin")

    class MockRequestAdmin:  # type: ignore
        cookies = {}
        headers = {"authorization": "Bearer sk-admin-or-admin"}
        state = object()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    await require_admin_or_user(MockRequestAdmin())  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_require_admin_or_user_anonymous_raises():
    from app.auth import require_admin_or_user
    from fastapi import HTTPException

    await mark_setup_complete()

    class MockRequestAnon:  # type: ignore
        cookies = {}
        headers = {}
        state = object()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    with pytest.raises(HTTPException):
        await require_admin_or_user(MockRequestAnon())  # type: ignore[arg-type]
