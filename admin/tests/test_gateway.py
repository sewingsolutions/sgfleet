import os
import time

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from unittest.mock import MagicMock, patch

from app.gateway import (
    _concurrent_counts,
    _concurrent_locks,
    _get_bearer_token,
    _rate_buckets,
    acquire_concurrent_slot,
    release_concurrent_slot,
)


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
