"""Integration tests for the gateway proxy path.

Validates the full request flow: auth -> rate limit -> model routing -> proxy.
Uses TestClient against the real FastAPI app with mocked upstream.
"""

import json
import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.gateway import _rate_buckets
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    """Create a TestClient with a fresh database."""
    import tempfile

    import app.config

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        tmp_path = f.name
    try:
        app.config.settings.db_path = tmp_path
        from app.main import app

        with TestClient(app) as c:
            yield c
    finally:
        os.unlink(tmp_path)


def mock_user(name: str = "test_user") -> dict:
    """Return a dict that looks like an authenticated user."""
    return {
        "name": name,
        "rate_limit": 100,
        "max_concurrent": 10,
        "id": 1,
        "daily_quota": None,
    }


class TestGatewayAuth:
    """Test authentication in the gateway proxy path."""

    def test_401_no_auth(self, client):
        resp = client.post("/v1/chat/completions")
        assert resp.status_code == 401
        body = resp.json()
        assert "detail" in body

    def test_401_invalid_key(self, client):
        resp = client.post("/v1/chat/completions", headers={"Authorization": "Bearer sk-invalid-key"})
        assert resp.status_code == 401


class TestGateway503NoModel:
    """Test 503 response when no model is ready."""

    def test_503_no_ready_model(self, client):
        with patch("app.gateway.authenticate_user") as mock_auth:
            mock_auth.return_value = mock_user()
            with (
                patch("app.gateway.is_ready", return_value=False),
                patch("app.gateway.get_active_models_cached", return_value=[]),
            ):
                resp = client.post(
                    "/v1/chat/completions",
                    headers={"Authorization": "Bearer sk-test"},
                    json={"model": "test-model", "messages": []},
                )
        assert resp.status_code == 503
        body = resp.json()
        assert "error" in body
        assert body["error"]["type"] == "model_unavailable"

    def test_response_has_request_id(self, client):
        with patch("app.gateway.authenticate_user") as mock_auth:
            mock_auth.return_value = mock_user()
            with (
                patch("app.gateway.is_ready", return_value=False),
                patch("app.gateway.get_active_models_cached", return_value=[]),
            ):
                resp = client.post(
                    "/v1/chat/completions",
                    headers={"Authorization": "Bearer sk-test"},
                    json={"model": "test-model", "messages": []},
                )
        assert "x-request-id" in resp.headers


class TestGatewayProxySuccess:
    """Test successful proxy to upstream model."""

    def test_proxy_chat_completion(self, client):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        body_data = {
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "model": "test-model",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "Hello!"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
        }
        content = json.dumps(body_data).encode()

        async def async_iter(chunk_size=None):
            yield content

        mock_response.aiter_bytes = async_iter
        mock_response.__aenter__ = AsyncMock(return_value=mock_response)
        mock_response.__aexit__ = AsyncMock(return_value=None)

        with patch("app.gateway.authenticate_user") as mock_auth:
            mock_auth.return_value = mock_user()
            with (
                patch("app.gateway.is_ready", return_value=True),
                patch(
                    "app.gateway.get_active_models_cached", return_value=[{"model_id": "test-model", "active": True}]
                ),
                patch("app.gateway.get_model_cached", return_value={"model_id": "test-model", "active": True}),
                patch("app.gateway.get_endpoint", return_value="http://test-model:30000"),
                patch("app.gateway.httpx_pool.stream", return_value=mock_response),
                patch("app.gateway.acquire_concurrent_slot", return_value=True),
                patch("app.gateway.consume_rate_token", return_value=True),
                patch("app.gateway.get_user_model_access", return_value=None),
            ):
                resp = client.post(
                    "/v1/chat/completions",
                    headers={"Authorization": "Bearer sk-test"},
                    json={"model": "test-model", "messages": [{"role": "user", "content": "Hi"}]},
                )
        assert resp.status_code == 200


class TestGatewayRateLimit:
    """Test rate limiting in the gateway."""

    def test_429_rate_limited(self, client):
        test_user = {
            "name": "rate_limit_user",
            "rate_limit": 0.001,
            "max_concurrent": 1,
            "id": 999,
            "daily_quota": None,
        }
        _rate_buckets["rate_limit_user"] = {"tokens": 0, "last_refill": 0, "rate": 0.001}
        try:
            with patch("app.gateway.authenticate_user") as mock_auth:
                mock_auth.return_value = test_user
                with (
                    patch("app.gateway.is_ready", return_value=False),
                    patch("app.gateway.get_active_models_cached", return_value=[]),
                ):
                    resp = client.post(
                        "/v1/chat/completions",
                        headers={"Authorization": "Bearer sk-test"},
                        json={"model": "test", "messages": []},
                    )
            assert resp.status_code == 429
        finally:
            _rate_buckets.clear()


class TestCORS:
    """Test CORS preflight handling."""

    def test_options_returns_204(self, client):
        resp = client.options("/v1/chat/completions")
        assert resp.status_code == 204
        assert "access-control-allow-origin" in resp.headers


class TestAdminAPI:
    """Integration tests for admin API endpoints."""

    def test_dashboard_requires_auth(self, client):
        resp = client.get("/admin/api/dashboard")
        assert resp.status_code in (303, 302, 401)


class TestAdminLogin:
    """Integration tests for admin login endpoint."""

    def test_login_returns_redirect(self, client):
        resp = client.post("/admin/login", data={"key": "invalid-key"}, follow_redirects=False)
        assert resp.status_code == 303

    def test_logout_redirects(self, client):
        resp = client.get("/admin/logout", follow_redirects=False)
        assert resp.status_code == 303
