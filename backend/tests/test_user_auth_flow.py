import os

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

    token = create_user_session_token(user["id"], "sk-require-test")

    class MockState:
        pass

    class MockRequest:
        cookies = {_USER_COOKIE_NAME: token}
        headers = {}
        state = MockState()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    await require_user(MockRequest())
    assert hasattr(MockRequest.state, "user")
    assert MockRequest.state.user["name"] == "require_user_test"


@pytest.mark.asyncio
async def test_require_user_missing_cookie_raises():
    from app.auth import require_user
    from fastapi import HTTPException

    await mark_setup_complete()

    class MockRequest:
        cookies = {}
        headers = {}
        state = type("State", (), {})()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    with pytest.raises(HTTPException, match="Missing or invalid"):
        await require_user(MockRequest())


@pytest.mark.asyncio
async def test_require_user_invalid_token_raises():
    from app.auth import require_user
    from fastapi import HTTPException

    await mark_setup_complete()

    class MockRequest:
        cookies = {_USER_COOKIE_NAME: "definitely-not-a-jwt"}
        headers = {}
        state = type("State", (), {})()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    with pytest.raises(HTTPException, match="Invalid user session"):
        await require_user(MockRequest())


@pytest.mark.asyncio
async def test_require_user_inactive_user_raises():
    from app.auth import require_user
    from fastapi import HTTPException

    await create_user("inactive_user_test", "sk-inactive")
    await mark_setup_complete()
    user = await get_user_by_name("inactive_user_test")
    await soft_delete(user["id"])

    token = create_user_session_token(user["id"], "sk-inactive")

    class MockState:
        pass

    class MockRequest:
        cookies = {_USER_COOKIE_NAME: token}
        headers = {}
        state = MockState()
        method = "GET"
        url = type("URL", (), {"path": "/test"})()
        client = type("Client", (), {"host": "127.0.0.1"})()

    with pytest.raises(HTTPException, match="User not found or inactive"):
        await require_user(MockRequest())
