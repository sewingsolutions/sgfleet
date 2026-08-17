import os
from typing import cast

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import jwt
import pytest
from app.auth import create_user_session_token
from app.db import (
    create_user,
    get_user_by_name,
    get_user_summary,
    get_user_total_today,
    get_user_usage,
)


@pytest.mark.asyncio
async def test_get_user_total_today_empty():
    await create_user("today_user", "sk-today")
    uid = cast(dict, await get_user_by_name("today_user"))["id"]

    count = await get_user_total_today(uid)
    assert count == 0


@pytest.mark.asyncio
async def test_get_user_total_today_with_data():
    await create_user("today_data_user", "sk-today-data")
    uid = cast(dict, await get_user_by_name("today_data_user"))["id"]

    from datetime import UTC, datetime

    import app.db

    now = datetime.now(UTC)
    today_hour = now.strftime("%Y-%m-%d %H:00")

    async with app.db.get_db() as db:
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count) VALUES (?, ?, ?)",
            (uid, today_hour, 42),
        )
        await db.commit()

    count = await get_user_total_today(uid)
    assert count == 42


@pytest.mark.asyncio
async def test_get_user_summary_empty():
    await create_user("summary_user", "sk-summary")
    uid = cast(dict, await get_user_by_name("summary_user"))["id"]

    summary = await get_user_summary(uid)
    assert summary["total_requests"] == 0
    assert summary["total_cost"] == 0.0
    assert summary["prompt_tokens"] == 0
    assert summary["completion_tokens"] == 0
    assert summary["total_tokens"] == 0


@pytest.mark.asyncio
async def test_get_user_summary_with_data():
    await create_user("summary_data_user", "sk-summary-data")
    uid = cast(dict, await get_user_by_name("summary_data_user"))["id"]

    import app.db

    async with app.db.get_db() as db:
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (uid, "2025-01-01 00:00", 10, 0.05, 1000, 500, 1500),
        )
        await db.commit()

    summary = await get_user_summary(uid)
    assert summary["total_requests"] == 10
    assert summary["total_cost"] == 0.05
    assert summary["prompt_tokens"] == 1000
    assert summary["completion_tokens"] == 500
    assert summary["total_tokens"] == 1500


@pytest.mark.asyncio
async def test_get_user_usage_empty():
    await create_user("usage_user", "sk-usage")
    uid = cast(dict, await get_user_by_name("usage_user"))["id"]

    rows = await get_user_usage(uid)
    assert rows == []


@pytest.mark.asyncio
async def test_get_user_usage_with_since():
    await create_user("usage_since_user", "sk-usage-since")
    uid = cast(dict, await get_user_by_name("usage_since_user"))["id"]

    import app.db

    async with app.db.get_db() as db:
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (uid, "2025-01-01 00:00", 5, 0.01, 200, 100, 300),
        )
        await db.execute(
            "INSERT INTO user_usage (user_id, hour, request_count, total_cost, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (uid, "2025-01-01 01:00", 3, 0.006, 100, 50, 150),
        )
        await db.commit()

    rows = await get_user_usage(uid, since_str="2025-01-01 00:30:00")
    assert len(rows) == 1
    assert rows[0]["request_count"] == 3


@pytest.mark.asyncio
async def test_user_session_token_expiry_duration():
    """User session tokens should have the same 7-day expiry as admin tokens."""

    token = create_user_session_token(1, "sk-key")
    decoded = jwt.decode(token, "sk-key", algorithms=["HS256"])
    duration = decoded["exp"] - decoded["iat"]
    assert duration == 7 * 86400
