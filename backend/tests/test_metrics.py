import os
import time

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app import metrics as real_metrics


def _reset_store():
    real_metrics._store.clear()


def test_add_user_latency():
    _reset_store()
    real_metrics.add_user_latency("alice", 0.5)
    assert "alice" in real_metrics._store
    assert len(real_metrics._store["alice"].latency) == 1


def test_add_user_429():
    _reset_store()
    real_metrics.add_user_429("alice")
    assert len(real_metrics._store["alice"].reject_ts) == 1


def test_get_user_latency_percentiles_no_samples():
    _reset_store()
    result = real_metrics.get_user_latency_percentiles("unknown", time.time(), 50)
    assert result == 0.0


def test_get_user_latency_percentiles_single_sample():
    _reset_store()
    real_metrics.add_user_latency("alice", 1.0)
    result = real_metrics.get_user_latency_percentiles("alice", time.time() - 10, 50)
    assert result == 1.0


def test_get_user_latency_percentiles_known_values():
    _reset_store()
    base = time.time() - 10
    for val in [1.0, 2.0, 3.0, 4.0, 5.0]:
        real_metrics.add_user_latency("alice", val)
    p50 = real_metrics.get_user_latency_percentiles("alice", base, 50)
    p95 = real_metrics.get_user_latency_percentiles("alice", base, 95)
    p99 = real_metrics.get_user_latency_percentiles("alice", base, 99)
    assert p50 >= 1.0
    assert p95 >= 4.0
    assert p99 >= 4.0


def test_get_user_latency_percentiles_since_filter():
    _reset_store()
    past = time.time() - 100
    real_metrics.add_user_latency("bob", 99.0)
    real_metrics._store["bob"].latency = [(past, 99.0)]
    now = time.time()
    result = real_metrics.get_user_latency_percentiles("bob", now, 50)
    assert result == 0.0


def test_get_user_429_count():
    _reset_store()
    base = time.time() - 10
    real_metrics.add_user_429("alice")
    real_metrics.add_user_429("alice")
    count = real_metrics.get_user_429_count("alice", base)
    assert count == 2


def test_get_user_429_count_before_since():
    _reset_store()
    past = time.time() - 200
    real_metrics.add_user_429("alice")
    real_metrics._store["alice"].reject_ts = [past]
    count = real_metrics.get_user_429_count("alice", time.time())
    assert count == 0


def test_get_fleet_latency_percentiles():
    _reset_store()
    real_metrics.add_user_latency("alice", 1.0)
    real_metrics.add_user_latency("bob", 3.0)
    base = time.time() - 10
    p50 = real_metrics.get_fleet_latency_percentiles(base, 50)
    assert p50 in (1.0, 3.0)


def test_get_fleet_429_count():
    _reset_store()
    real_metrics.add_user_429("alice")
    real_metrics.add_user_429("alice")
    real_metrics.add_user_429("bob")
    total = real_metrics.get_fleet_429_count(time.time() - 10)
    assert total == 3


def test_get_fleet_total_latency():
    _reset_store()
    real_metrics.add_user_latency("alice", 2.0)
    real_metrics.add_user_latency("alice", 4.0)
    base = time.time() - 10
    avg = real_metrics.get_fleet_total_latency(base)
    assert avg == 3.0


def test_get_user_latency_percentiles_per_hour():
    _reset_store()
    real_metrics.add_user_latency("alice", 1.0)
    result = real_metrics.get_user_latency_percentiles_per_hour("alice", time.time() - 10)
    assert isinstance(result, dict)
    for vals in result.values():
        assert len(vals) == 2


def test_get_user_429_per_hour():
    _reset_store()
    real_metrics.add_user_429("alice")
    result = real_metrics.get_user_429_per_hour("alice", time.time() - 10)
    assert isinstance(result, dict)
    for v in result.values():
        assert v >= 1


def test_get_fleet_latency_per_hour():
    _reset_store()
    real_metrics.add_user_latency("alice", 1.0)
    real_metrics.add_user_latency("bob", 2.0)
    result = real_metrics.get_fleet_latency_per_hour(time.time() - 10)
    assert isinstance(result, dict)


def test_get_fleet_429_per_hour():
    _reset_store()
    real_metrics.add_user_429("alice")
    real_metrics.add_user_429("bob")
    result = real_metrics.get_fleet_429_per_hour(time.time() - 10)
    assert isinstance(result, dict)


def test_latency_pruning():
    _reset_store()
    old_time = time.time() - 100_000
    real_metrics._store["heavy_user"] = real_metrics._UserMetrics()
    with real_metrics._store["heavy_user"].lock:
        real_metrics._store["heavy_user"].latency = [(old_time, 0.0) for _ in range(200_000)]
    real_metrics.add_user_latency("heavy_user", 1.0)
    assert len(real_metrics._store["heavy_user"].latency) <= 200_000
