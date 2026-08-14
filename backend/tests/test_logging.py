import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.db import get_db


async def _ensure_log_table():
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
        await db.commit()


class TestJSONFormatter:
    def test_format_plain_message(self):
        import json
        import logging

        from app.logging import JSONFormatter

        record = logging.LogRecord(
            name="test-logger",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="hello world",
            args=(),
            exc_info=None,
        )
        formatter = JSONFormatter()
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["message"] == "hello world"
        assert parsed["level"] == "INFO"
        assert parsed["logger"] == "test-logger"

    def test_format_request_log(self):
        import json
        import logging

        from app.logging import JSONFormatter

        record = logging.LogRecord(
            name="sgfleet-admin",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="",
            args=(),
            exc_info=None,
        )
        record.request = {  # type: ignore
            "event": "request",
            "method": "POST",
            "path": "/v1/chat/completions",
            "status": 200,
            "latency_ms": 123.4,
            "user": "alice",
            "request_id": "req-123",
            "ip": "10.0.0.1",
            "error": "some error",
        }
        formatter = JSONFormatter()
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["method"] == "POST"
        assert parsed["path"] == "/v1/chat/completions"
        assert parsed["status"] == 200
        assert parsed["user"] == "alice"
        assert parsed["error"] == "some error"


class TestLogDBHandler:
    async def test_emit_request_log(self):
        await _ensure_log_table()
        import logging

        from app.logging import LogDBHandler

        handler = LogDBHandler()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="",
            args=(),
            exc_info=None,
        )
        record.request = {
            "event": "request",
            "method": "GET",
            "path": "/health",
            "status": 200,
            "latency_ms": 5.0,
            "user": "test-user",
            "request_id": "req-abc",
            "ip": "127.0.0.1",
            "error": None,
        }
        handler.emit(record)

        async with get_db() as db, db.execute("SELECT * FROM admin_log ORDER BY id DESC LIMIT 1") as cursor:
            row = await cursor.fetchone()
            assert row is not None
            assert row[3] == "request"  # event
            assert row[4] == "GET"  # method
            assert row[6] == 200  # status

    async def test_emit_skips_non_request(self):
        await _ensure_log_table()
        import logging

        from app.logging import LogDBHandler

        handler = LogDBHandler()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="plain log",
            args=(),
            exc_info=None,
        )
        handler.emit(record)

        async with get_db() as db, db.execute("SELECT COUNT(*) FROM admin_log") as cursor:
            row = await cursor.fetchone()
            assert row is not None
            assert row[0] == 0

    async def test_emit_keeps_max_1000(self):
        await _ensure_log_table()
        import logging

        from app.logging import LogDBHandler

        handler = LogDBHandler()
        for i in range(1010):
            record = logging.LogRecord(
                name="test",
                level=logging.INFO,
                pathname="",
                lineno=0,
                msg="",
                args=(),
                exc_info=None,
            )
            record.request = {
                "event": "request",
                "method": "GET",
                "path": "/test",
                "status": 200,
                "latency_ms": 1.0,
                "user": f"user-{i}",
                "request_id": f"req-{i}",
                "ip": "127.0.0.1",
                "error": None,
            }
            handler.emit(record)

        async with get_db() as db, db.execute("SELECT COUNT(*) FROM admin_log") as cursor:
            row = await cursor.fetchone()
            assert row is not None
            assert row[0] == 1000


class TestSetupLogging:
    def test_returns_logger(self):
        from app.logging import setup_logging

        logger = setup_logging()
        assert logger.name == "sgfleet-admin"

    def test_set_logger_level(self):
        import logging

        from app.logging import set_logger_level, setup_logging

        logger = setup_logging()
        set_logger_level(logger, "WARNING")
        assert logger.level == logging.WARNING
