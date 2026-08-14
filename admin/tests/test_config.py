import os
import string

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.config import generate_key, mask_key


def test_generate_key_prefix_and_charset():
    key = generate_key()
    assert key.startswith("sk-")
    random_part = key[3:]
    allowed = string.ascii_letters + string.digits + "!@#$%^&*"
    assert len(random_part) == 40
    assert all(c in allowed for c in random_part)


def test_generate_key_unique():
    keys = {generate_key() for _ in range(5)}
    assert len(keys) == 5


def test_generate_key_length():
    key = generate_key()
    assert len(key) == 43


def test_mask_key_sk_prefix():
    assert mask_key("sk-abc123") == "sk-***"


def test_mask_key_non_sk():
    assert mask_key("some-other-key") == "***"
