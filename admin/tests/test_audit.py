import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.db import get_db


async def _ensure_tables():
    """Ensure audit tables exist."""
    async with get_db() as db:
        await db.execute("""CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL, action TEXT NOT NULL,
            target_user_id INTEGER DEFAULT NULL, detail TEXT DEFAULT '',
            ip_address TEXT DEFAULT ''
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS request_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL, user_id INTEGER DEFAULT NULL,
            request_id TEXT DEFAULT '', method TEXT DEFAULT '',
            endpoint TEXT DEFAULT '', status INTEGER DEFAULT 0,
            latency_ms REAL DEFAULT 0, error_msg TEXT DEFAULT '',
            prompt_tokens INTEGER DEFAULT NULL, completion_tokens INTEGER DEFAULT NULL
        )""")
        await db.commit()


async def test_log_admin_action():
    from app.audit import log_admin_action

    await _ensure_tables()
    await log_admin_action("create_user", 5, "created alice", "10.0.0.1")

    from app.audit import get_audit_log

    logs = await get_audit_log()
    assert len(logs) >= 1
    entry = logs[0]
    assert entry["action"] == "create_user"
    assert entry["target_user_id"] == 5
    assert entry["detail"] == "created alice"
    assert entry["ip_address"] == "10.0.0.1"


async def test_log_request():
    from app.audit import log_request

    await _ensure_tables()
    await log_request(1, "req-123", "POST", "/v1/chat", 200, 150.5, None)

    from app.audit import get_user_requests

    reqs = await get_user_requests(1)
    assert len(reqs) >= 1
    entry = reqs[0]
    assert entry["request_id"] == "req-123"
    assert entry["method"] == "POST"
    assert entry["endpoint"] == "/v1/chat"
    assert entry["status"] == 200
    assert entry["latency_ms"] == 150.5


async def test_log_request_with_error():
    from app.audit import log_request

    await _ensure_tables()
    await log_request(1, "req-err", "GET", "/health", 500, 0.5, "upstream timeout")

    from app.audit import get_user_requests

    reqs = await get_user_requests(1)
    assert reqs[0]["error_msg"] == "upstream timeout"


async def test_get_audit_log_empty():
    from app.audit import get_audit_log

    await _ensure_tables()
    logs = await get_audit_log()
    assert logs == []


async def test_get_user_requests_empty():
    from app.audit import get_user_requests

    await _ensure_tables()
    reqs = await get_user_requests(999)
    assert reqs == []


async def test_get_user_requests_filters_by_id():
    from app.audit import get_user_requests, log_request

    await _ensure_tables()
    await log_request(10, "r1", "GET", "/", 200, 1, None)
    await log_request(20, "r2", "GET", "/", 200, 1, None)

    reqs = await get_user_requests(10)
    assert len(reqs) == 1
    assert reqs[0]["user_id"] == 10


async def test_audit_log_limit():
    from app.audit import get_audit_log, log_admin_action

    await _ensure_tables()
    for i in range(5):
        await log_admin_action("action", None, f"detail {i}", None)

    logs = await get_audit_log(limit=3)
    assert len(logs) == 3
