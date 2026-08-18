import os
import time

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from app.gateway import (
    _concurrent_counts,
    _concurrent_locks,
    _get_bearer_token,
    _get_x_api_key,
    _rate_buckets,
    acquire_concurrent_slot,
    authenticate_user,
    release_concurrent_slot,
)
from fastapi.testclient import TestClient


def test_get_bearer_token_valid():
    mock_request = MagicMock()
    mock_request.headers = {"authorization": "Bearer abc123"}
    assert _get_bearer_token(mock_request) == "abc123"


def test_get_bearer_token_no_auth():
    mock_request = MagicMock()
    mock_request.headers = {}
    assert _get_bearer_token(mock_request) is None


def test_get_bearer_token_basic():
    mock_request = MagicMock()
    mock_request.headers = {"authorization": "Basic abc"}
    assert _get_bearer_token(mock_request) is None


def test_get_bearer_token_empty():
    mock_request = MagicMock()
    mock_request.headers = {"authorization": ""}
    assert _get_bearer_token(mock_request) is None


def test_get_x_api_key_valid():
    mock_request = MagicMock()
    mock_request.headers = {"x-api-key": "abc123"}
    assert _get_x_api_key(mock_request) == "abc123"


def test_get_x_api_key_no_header():
    mock_request = MagicMock()
    mock_request.headers = {}
    assert _get_x_api_key(mock_request) is None


def test_get_x_api_key_empty():
    mock_request = MagicMock()
    mock_request.headers = {"x-api-key": ""}
    assert _get_x_api_key(mock_request) is None


async def test_authenticate_user_accepts_x_api_key():
    with patch("app.gateway.get_user_by_token", AsyncMock(return_value={"id": 1, "name": "alice"})) as mock_lookup:
        mock_request = MagicMock()
        mock_request.headers = {"x-api-key": "sk-valid"}
        user = await authenticate_user(mock_request)
        assert user == {"id": 1, "name": "alice"}
        mock_lookup.assert_awaited_once_with("sk-valid")


async def test_authenticate_user_x_api_key_invalid_returns_none():
    with patch("app.gateway.get_user_by_token", AsyncMock(return_value=None)) as mock_lookup:
        mock_request = MagicMock()
        mock_request.headers = {"x-api-key": "sk-invalid"}
        user = await authenticate_user(mock_request)
        assert user is None
        mock_lookup.assert_awaited_once_with("sk-invalid")


async def test_authenticate_user_bearer_preferred_over_x_api_key():
    with patch("app.gateway.get_user_by_token", AsyncMock(return_value={"id": 1, "name": "alice"})) as mock_lookup:
        mock_request = MagicMock()
        mock_request.headers = {"authorization": "Bearer sk-bearer", "x-api-key": "sk-api"}
        user = await authenticate_user(mock_request)
        assert user is not None
        mock_lookup.assert_awaited_once_with("sk-bearer")


async def test_authenticate_user_bearer_still_works():
    with patch("app.gateway.get_user_by_token", AsyncMock(return_value={"id": 1, "name": "alice"})) as mock_lookup:
        mock_request = MagicMock()
        mock_request.headers = {"authorization": "Bearer sk-bearer"}
        user = await authenticate_user(mock_request)
        assert user is not None
        mock_lookup.assert_awaited_once_with("sk-bearer")


async def test_consume_rate_token_first_call():
    with patch.dict("app.gateway._rate_buckets", {}):
        from app.gateway import consume_rate_token

        user = {"name": "alice", "rate_limit": 2.0}
        result = await consume_rate_token(user)
        assert result is True
        assert user["name"] in _rate_buckets


async def test_consume_rate_token_exhaust():
    _rate_buckets.clear()
    from app.gateway import consume_rate_token

    user = {"name": "bob", "rate_limit": 10.0}
    _rate_buckets["bob"] = {"tokens": 1, "last_refill": time.monotonic(), "rate": 10.0}
    result1 = await consume_rate_token(user)
    assert result1 is True
    result2 = await consume_rate_token(user)
    assert result2 is False
    _rate_buckets.clear()


async def test_consume_rate_token_refill():
    _rate_buckets.clear()
    from app.gateway import consume_rate_token

    user = {"name": "charlie", "rate_limit": 10.0}
    _rate_buckets["charlie"] = {"tokens": 0, "last_refill": time.monotonic() - 2, "rate": 10.0}
    result = await consume_rate_token(user)
    assert result is True
    _rate_buckets.clear()


async def test_acquire_concurrent_slot_within_limit():
    _concurrent_locks.clear()
    _concurrent_counts.clear()
    user = {"name": "alice", "max_concurrent": 2}
    result = await acquire_concurrent_slot(user)
    assert result is True
    assert _concurrent_counts["alice"] == 1


async def test_acquire_concurrent_slot_at_limit():
    _concurrent_locks.clear()
    _concurrent_counts.clear()
    user = {"name": "bob", "max_concurrent": 1}
    await acquire_concurrent_slot(user)
    result = await acquire_concurrent_slot(user)
    assert result is False


async def test_acquire_release_roundtrip():
    _concurrent_locks.clear()
    _concurrent_counts.clear()
    user = {"name": "charlie", "max_concurrent": 1}
    assert await acquire_concurrent_slot(user) is True
    release_concurrent_slot(user)
    assert await acquire_concurrent_slot(user) is True


async def test_release_does_not_go_below_zero():
    _concurrent_locks.clear()
    _concurrent_counts.clear()
    user = {"name": "dave", "max_concurrent": 1}
    _concurrent_counts["dave"] = 0
    release_concurrent_slot(user)
    assert _concurrent_counts["dave"] == 0


# ---------------------------------------------------------------------------
# End-to-end rejection shape tests (real FastAPI app, mocked upstream/DB).
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def mock_setup_complete():
    async def _mock_is_setup_complete():
        return True

    with patch("app.db.is_setup_complete", _mock_is_setup_complete):
        yield


@pytest.fixture(scope="module")
def client(mock_setup_complete):
    import tempfile

    import app.config

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_path = f.name
    try:
        app.config.settings.db_path = tmp_path
        from app.main import app

        with patch("app.main.ensure_models_sync", AsyncMock(return_value=set())), TestClient(app) as c:
            yield c
    finally:
        os.unlink(tmp_path)


def _gateway_user(name: str = "gw_user") -> dict:
    return {"name": name, "rate_limit": 100, "max_concurrent": 10, "id": 1, "daily_quota": None}


class TestAnthropicMessagesErrorShape:
    """Rejections on POST /v1/messages return the Anthropic error shape."""

    def test_401_invalid_key_anthropic_shape(self, client):
        resp = client.post("/v1/messages", headers={"Authorization": "Bearer sk-invalid"})
        assert resp.status_code == 401
        assert resp.json() == {
            "type": "error",
            "error": {"type": "authentication_error", "message": "Invalid or missing API key"},
        }
        assert "x-request-id" in resp.headers

    def test_401_no_auth_anthropic_shape(self, client):
        resp = client.post("/v1/messages")
        assert resp.status_code == 401
        assert resp.json()["error"]["type"] == "authentication_error"

    def test_429_rate_limit_anthropic_shape(self, client):
        test_user = {"name": "gw_rate_user", "rate_limit": 0.001, "max_concurrent": 1, "id": 555, "daily_quota": None}
        _rate_buckets["gw_rate_user"] = {"tokens": 0, "last_refill": 0, "rate": 0.001}
        try:
            with patch("app.gateway.authenticate_user") as mock_auth:
                mock_auth.return_value = test_user
                resp = client.post(
                    "/v1/messages", headers={"Authorization": "Bearer sk-test"}, json={"model": "m", "messages": []}
                )
            assert resp.status_code == 429
            assert resp.json() == {
                "type": "error",
                "error": {"type": "rate_limit_error", "message": "Rate limit exceeded"},
            }
        finally:
            _rate_buckets.clear()

    def test_503_no_model_anthropic_shape(self, client):
        with patch("app.gateway.authenticate_user") as mock_auth:
            mock_auth.return_value = _gateway_user()
            with (
                patch("app.gateway.is_ready", return_value=False),
                patch("app.gateway.get_active_models_cached", return_value=[]),
            ):
                resp = client.post(
                    "/v1/messages", headers={"Authorization": "Bearer sk-test"}, json={"model": "m", "messages": []}
                )
        assert resp.status_code == 503
        assert resp.json() == {
            "type": "error",
            "error": {"type": "api_error", "message": "No model is currently active or ready"},
        }


class TestOpenAIPathErrorShapeRegression:
    """Rejections on OpenAI paths keep their existing shape (not Anthropic)."""

    def test_401_openai_path_unchanged(self, client):
        resp = client.post("/v1/chat/completions", headers={"Authorization": "Bearer sk-invalid"})
        assert resp.status_code == 401
        assert resp.json() == {"detail": "Invalid or missing API key"}

    def test_503_openai_path_unchanged(self, client):
        with patch("app.gateway.authenticate_user") as mock_auth:
            mock_auth.return_value = _gateway_user()
            with (
                patch("app.gateway.is_ready", return_value=False),
                patch("app.gateway.get_active_models_cached", return_value=[]),
            ):
                resp = client.post(
                    "/v1/chat/completions",
                    headers={"Authorization": "Bearer sk-test"},
                    json={"model": "m", "messages": []},
                )
        assert resp.status_code == 503
        assert resp.json() == {
            "error": {
                "message": "No model is currently active or ready",
                "type": "model_unavailable",
                "code": "model_unavailable",
            }
        }


class _StreamRaisesConnectError:
    def __init__(self, exc):
        self._exc = exc

    def __aenter__(self):
        raise self._exc

    async def __aexit__(self, *args):
        return False


class TestAnthropicMessagesUpstreamFailure:
    """The body yielded on upstream ConnectError is Anthropic-shaped for /v1/messages."""

    def test_upstream_unreachable_anthropic_shape(self, client):
        with patch("app.gateway.authenticate_user") as mock_auth:
            mock_auth.return_value = _gateway_user()
            with (
                patch("app.gateway.is_ready", return_value=True),
                patch("app.gateway.get_active_models_cached", return_value=[{"model_id": "m", "active": True}]),
                patch("app.gateway.get_model_cached", return_value={"model_id": "m", "active": True}),
                patch("app.gateway.get_endpoint", return_value="http://m:30000"),
                patch("app.gateway.get_user_model_access", return_value=None),
                patch(
                    "app.gateway.httpx_pool.stream",
                    return_value=_StreamRaisesConnectError(httpx.ConnectError("connect fail")),
                ),
            ):
                resp = client.post(
                    "/v1/messages", headers={"Authorization": "Bearer sk-test"}, json={"model": "m", "messages": []}
                )
        assert resp.json() == {
            "type": "error",
            "error": {"type": "api_error", "message": "SGFleet model is not ready, please try again"},
        }
