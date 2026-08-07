import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.db import hash_key, quick_hash_key, verify_key


def test_hash_key_consistent():
    h1 = hash_key("my-secret-key")
    h2 = hash_key("my-secret-key")
    assert h1 != h2
    assert verify_key("my-secret-key", h1)
    assert verify_key("my-secret-key", h2)


def test_verify_key_correct():
    hashed = hash_key("correct-key")
    assert verify_key("correct-key", hashed) is True


def test_verify_key_wrong():
    hashed = hash_key("correct-key")
    assert verify_key("wrong-key", hashed) is False


def test_quick_hash_key_length():
    result = quick_hash_key("some-key")
    assert len(result) == 64


def test_quick_hash_key_is_hex():
    result = quick_hash_key("some-key")
    int(result, 16)


def test_hash_verify_roundtrip():
    raw = "round-trip-test-key"
    hashed = hash_key(raw)
    assert verify_key(raw, hashed) is True
