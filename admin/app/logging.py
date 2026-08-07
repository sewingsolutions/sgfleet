import json
import logging
import sqlite3
import sys
import threading
from datetime import UTC, datetime

from .config import settings


class JSONFormatter(logging.Formatter):
    def format(self, record):
        log = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
        }
        req = getattr(record, "request", None)
        if req:
            log["event"] = req.get("event")
            log["method"] = req.get("method")
            log["path"] = req.get("path")
            log["status"] = req.get("status")
            log["latency_ms"] = round(req.get("latency_ms", 0), 1)
            if req.get("user"):
                log["user"] = req["user"]
            if req.get("request_id"):
                log["request_id"] = req["request_id"]
            if req.get("ip"):
                log["ip"] = req["ip"]
            if req.get("error"):
                log["error"] = req["error"]
        else:
            log["message"] = record.getMessage()
        return json.dumps(log)


_db_lock = threading.Lock()


class LogDBHandler(logging.Handler):
    """Writes log entries directly to SQLite (thread-safe, WAL mode)."""

    def emit(self, record):
        try:
            req = getattr(record, "request", None)
            if not req:
                return  # Skip non-request logs
            with _db_lock:
                conn = sqlite3.connect(settings.db_path)
                try:
                    conn.execute("PRAGMA journal_mode=WAL")
                    conn.execute(
                        "INSERT INTO admin_log (timestamp, level, event, method, path, status, latency_ms, user, request_id, ip, error, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            datetime.now(UTC).isoformat(),
                            record.levelname,
                            req.get("event"),
                            req.get("method"),
                            req.get("path"),
                            req.get("status"),
                            round(req.get("latency_ms", 0), 1),
                            req.get("user"),
                            req.get("request_id"),
                            req.get("ip"),
                            req.get("error"),
                            None,
                        ),
                    )
                    conn.execute(
                        "DELETE FROM admin_log WHERE id NOT IN (SELECT id FROM admin_log ORDER BY id DESC LIMIT ?)",
                        (1000,),
                    )
                    conn.commit()
                finally:
                    conn.close()
        except Exception:
            pass


def setup_logging(log_level: str = "DEBUG"):
    logger = logging.getLogger("sgfleet-admin")
    logger.setLevel(getattr(logging, log_level.upper(), logging.DEBUG))

    stderr_handler = logging.StreamHandler(sys.stderr)
    stderr_handler.setFormatter(JSONFormatter())
    logger.addHandler(stderr_handler)

    db_handler = LogDBHandler()
    db_handler.setLevel(getattr(logging, log_level.upper(), logging.DEBUG))
    logger.addHandler(db_handler)

    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").handlers = []

    return logger


def get_log_queue():
    """Compatibility stub - no longer used."""
    return None


def set_logger_level(logger: logging.Logger, level_name: str) -> None:
    lvl = getattr(logging, level_name.upper(), logging.DEBUG)
    logger.setLevel(lvl)
    for h in logger.handlers:
        h.setLevel(lvl)
