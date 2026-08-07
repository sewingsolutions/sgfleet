import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import jwt
from app.auth import _check_token, create_session_token
from app.config import settings


def test_check_token_valid():
    payload = {"test": "data"}
    token = jwt.encode(payload, settings.admin_api_key, algorithm="HS256")
    assert _check_token(token) is True


def test_check_token_expired():
    import time

    payload = {"exp": int(time.time()) - 100}
    token = jwt.encode(payload, settings.admin_api_key, algorithm="HS256")
    assert _check_token(token) is False


def test_check_token_tampered():
    payload = {"test": "data"}
    token = jwt.encode(payload, settings.admin_api_key, algorithm="HS256")
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".INVALID"
    assert _check_token(tampered) is False


def test_check_token_empty():
    assert _check_token("") is False


def test_create_session_token_valid():
    token = create_session_token()
    assert isinstance(token, str)
    assert _check_token(token) is True


def test_create_session_token_decodable():
    token = create_session_token()
    decoded = jwt.decode(token, settings.admin_api_key, algorithms=["HS256"])
    assert "iat" in decoded
    assert "exp" in decoded
