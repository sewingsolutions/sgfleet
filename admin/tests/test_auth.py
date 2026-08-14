import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import jwt
from app.auth import _check_token, create_session_token

_TEST_KEY = "test-secret-key-for-testing"


def test_check_token_valid():
    payload = {"test": "data"}
    token = jwt.encode(payload, _TEST_KEY, algorithm="HS256")
    assert _check_token(token, _TEST_KEY) is True


def test_check_token_expired():
    import time

    payload = {"exp": int(time.time()) - 100}
    token = jwt.encode(payload, _TEST_KEY, algorithm="HS256")
    assert _check_token(token, _TEST_KEY) is False


def test_check_token_tampered():
    payload = {"test": "data"}
    token = jwt.encode(payload, _TEST_KEY, algorithm="HS256")
    parts = token.split(".")
    tampered = parts[0] + "." + parts[1] + ".INVALID"
    assert _check_token(tampered, _TEST_KEY) is False


def test_check_token_empty():
    assert _check_token("", _TEST_KEY) is False


def test_create_session_token_valid():
    token = create_session_token(_TEST_KEY)
    assert isinstance(token, str)
    assert _check_token(token, _TEST_KEY) is True


def test_create_session_token_decodable():
    token = create_session_token(_TEST_KEY)
    decoded = jwt.decode(token, _TEST_KEY, algorithms=["HS256"])
    assert "iat" in decoded
    assert "exp" in decoded
