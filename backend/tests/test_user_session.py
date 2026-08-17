import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import jwt
from app.auth import _check_token, create_user_session_token


def test_create_user_session_token_structure():
    token = create_user_session_token(42, "sk-test-key")
    decoded = jwt.decode(token, "sk-test-key", algorithms=["HS256"])
    assert decoded["user_id"] == 42
    assert "iat" in decoded
    assert "exp" in decoded
    assert decoded["exp"] > decoded["iat"]


def test_create_user_session_token_verify_signature():
    token = create_user_session_token(1, "sk-secret")
    assert _check_token(token, "sk-secret") is True


def test_create_user_session_token_wrong_key_fails():
    token = create_user_session_token(1, "sk-secret")
    assert _check_token(token, "sk-wrong") is False


def test_user_session_token_contains_user_id():
    token = create_user_session_token(99, "sk-key")
    decoded = jwt.decode(token, "sk-key", algorithms=["HS256"])
    assert decoded["user_id"] == 99


def test_user_session_token_expiry():
    token = create_user_session_token(1, "sk-key")
    decoded = jwt.decode(token, "sk-key", algorithms=["HS256"])
    import time

    # Should expire roughly 7 days from now
    expected_exp = int(time.time()) + (7 * 86400)
    assert abs(decoded["exp"] - expected_exp) < 5
