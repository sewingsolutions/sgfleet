import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.token_parser import extract_usage_from_body, extract_usage_from_sse


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


def test_sse_usage_in_final_chunk():
    body = b'data: {"choices": [{"delta": {"content": "hello"}}]}\n\ndata: {"usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}}\n\n'
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}


def test_sse_no_usage():
    body = b'data: {"choices": [{"delta": {"content": "hello"}}]}\n\n'
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_sse_empty_body():
    result = extract_usage_from_sse(b"")
    assert result == {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def test_sse_string_input():
    body = 'data: {"usage": {"prompt_tokens": 5, "completion_tokens": 15, "total_tokens": 20}}\n\n'
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 5, "completion_tokens": 15, "total_tokens": 20}


def test_sse_multiple_data_lines():
    body = b'data: {"choices": [{"delta": {"content": "hi"}}]}\n\ndata: {"usage": {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7}}\n\ndata: [DONE]\n\n'
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 3, "completion_tokens": 4, "total_tokens": 7}


def test_sse_malformed_json_skipped():
    body = b'data: {invalid}\n\ndata: {"usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}}\n\n'
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
