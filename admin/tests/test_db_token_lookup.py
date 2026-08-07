import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import pytest
from app.db import create_user, get_user_by_name, get_user_by_token, soft_delete, update_user


@pytest.mark.asyncio
async def test_get_user_by_token_valid():
    await create_user("alice", "sk-valid-token")
    result = await get_user_by_token("sk-valid-token")
    assert result is not None
    assert result["name"] == "alice"


@pytest.mark.asyncio
async def test_get_user_by_token_invalid():
    result = await get_user_by_token("sk-nonexistent-token")
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_token_inactive_user():
    user = await create_user("bob", "sk-bob-token")
    uid = user["id"]
    await soft_delete(uid)
    result = await get_user_by_token("sk-bob-token")
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_token_respects_is_active():
    user = await create_user("carol", "sk-carol-token")
    uid = user["id"]
    # Active by default
    result = await get_user_by_token("sk-carol-token")
    assert result is not None
    assert result["is_active"] is True
    # Deactivate
    import app.db

    app.db._token_cache.clear()
    await update_user(uid, is_active=False)
    result = await get_user_by_token("sk-carol-token")
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_token_quick_hash_path():
    await create_user("dave", "sk-quick-hash-key")
    result = await get_user_by_token("sk-quick-hash-key")
    assert result is not None
    assert result["name"] == "dave"


@pytest.mark.asyncio
async def test_get_user_by_name_returns_none_for_unknown():
    result = await get_user_by_name("totally_unknown_user_abc123")
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_token_returns_correct_fields():
    await create_user("eve", "sk-eve-key", 5.0, 3, 0.002, 100)
    result = await get_user_by_token("sk-eve-key")
    assert result is not None
    assert result["name"] == "eve"
    assert result["rate_limit"] == 5.0
    assert result["max_concurrent"] == 3
    assert result["request_cost"] == 0.002
    assert result["daily_quota"] == 100
