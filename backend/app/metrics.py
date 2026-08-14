"""In-memory metrics store for real-time latency and 429 data.

Stores per-user latency samples and 429 rejection timestamps, pruned
periodically. Queried by metrics_api for hourly stats and fleet dashboards.
"""

import threading
import time
from datetime import UTC, datetime


class _UserMetrics:
    __slots__ = ("latency", "reject_ts", "lock")

    def __init__(self) -> None:
        self.latency: list[tuple[float, float]] = []
        self.reject_ts: list[float] = []
        self.lock = threading.Lock()


_store: dict[str, _UserMetrics] = {}
_store_lock = threading.Lock()


def _get_user(name: str) -> _UserMetrics:
    if name not in _store:
        with _store_lock:
            _store.setdefault(name, _UserMetrics())
    return _store[name]


def add_user_latency(user: str, latency: float) -> None:
    now = time.time()
    um = _get_user(user)
    with um.lock:
        um.latency.append((now, latency))
        if len(um.latency) > 200_000:
            cutoff = now - 86400
            um.latency = [(ts, v) for ts, v in um.latency if ts >= cutoff]


def add_user_429(user: str) -> None:
    um = _get_user(user)
    with um.lock:
        um.reject_ts.append(time.time())


def get_user_latency_percentiles(user: str, since: float, percentile: float) -> float:
    um = _store.get(user)
    if not um:
        return 0.0
    with um.lock:
        samples = [v for ts, v in um.latency if ts >= since]
    if not samples:
        return 0.0
    samples.sort()
    idx = int(len(samples) * percentile / 100)
    return round(samples[min(idx, len(samples) - 1)], 3)


def get_user_429_count(user: str, since: float) -> int:
    um = _store.get(user)
    if not um:
        return 0
    with um.lock:
        return sum(1 for ts in um.reject_ts if ts >= since)


def get_fleet_latency_percentiles(since: float, percentile: float) -> float:
    all_samples: list[float] = []
    for um in _store.values():
        with um.lock:
            all_samples.extend(v for ts, v in um.latency if ts >= since)
    if not all_samples:
        return 0.0
    all_samples.sort()
    idx = int(len(all_samples) * percentile / 100)
    return round(all_samples[min(idx, len(all_samples) - 1)], 3)


def get_fleet_429_count(since: float) -> int:
    total = 0
    for um in _store.values():
        with um.lock:
            total += sum(1 for ts in um.reject_ts if ts >= since)
    return total


def get_fleet_total_latency(since: float) -> float:
    total = 0.0
    count = 0
    for um in _store.values():
        with um.lock:
            for ts, v in um.latency:
                if ts >= since:
                    total += v
                    count += 1
    return round(total / count, 3) if count else 0.0


def get_user_latency_percentiles_per_hour(name: str, since: float) -> dict[str, list[float]]:
    """Return {hour_label: [p50, p95]} for each hour in range."""
    um = _store.get(name)
    if not um:
        return {}
    hours: dict[int, list[float]] = {}
    with um.lock:
        for ts, v in um.latency:
            if ts >= since:
                hour_key = int(ts // 3600) * 3600
                hours.setdefault(hour_key, []).append(v)
    result: dict[str, list[float]] = {}
    for epoch, vals in sorted(hours.items()):
        vals.sort()
        p50_idx = int(len(vals) * 0.5)
        p95_idx = int(len(vals) * 0.95)
        label = datetime.fromtimestamp(epoch, tz=UTC).strftime("%Y-%m-%d %H:00")
        result[label] = [round(vals[min(p50_idx, len(vals) - 1)], 3), round(vals[min(p95_idx, len(vals) - 1)], 3)]
    return result


def get_user_429_per_hour(name: str, since: float) -> "dict[str, int]":
    um = _store.get(name)
    if not um:
        return {}
    hours: dict[int, int] = {}
    with um.lock:
        for ts in um.reject_ts:
            if ts >= since:
                hour_key = int(ts // 3600) * 3600
                hours[hour_key] = hours.get(hour_key, 0) + 1
    result: dict[str, int] = {}
    for epoch, count in sorted(hours.items()):
        label = datetime.fromtimestamp(epoch, tz=UTC).strftime("%Y-%m-%d %H:00")
        result[label] = count
    return result


CLEANUP_INTERVAL = 60
MAX_SAMPLES_PER_BIN = 100_000


async def cleanup() -> None:
    import asyncio

    while True:
        await asyncio.sleep(CLEANUP_INTERVAL)
        cutoff = time.time() - 604800
        empty_names: list[str] = []
        for name in list(_store.keys()):
            um = _store[name]
            with um.lock:
                um.latency = [(ts, v) for ts, v in um.latency if ts >= cutoff]
                if len(um.latency) > MAX_SAMPLES_PER_BIN:
                    um.latency = um.latency[-MAX_SAMPLES_PER_BIN:]
                um.reject_ts = [ts for ts in um.reject_ts if ts >= cutoff]
                if not um.latency and not um.reject_ts:
                    empty_names.append(name)
        with _store_lock:
            for name in empty_names:
                _store.pop(name, None)


def get_all_user_names() -> list[str]:
    return list(_store.keys())


def get_fleet_latency_per_hour(since: float) -> dict[str, list[float]]:
    """Return {hour_label: [p50, p95]} for all users aggregated fleet-wide per hour."""
    hours: dict[int, list[float]] = {}
    for um in _store.values():
        with um.lock:
            for ts, v in um.latency:
                if ts >= since:
                    hour_key = int(ts // 3600) * 3600
                    hours.setdefault(hour_key, []).append(v)
    result: dict[str, list[float]] = {}
    for epoch, vals in sorted(hours.items()):
        vals.sort()
        p50_idx = int(len(vals) * 0.5)
        p95_idx = int(len(vals) * 0.95)
        label = datetime.fromtimestamp(epoch, tz=UTC).strftime("%Y-%m-%d %H:00")
        result[label] = [round(vals[min(p50_idx, len(vals) - 1)], 3), round(vals[min(p95_idx, len(vals) - 1)], 3)]
    return result


def get_fleet_429_per_hour(since: float) -> dict[str, int]:
    """Return {hour_label: count} for all 429 rejections fleet-wide per hour."""
    hours: dict[int, int] = {}
    for um in _store.values():
        with um.lock:
            for ts in um.reject_ts:
                if ts >= since:
                    hour_key = int(ts // 3600) * 3600
                    hours[hour_key] = hours.get(hour_key, 0) + 1
    result: dict[str, int] = {}
    for epoch, count in sorted(hours.items()):
        label = datetime.fromtimestamp(epoch, tz=UTC).strftime("%Y-%m-%d %H:00")
        result[label] = count
    return result
