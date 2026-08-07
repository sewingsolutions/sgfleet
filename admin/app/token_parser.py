"""Parse response bodies to extract token usage data from SGFleet responses.

Non-streaming responses include a top-level "usage" JSON object:
  {"usage": {"prompt_tokens": X, "completion_tokens": Y, "total_tokens": Z}}

Streaming (SSE) responses in this version of SGFleet do not include usage data.
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
