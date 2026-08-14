import os
import time

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from unittest.mock import patch

import app.db
import pytest
from app.db import _TOKEN_TTL, create_user, get_user_by_token


@pytest.mark.asyncio
async def test_first_call_hits_db_uncached():
    await create_user("alice", "sk-cache-test-1")
    app.db._token_cache.clear()
    assert len(app.db._token_cache) == 0
    result = await get_user_by_token("sk-cache-test-1")
    assert result is not None
    assert result["name"] == "alice"
    assert "sk-cache-test-1" in app.db._token_cache


@pytest.mark.asyncio
async def test_second_call_returns_from_cache():
    await create_user("bob", "sk-cache-test-2")
    # First call populates cache
    result1 = await get_user_by_token("sk-cache-test-2")
    assert result1 is not None
    ts1, _ = app.db._token_cache["sk-cache-test-2"]
    # Second call returns immediately from cache
    with patch("app.db._get_user_by_token_unsafe") as mock_db:
        result2 = await get_user_by_token("sk-cache-test-2")
        assert result2 is not None
        assert result2["name"] == "bob"
        mock_db.assert_not_called()


@pytest.mark.asyncio
async def test_cache_entry_expires_after_ttl():
    await create_user("carol", "sk-cache-test-3")
    # First call populates cache
    result = await get_user_by_token("sk-cache-test-3")
    assert result is not None
    assert "sk-cache-test-3" in app.db._token_cache
    # Mock time.monotonic to simulate TTL expiration
    expired_time = time.monotonic() + _TOKEN_TTL + 1
    with patch("time.monotonic", return_value=expired_time), patch("app.db._get_user_by_token_unsafe") as mock_db:
        mock_db.return_value = result
        result2 = await get_user_by_token("sk-cache-test-3")
        assert result2 is not None
        mock_db.assert_called_once_with("sk-cache-test-3")


@pytest.mark.asyncio
async def test_cache_clears_over_1000_entries():
    await create_user("dave", "sk-cache-clear-key")
    # Inject 1001 entries to exceed threshold
    for i in range(1001):
        app.db._token_cache[f"token-{i}"] = (time.monotonic(), {"name": f"user-{i}"})
    assert len(app.db._token_cache) == 1001
    # Next lookup should trigger cache clear and re-fetch from DB
    result = await get_user_by_token("sk-cache-clear-key")
    assert result is not None
    assert result["name"] == "dave"
    assert len(app.db._token_cache) <= 2
