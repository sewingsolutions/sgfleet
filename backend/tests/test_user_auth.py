import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import pytest
from app.db import create_user, get_user_by_token


@pytest.mark.asyncio
async def test_get_user_by_token_returns_api_key():
    """get_user_by_token must return the api_key for the login flow to work."""
    await create_user("token_api_key_user", "sk-token-api-key")
    result = await get_user_by_token("sk-token-api-key")
    assert result is not None
    assert "api_key" in result
    assert result["api_key"] == "sk-token-api-key"


@pytest.mark.asyncio
async def test_get_user_by_token_returns_api_key_fallback_path():
    """Also test the fallback path returns api_key."""
    await create_user("fallback_api_key_user", "sk-fallback-key")
    import app.db

    app.db._token_cache.clear()
    # Remove quick hash to force fallback path
    async with app.db.get_db() as db:
        await db.execute("UPDATE users SET api_key_quick_hash = NULL WHERE name = ?", ("fallback_api_key_user",))
        await db.commit()

    app.db._token_cache.clear()
    result = await get_user_by_token("sk-fallback-key")
    assert result is not None
    assert result["api_key"] == "sk-fallback-key"


@pytest.mark.asyncio
async def test_get_user_by_token_api_key_matches_provided_token():
    """Ensure the returned api_key is the token that was verified, not something else."""
    await create_user("exact_key_user", "sk-exact-123")
    result = await get_user_by_token("sk-exact-123")
    assert result is not None
    assert result["api_key"] == "sk-exact-123"
