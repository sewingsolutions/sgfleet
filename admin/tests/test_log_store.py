import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.db import get_db


async def _ensure_tables():
    async with get_db() as db:
        await db.execute("""CREATE TABLE IF NOT EXISTS admin_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            level TEXT NOT NULL,
            event TEXT,
            method TEXT,
            path TEXT,
            status INTEGER,
            latency_ms REAL,
            user TEXT,
            request_id TEXT,
            ip TEXT,
            error TEXT,
            message TEXT
        )""")
        await db.execute("""CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )""")
        await db.commit()


async def test_get_logs_empty():
    from app.log_store import get_logs

    await _ensure_tables()
    logs = await get_logs()
    assert logs == []


async def test_get_logs_returns_entries():
    await _ensure_tables()
    async with get_db() as db:
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:00", "INFO", "request", "GET", "/v1/chat", 200, 50.0, "alice", "req-1", "10.0.0.1", None, None),
        )
        await db.commit()

    from app.log_store import get_logs

    logs = await get_logs()
    assert len(logs) == 1
    assert logs[0]["user"] == "alice"
    assert logs[0]["method"] == "GET"
    assert logs[0]["status"] == 200


async def test_get_logs_filter_by_level():
    await _ensure_tables()
    async with get_db() as db:
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:00", "INFO", "request", "GET", "/v1/chat", 200, 50.0, "alice", "req-1", "10.0.0.1", None, None),
        )
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:01", "ERROR", "request", "POST", "/v1/chat", 500, 10.0, "bob", "req-2", "10.0.0.2", "error", None),
        )
        await db.commit()

    from app.log_store import get_logs

    logs = await get_logs(level="ERROR")
    assert len(logs) == 1
    assert logs[0]["user"] == "bob"


async def test_get_logs_filter_by_user():
    await _ensure_tables()
    async with get_db() as db:
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:00", "INFO", "request", "GET", "/v1/chat", 200, 50.0, "alice", "req-1", "10.0.0.1", None, None),
        )
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:01", "INFO", "request", "GET", "/v1/chat", 200, 50.0, "bob", "req-2", "10.0.0.2", None, None),
        )
        await db.commit()

    from app.log_store import get_logs

    logs = await get_logs(user="ali")
    assert len(logs) == 1
    assert logs[0]["user"] == "alice"


async def test_get_logs_filter_by_path():
    await _ensure_tables()
    async with get_db() as db:
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:00", "INFO", "request", "GET", "/v1/chat", 200, 50.0, "alice", "req-1", "10.0.0.1", None, None),
        )
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:01", "INFO", "request", "GET", "/health", 200, 5.0, "alice", "req-2", "10.0.0.1", None, None),
        )
        await db.commit()

    from app.log_store import get_logs

    logs = await get_logs(path="/v1")
    assert len(logs) == 1
    assert logs[0]["path"] == "/v1/chat"


async def test_get_logs_filter_by_keyword():
    await _ensure_tables()
    async with get_db() as db:
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:00", "INFO", "request", "GET", "/v1/chat", 200, 50.0, "alice", "req-1", "10.0.0.1", "timeout", None),
        )
        await db.execute(
            "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("2025-01-01T00:00:01", "INFO", "request", "GET", "/health", 200, 5.0, "alice", "req-2", "10.0.0.1", None, "all good"),
        )
        await db.commit()

    from app.log_store import get_logs

    logs = await get_logs(keyword="timeout")
    assert len(logs) == 1
    assert logs[0]["error"] == "timeout"


async def test_get_logs_limit():
    await _ensure_tables()
    async with get_db() as db:
        for i in range(5):
            await db.execute(
                "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"2025-01-01T00:00:{i:02d}", "INFO", "request", "GET", f"/path-{i}", 200, 10.0, "user", f"req-{i}", "10.0.0.1", None, None),
            )
        await db.commit()

    from app.log_store import get_logs

    logs = await get_logs(limit=2)
    assert len(logs) == 2


async def test_get_log_level_default():
    await _ensure_tables()
    from app.log_store import get_log_level

    level = await get_log_level()
    assert level == "DEBUG"


async def test_set_and_get_log_level():
    await _ensure_tables()
    from app.log_store import get_log_level, set_log_level

    await set_log_level("WARNING")
    level = await get_log_level()
    assert level == "WARNING"
