"""Parse response bodies to extract token usage data from SGFleet responses.

Non-streaming responses include a top-level "usage" JSON object:
  OpenAI:    {"usage": {"prompt_tokens": X, "completion_tokens": Y, "total_tokens": Z}}
  Anthropic: {"usage": {"input_tokens": X, "output_tokens": Y}}

Streaming (SSE) responses include usage data in the chunks:
  OpenAI:    data: {"usage": {"prompt_tokens": X, "completion_tokens": Y, "total_tokens": Z}}
  Anthropic: input_tokens from the message_start event, output_tokens from the
             final message_delta event.
"""

import json


def extract_usage_from_body(body: bytes | str) -> dict:
    """Extract usage from a non-streaming JSON response body.

    OpenAI keys (prompt_tokens/completion_tokens) take precedence; when absent, the
    Anthropic keys (input_tokens/output_tokens) are mapped onto them.
    Returns {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int} or zeros.
    """
    try:
        text = body.decode("utf-8") if isinstance(body, bytes) else body
        data = json.loads(text)
        usage = data.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", usage.get("input_tokens", 0))
        completion_tokens = usage.get("completion_tokens", usage.get("output_tokens", 0))
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)
        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }
    except (json.JSONDecodeError, AttributeError, UnicodeDecodeError):
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def extract_usage_from_sse(body: bytes | str) -> dict:
    """Extract usage from a streaming (SSE) response body.

    OpenAI backends include a usage object (prompt_tokens/completion_tokens) in one or
    more `data:` chunks; the last one wins. Anthropic backends split usage across
    events: input_tokens in message_start, output_tokens in the final message_delta.
    Returns {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int} or zeros.
    """
    try:
        text = body.decode("utf-8") if isinstance(body, bytes) else body
        openai_usage = None
        anthropic_input = None
        anthropic_output = None
        for line in text.split("\n"):
            if line.startswith("data: "):
                payload = line[6:].strip()
                if not payload:
                    continue
                try:
                    data = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if not isinstance(data, dict):
                    continue
                event_type = data.get("type")
                if event_type == "message_start":
                    message_usage = (data.get("message") or {}).get("usage")
                    if isinstance(message_usage, dict) and "input_tokens" in message_usage:
                        anthropic_input = message_usage["input_tokens"]
                elif event_type == "message_delta":
                    delta_usage = data.get("usage")
                    if isinstance(delta_usage, dict) and "output_tokens" in delta_usage:
                        anthropic_output = delta_usage["output_tokens"]
                elif "usage" in data and isinstance(data["usage"], dict):
                    openai_usage = data["usage"]
        if anthropic_input is not None or anthropic_output is not None:
            prompt_tokens = anthropic_input or 0
            completion_tokens = anthropic_output or 0
            return {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            }
        if openai_usage:
            return {
                "prompt_tokens": openai_usage.get("prompt_tokens", 0),
                "completion_tokens": openai_usage.get("completion_tokens", 0),
                "total_tokens": openai_usage.get("total_tokens", 0),
            }
    except (AttributeError, UnicodeDecodeError):
        pass
    return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
