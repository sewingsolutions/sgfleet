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


def test_body_anthropic_usage():
    body = b'{"id":"msg_01","type":"message","role":"assistant","usage":{"input_tokens": 25, "output_tokens": 150}}'
    result = extract_usage_from_body(body)
    assert result == {"prompt_tokens": 25, "completion_tokens": 150, "total_tokens": 175}


def test_body_openai_keys_take_precedence():
    body = b'{"usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30, "input_tokens": 99, "output_tokens": 99}}'
    result = extract_usage_from_body(body)
    assert result == {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}


def test_body_anthropic_only_input():
    body = b'{"usage": {"input_tokens": 12}}'
    result = extract_usage_from_body(body)
    assert result == {"prompt_tokens": 12, "completion_tokens": 0, "total_tokens": 12}


ANTHROPIC_SSE = b"""event: message_start
data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","usage":{"input_tokens":25,"output_tokens":1}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":150}}

event: message_stop
data: {"type":"message_stop"}
"""


def test_sse_anthropic_split_usage():
    result = extract_usage_from_sse(ANTHROPIC_SSE)
    assert result == {"prompt_tokens": 25, "completion_tokens": 150, "total_tokens": 175}


def test_sse_anthropic_string_input():
    result = extract_usage_from_sse(ANTHROPIC_SSE.decode("utf-8"))
    assert result == {"prompt_tokens": 25, "completion_tokens": 150, "total_tokens": 175}


def test_sse_anthropic_missing_output_falls_back_to_zero():
    body = (
        b'data: {"type":"message_start","message":{"usage":{"input_tokens":25}}}\n\ndata: {"type":"message_stop"}\n\n'
    )
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 25, "completion_tokens": 0, "total_tokens": 25}


def test_sse_anthropic_tool_use():
    body = b'data: {"type":"message_start","message":{"usage":{"input_tokens":40}}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":12},"delta":{"stop_reason":"tool_use"}}\n\n'
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 40, "completion_tokens": 12, "total_tokens": 52}


def test_sse_openai_regression():
    body = b'data: {"choices": [{"delta": {"content": "hi"}}]}\n\ndata: {"usage": {"prompt_tokens": 7, "completion_tokens": 9, "total_tokens": 16}}\n\ndata: [DONE]\n\n'
    result = extract_usage_from_sse(body)
    assert result == {"prompt_tokens": 7, "completion_tokens": 9, "total_tokens": 16}
