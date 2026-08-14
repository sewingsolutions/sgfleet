import json
import shlex


def build_continue_config(api_key, model_alias, model_name, base_url, context_length, max_output_length):
    config = {
        "title": "SGFleet",
        "provider": "openai",
        "apiBase": f"{base_url}/v1",
        "apiKey": api_key,
        "models": [
            {
                "title": model_name,
                "model": model_alias,
                "contextLength": context_length,
                "maxStopSequences": 4,
            }
        ],
    }
    return json.dumps(config, indent=2)


def build_cline_config(api_key, model_alias, model_name, base_url, context_length, max_output_length):
    return json.dumps(
        {
            "cline.apiProvider": "openai",
            "cline.openaiApiBase": f"{base_url}/v1",
            "cline.openaiApiKey": api_key,
            "cline.openaiModel": model_alias,
            "cline.openaiStreamingSource": "openai-node",
            "cline.requestDelay": 1,
        },
        indent=2,
    )


def build_interpreter_config(api_key, model_alias, model_name, base_url, context_length, max_output_length):
    config = f"""model: {model_alias}
api_base: {base_url}/v1
api_key: {api_key}
context_window: {context_length}
max_output_tokens: {max_output_length}
"""
    return config.lstrip()


def build_cursor_checklist(api_key, model_alias, model_name, base_url, context_length, max_output_length):
    return [
        {
            "step": "Open Cursor Settings (Code > Settings > General)",
            "value": "",
        },
        {
            "step": "Set API Provider to 'OpenAI'",
            "value": "",
        },
        {
            "step": "Set API Key",
            "value": api_key,
        },
        {
            "step": "Set API Base URL",
            "value": f"{base_url}/v1",
        },
        {
            "step": "Set Model",
            "value": model_alias,
        },
        {
            "step": "Set Context Window (tokens)",
            "value": str(context_length),
        },
    ]


def build_claude_code_config(api_key, model_alias, model_name, base_url, context_length, max_output_length):
    config = f"""export ANTHROPIC_API_KEY={shlex.quote(api_key)}
export ANTHROPIC_BASE_URL={shlex.quote(f"{base_url}/v1")}
# Model: {model_alias}
npx @anthropic-ai/claude-code@latest --model {shlex.quote(model_alias)}"""
    return config
