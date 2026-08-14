import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from datetime import UTC, datetime, timedelta

from app.metrics_api import generate_hourly_labels, parse_time_range


def test_parse_time_range_1h():
    result = parse_time_range("1h")
    expected = datetime.now(UTC) - timedelta(hours=1)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_time_range_6h():
    result = parse_time_range("6h")
    expected = datetime.now(UTC) - timedelta(hours=6)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_time_range_24h():
    result = parse_time_range("24h")
    expected = datetime.now(UTC) - timedelta(hours=24)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_time_range_7d():
    result = parse_time_range("7d")
    expected = datetime.now(UTC) - timedelta(days=7)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_time_range_invalid():
    result = parse_time_range("invalid")
    expected = datetime.now(UTC) - timedelta(hours=24)
    assert abs((result - expected).total_seconds()) < 5


def test_generate_hourly_labels_basic():
    since = datetime.now(UTC) - timedelta(hours=3)
    labels = generate_hourly_labels(since)
    assert len(labels) >= 3
    assert all(":" in label for label in labels)


def test_generate_hourly_labels_day_boundary():
    now = datetime.now(UTC)
    yesterday_this_time = now - timedelta(days=1)
    labels = generate_hourly_labels(yesterday_this_time)
    assert len(labels) >= 24


def test_generate_hourly_labels_single_hour():
    since = datetime.now(UTC) - timedelta(minutes=30)
    labels = generate_hourly_labels(since)
    assert len(labels) >= 1
    assert len(labels) <= 2
