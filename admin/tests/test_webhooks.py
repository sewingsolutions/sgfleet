import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import hashlib
import hmac
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.webhooks import notify


@pytest.mark.asyncio
async def test_notify_sends_post_to_matching_webhook():
    from app.db import get_db

    async with get_db() as db:
        await db.execute(
            "INSERT INTO webhooks (name, url, events, is_active, secret) VALUES (?, ?, ?, 1, ?)",
            ("test-hook", "http://webhook.example.com/hook", json.dumps(["quota_warning"]), None),
        )
        await db.commit()

    with patch("app.webhooks.httpx.AsyncClient") as mock_client_cls:
        mock_instance = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        await notify("quota_warning", {"user_id": 1, "user_name": "alice"})

        mock_instance.post.assert_called_once()
        call_kwargs = mock_instance.post.call_args
        assert call_kwargs[0][0] == "http://webhook.example.com/hook"
        body = json.loads(call_kwargs[1]["content"])
        assert body["event"] == "quota_warning"
        assert body["payload"]["user_id"] == 1
        assert body["payload"]["user_name"] == "alice"


@pytest.mark.asyncio
async def test_notify_skips_inactive_webhooks():
    from app.db import get_db

    async with get_db() as db:
        await db.execute(
            "INSERT INTO webhooks (name, url, events, is_active, secret) VALUES (?, ?, ?, 0, ?)",
            ("inactive-hook", "http://webhook.example.com/inactive", json.dumps(["quota_warning"]), None),
        )
        await db.commit()

    with patch("app.webhooks.httpx.AsyncClient") as mock_client_cls:
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        await notify("quota_warning", {"user_id": 1})
        mock_instance.post.assert_not_called()


@pytest.mark.asyncio
async def test_notify_skips_non_matching_event():
    from app.db import get_db

    async with get_db() as db:
        await db.execute(
            "INSERT INTO webhooks (name, url, events, is_active, secret) VALUES (?, ?, ?, 1, ?)",
            ("selective-hook", "http://webhook.example.com/selective", json.dumps(["key_rotated"]), None),
        )
        await db.commit()

    with patch("app.webhooks.httpx.AsyncClient") as mock_client_cls:
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        await notify("quota_warning", {"user_id": 1})
        mock_instance.post.assert_not_called()


@pytest.mark.asyncio
async def test_notify_hmac_signature():
    from app.db import get_db

    secret = "my-secret-key"
    async with get_db() as db:
        await db.execute(
            "INSERT INTO webhooks (name, url, events, is_active, secret) VALUES (?, ?, ?, 1, ?)",
            ("signed-hook", "http://webhook.example.com/signed", json.dumps(["key_rotated"]), secret),
        )
        await db.commit()

    with patch("app.webhooks.httpx.AsyncClient") as mock_client_cls:
        mock_instance = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        payload = {"user_id": 42, "user_name": "bob"}
        await notify("key_rotated", payload)

        call_kwargs = mock_instance.post.call_args
        headers = call_kwargs[1]["headers"]
        body = call_kwargs[1]["content"]
        expected_sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        assert "X-Webhook-Signature" in headers
        assert headers["X-Webhook-Signature"] == f"sha256={expected_sig}"


@pytest.mark.asyncio
async def test_notify_no_webhooks_returns_early():
    """When there are no webhooks, notify returns without doing anything."""
    with patch("app.webhooks.httpx.AsyncClient") as mock_client_cls:
        await notify("quota_warning", {"user_id": 1})
        assert not mock_client_cls.called


@pytest.mark.asyncio
async def test_notify_handles_http_failure_gracefully():
    from app.db import get_db

    async with get_db() as db:
        await db.execute(
            "INSERT INTO webhooks (name, url, events, is_active, secret) VALUES (?, ?, ?, 1, ?)",
            ("fail-hook", "http://webhook.example.com/fail", json.dumps(["rate_limited_spike"]), None),
        )
        await db.commit()

    with patch("app.webhooks.httpx.AsyncClient") as mock_client_cls:
        mock_instance = MagicMock()
        mock_instance.post = AsyncMock(side_effect=Exception("connection refused"))
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        # Should not raise
        await notify("rate_limited_spike", {"user_id": 5})


@pytest.mark.asyncio
async def test_notify_content_type_header():
    from app.db import get_db

    async with get_db() as db:
        await db.execute(
            "INSERT INTO webhooks (name, url, events, is_active, secret) VALUES (?, ?, ?, 1, ?)",
            ("ct-hook", "http://webhook.example.com/ct", json.dumps(["user_disabled"]), None),
        )
        await db.commit()

    with patch("app.webhooks.httpx.AsyncClient") as mock_client_cls:
        mock_instance = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_instance.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_instance)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        await notify("user_disabled", {"user_id": 10, "user_name": "carol"})

        call_kwargs = mock_instance.post.call_args
        headers = call_kwargs[1]["headers"]
        assert headers["Content-Type"] == "application/json"
