import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.token_parser import extract_usage_from_body


def test_valid_full_usage_bytes():
    body = b'{"usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}}'
    result = extract_usage_from_body(body)
    assert result == {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}


def test_valid_empty_usage_bytes():
    body = b'{"usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}}'
    result = extract_usage_from_body(body)
    assert result["prompt_tokens"] == 10

    body2 = b'{"usage": {}}'
    result2 = extract_usage_from_body(body2)
    assert result2 == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_valid_no_usage_key():
    body = b'{"text": "hello"}'
    result = extract_usage_from_body(body)
    assert result == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_non_json_bytes():
    result = extract_usage_from_body(b"not json at all")
    assert result == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_malformed_json():
    result = extract_usage_from_body(b"{invalid/json}")
    assert result == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_empty_bytes():
    result = extract_usage_from_body(b"")
    assert result == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_string_input():
    body = '{"usage": {"prompt_tokens": 5, "completion_tokens": 15, "total_tokens": 20}}'
    result = extract_usage_from_body(body)
    assert result == {"prompt_tokens": 5, "completion_tokens": 15, "total_tokens": 20}


def test_unicode_decode_error():
    result = extract_usage_from_body(b"\xff\xfe")
    assert result == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
