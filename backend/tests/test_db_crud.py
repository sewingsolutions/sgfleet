import os
from datetime import UTC, datetime

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import pytest
from app.db import (
    create_user,
    get_all_users,
    get_user_by_id,
    get_user_by_name,
    get_user_summary,
    get_user_total_today,
    get_user_usage,
    rotate_key,
    soft_delete,
    update_user,
    upsert_usage,
)


@pytest.mark.asyncio
async def test_create_user():
    result = await create_user("alice", "sk-test-key-123", 5.0, 3, 0.002, 100, "alice@test.com", "test user")
    assert result["name"] == "alice"
    assert result["is_active"] is True
    assert result["rate_limit"] == 5.0
    assert result["max_concurrent"] == 3
    assert result["request_cost"] == 0.002
    assert result["daily_quota"] == 100
    assert result["email"] == "alice@test.com"
    assert result["notes"] == "test user"


@pytest.mark.asyncio
async def test_get_user_by_id():
    user = await create_user("bob", "sk-bob-key")
    uid = user["id"]
    fetched = await get_user_by_id(uid)
    assert fetched is not None
    assert fetched["name"] == "bob"
    assert fetched["id"] == uid


@pytest.mark.asyncio
async def test_get_user_by_id_none():
    result = await get_user_by_id(99999)
    assert result is None


@pytest.mark.asyncio
async def test_get_user_by_name():
    await create_user("carol", "sk-carol-key")
    fetched = await get_user_by_name("carol")
    assert fetched is not None
    assert fetched["name"] == "carol"


@pytest.mark.asyncio
async def test_get_user_by_name_not_found():
    result = await get_user_by_name("nonexistent_user_xyz")
    assert result is None


@pytest.mark.asyncio
async def test_get_all_users():
    await create_user("dave", "sk-dave-key")
    await create_user("eve", "sk-eve-key")
    users = await get_all_users()
    names = [u["name"] for u in users]
    assert "dave" in names
    assert "eve" in names
    assert len(users) == 2


@pytest.mark.asyncio
async def test_update_user_fields():
    user = await create_user("frank", "sk-frank-key")
    uid = user["id"]
    await update_user(uid, is_active=False)
    await update_user(uid, rate_limit=5.0)
    await update_user(uid, max_concurrent=10)
    await update_user(uid, request_cost=0.05)
    await update_user(uid, daily_quota=500)
    await update_user(uid, email="frank@example.com")
    await update_user(uid, notes="updated notes")
    updated = await get_user_by_id(uid)
    assert updated["is_active"] is False
    assert updated["rate_limit"] == 5.0
    assert updated["max_concurrent"] == 10
    assert updated["request_cost"] == 0.05
    assert updated["daily_quota"] == 500
    assert updated["email"] == "frank@example.com"
    assert updated["notes"] == "updated notes"


@pytest.mark.asyncio
async def test_soft_delete():
    user = await create_user("grace", "sk-grace-key")
    uid = user["id"]
    await soft_delete(uid)
    deleted = await get_user_by_id(uid)
    assert deleted["is_active"] is False


@pytest.mark.asyncio
async def test_rotate_key():
    user = await create_user("hank", "sk-old-key")
    uid = user["id"]
    await rotate_key(uid, "sk-new-key")
    updated = await get_user_by_id(uid)
    assert updated["api_key"] == "sk-new-key"
    from app.db import verify_key

    assert verify_key("sk-new-key", updated["api_key_hash"]) is True
    assert verify_key("sk-old-key", updated["api_key_hash"]) is False


@pytest.mark.asyncio
async def test_upsert_usage_first_insert():
    await create_user("ivy", "sk-ivy-key")
    ivy = await get_user_by_name("ivy")
    uid = ivy["id"]
    await upsert_usage(uid, 0.5, 100, 200)
    usage = await get_user_usage(uid)
    assert len(usage) == 1
    assert usage[0]["request_count"] == 1
    assert usage[0]["total_cost"] == 0.5
    assert usage[0]["prompt_tokens"] == 100
    assert usage[0]["completion_tokens"] == 200
    assert usage[0]["total_tokens"] == 300


@pytest.mark.asyncio
async def test_upsert_usage_same_hour_increment():
    await create_user("jack", "sk-jack-key")
    jack = await get_user_by_name("jack")
    uid = jack["id"]
    await upsert_usage(uid, 0.1)
    await upsert_usage(uid, 0.2)
    usage = await get_user_usage(uid)
    assert len(usage) == 1
    assert usage[0]["request_count"] == 2
    assert abs(usage[0]["total_cost"] - 0.3) < 0.001


@pytest.mark.asyncio
async def test_get_user_usage():
    await create_user("kate", "sk-kate-key")
    kate = await get_user_by_name("kate")
    uid = kate["id"]
    from app.db import get_db

    now = datetime.now(UTC)
    hour_str = now.strftime("%Y-%m-%d %H:00")
    since_str = now.strftime("%Y-%m-%d 00:00")
    async with get_db() as db:
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, 1, 0.1, 10, 20, 30)",
            (uid, hour_str),
        )
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, 2, 0.3, 30, 40, 70)",
            (uid, now.strftime("%Y-%m-%d 01:00")),
        )
        await db.commit()
    usage = await get_user_usage(uid, since_str=since_str)
    assert len(usage) == 2
    total_reqs = sum(u["request_count"] for u in usage)
    assert total_reqs == 3


@pytest.mark.asyncio
async def test_get_user_total_today():
    await create_user("leo", "sk-leo-test-key")
    leo = await get_user_by_name("leo")
    uid = leo["id"]
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    from app.db import get_db

    async with get_db() as db:
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, 3, 0.5, 0, 0, 0)",
            (uid, f"{today} 10:00"),
        )
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, 7, 1.2, 0, 0, 0)",
            (uid, f"{today} 14:00"),
        )
        await db.commit()
    total = await get_user_total_today(uid)
    assert total == 10


@pytest.mark.asyncio
async def test_get_user_total_today_no_usage():
    user = await create_user("mia", "sk-mia-key")
    uid = user["id"]
    total = await get_user_total_today(uid)
    assert total == 0


@pytest.mark.asyncio
async def test_get_user_summary():
    user = await create_user("nick", "sk-nick-key", daily_quota=200)
    uid = user["id"]
    from app.db import get_db

    today = datetime.now(UTC).strftime("%Y-%m-%d")
    async with get_db() as db:
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, 5, 0.5, 100, 200, 300)",
            (uid, f"{today} 08:00"),
        )
        await db.commit()
    summary = await get_user_summary(uid)
    assert summary["total_requests"] == 5
    assert summary["today_requests"] == 5
    assert abs(summary["total_cost"] - 0.5) < 0.001
    assert summary["daily_quota"] == 200
    assert summary["prompt_tokens"] == 100
    assert summary["completion_tokens"] == 200
    assert summary["total_tokens"] == 300
