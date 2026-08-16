"""Parse response bodies to extract token usage data from SGFleet responses.

Non-streaming responses include a top-level "usage" JSON object:
  {"usage": {"prompt_tokens": X, "completion_tokens": Y, "total_tokens": Z}}

Streaming (SSE) responses include a final chunk with usage data:
  data: {"usage": {"prompt_tokens": X, "completion_tokens": Y, "total_tokens": Z}}
"""

import json


def extract_usage_from_body(body: bytes | str) -> dict:
    """Extract usage from a non-streaming JSON response body.

    Returns {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int} or zeros.
    """
    try:
        text = body.decode("utf-8") if isinstance(body, bytes) else body
        data = json.loads(text)
        usage = data.get("usage", {})
        return {
            "prompt_tokens": usage.get("prompt_tokens", 0),
            "completion_tokens": usage.get("completion_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        }
    except (json.JSONDecodeError, AttributeError, UnicodeDecodeError):
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def extract_usage_from_sse(body: bytes | str) -> dict:
    """Extract usage from a streaming (SSE) response body.

    Parses the final `data:` chunk that contains the usage object.
    Returns {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int} or zeros.
    """
    try:
        text = body.decode("utf-8") if isinstance(body, bytes) else body
        usage_data = None
        for line in text.split("\n"):
            if line.startswith("data: "):
                try:
                    data = json.loads(line[6:])
                    if "usage" in data:
                        usage_data = data["usage"]
                except json.JSONDecodeError:
                    continue
        if usage_data:
            return {
                "prompt_tokens": usage_data.get("prompt_tokens", 0),
                "completion_tokens": usage_data.get("completion_tokens", 0),
                "total_tokens": usage_data.get("total_tokens", 0),
            }
    except (AttributeError, UnicodeDecodeError):
        pass
    return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
