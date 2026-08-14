import os
from typing import cast

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

import pytest
from app.db import count_user_requests, create_user, get_user_by_name, get_user_requests


@pytest.mark.asyncio
async def test_get_user_requests_empty():
    await create_user("empty_requests_user", "sk-empty-req")
    uid = cast(dict, await get_user_by_name("empty_requests_user"))["id"]

    requests = await get_user_requests(uid)
    assert requests == []


@pytest.mark.asyncio
async def test_count_user_requests_empty():
    await create_user("empty_count_user", "sk-empty-count")
    uid = cast(dict, await get_user_by_name("empty_count_user"))["id"]

    count = await count_user_requests(uid)
    assert count == 0


@pytest.mark.asyncio
async def test_get_user_requests_pagination():
    await create_user("paginated_user", "sk-paginated")
    uid = cast(dict, await get_user_by_name("paginated_user"))["id"]

    import app.db

    async with app.db.get_db() as db:
        for i in range(15):
            await db.execute(
                """INSERT INTO request_log (timestamp, user_id, request_id, method, endpoint, status, latency_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"2025-01-01 00:00:{i:02d}", uid, f"req-{i}", "POST", "/v1/chat", 200, i * 10),
            )
        await db.commit()

    # Get first page
    page1 = await get_user_requests(uid, limit=5, offset=0)
    assert len(page1) == 5

    # Get second page
    page2 = await get_user_requests(uid, limit=5, offset=5)
    assert len(page2) == 5

    # Total count
    total = await count_user_requests(uid)
    assert total == 15


@pytest.mark.asyncio
async def test_get_user_requests_returns_correct_fields():
    await create_user("fields_user", "sk-fields")
    uid = cast(dict, await get_user_by_name("fields_user"))["id"]

    import app.db

    async with app.db.get_db() as db:
        await db.execute(
            """INSERT INTO request_log (timestamp, user_id, request_id, method, endpoint, status, latency_ms, error_msg, prompt_tokens, completion_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ("2025-01-01 12:00:00", uid, "req-test", "POST", "/v1/chat/completions", 200, 150.5, "", 100, 200),
        )
        await db.commit()

    requests = await get_user_requests(uid)
    assert len(requests) == 1
    r = requests[0]
    assert r["request_id"] == "req-test"
    assert r["method"] == "POST"
    assert r["endpoint"] == "/v1/chat/completions"
    assert r["status"] == 200
    assert r["latency_ms"] == 150.5
    assert r["error_msg"] == ""
    assert r["prompt_tokens"] == 100
    assert r["completion_tokens"] == 200


@pytest.mark.asyncio
async def test_get_user_requests_ordered_desc():
    await create_user("order_user", "sk-order")
    uid = cast(dict, await get_user_by_name("order_user"))["id"]

    import app.db

    async with app.db.get_db() as db:
        for i in range(3):
            await db.execute(
                """INSERT INTO request_log (timestamp, user_id, request_id, method, endpoint, status, latency_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (f"2025-01-01 00:00:{i:02d}", uid, f"req-{i}", "POST", "/v1/chat", 200, i),
            )
        await db.commit()

    requests = await get_user_requests(uid)
    # Should be ordered by id DESC
    ids = [r["request_id"] for r in requests]
    assert ids == ["req-2", "req-1", "req-0"]


@pytest.mark.asyncio
async def test_count_user_requests_nonexistent_user():
    count = await count_user_requests(99999)
    assert count == 0


@pytest.mark.asyncio
async def test_get_user_requests_nonexistent_user():
    requests = await get_user_requests(99999)
    assert requests == []


@pytest.mark.asyncio
async def test_get_user_requests_coalesce_null_tokens():
    await create_user("null_tokens_user", "sk-null-tokens")
    uid = cast(dict, await get_user_by_name("null_tokens_user"))["id"]

    import app.db

    async with app.db.get_db() as db:
        await db.execute(
            """INSERT INTO request_log (timestamp, user_id, request_id, method, endpoint, status, latency_ms, prompt_tokens, completion_tokens)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)""",
            ("2025-01-01 12:00:00", uid, "req-null", "POST", "/v1/chat", 200, 100),
        )
        await db.commit()

    requests = await get_user_requests(uid)
    assert len(requests) == 1
    assert requests[0]["prompt_tokens"] == 0
    assert requests[0]["completion_tokens"] == 0
