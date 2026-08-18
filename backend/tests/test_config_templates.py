import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.config_templates import (
    build_claude_code_config,
    build_cline_config,
    build_continue_config,
    build_cursor_checklist,
    build_interpreter_config,
)

API_KEY = "sk-test-key-123"
MODEL_ALIAS = "qwen3.6-27b"
MODEL_NAME = "Qwen 27B"
BASE_URL = "https://api.example.com/v1"
CONTEXT = 32768
OUTPUT = 4096


class TestContinueConfig:
    def test_returns_json_string(self):
        result = build_continue_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert isinstance(result, str)

    def test_contains_api_key(self):
        result = build_continue_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert API_KEY in result

    def test_contains_model_alias(self):
        result = build_continue_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert MODEL_ALIAS in result

    def test_contains_base_url(self):
        result = build_continue_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert BASE_URL in result

    def test_has_correct_provider(self):
        result = build_continue_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import json

        config = json.loads(result)
        assert config["provider"] == "openai"

    def test_has_context_length(self):
        result = build_continue_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import json

        config = json.loads(result)
        assert config["models"][0]["contextLength"] == CONTEXT


class TestClineConfig:
    def test_returns_json_string(self):
        result = build_cline_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert isinstance(result, str)

    def test_contains_api_provider_setting(self):
        result = build_cline_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import json

        config = json.loads(result)
        assert config["cline.apiProvider"] == "openai"

    def test_contains_api_key(self):
        result = build_cline_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import json

        config = json.loads(result)
        assert config["cline.openaiApiKey"] == API_KEY

    def test_contains_model(self):
        result = build_cline_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import json

        config = json.loads(result)
        assert config["cline.openaiModel"] == MODEL_ALIAS

    def test_contains_base_url_with_v1(self):
        result = build_cline_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import json

        config = json.loads(result)
        assert config["cline.openaiApiBase"] == f"{BASE_URL}/v1"

    def test_has_request_delay(self):
        result = build_cline_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import json

        config = json.loads(result)
        assert config["cline.requestDelay"] == 1


class TestInterpreterConfig:
    def test_returns_string(self):
        result = build_interpreter_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert isinstance(result, str)

    def test_contains_model(self):
        result = build_interpreter_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert f"model: {MODEL_ALIAS}" in result

    def test_contains_api_base(self):
        result = build_interpreter_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert f"api_base: {BASE_URL}/v1" in result

    def test_contains_api_key(self):
        result = build_interpreter_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert f"api_key: {API_KEY}" in result

    def test_contains_context_window(self):
        result = build_interpreter_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert f"context_window: {CONTEXT}" in result

    def test_contains_max_output_tokens(self):
        result = build_interpreter_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert f"max_output_tokens: {OUTPUT}" in result

    def test_is_yaml_formatted(self):
        result = build_interpreter_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        lines = result.strip().split("\n")
        assert all(":" in line for line in lines)


class TestCursorChecklist:
    def test_returns_list(self):
        result = build_cursor_checklist(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert isinstance(result, list)

    def test_has_expected_steps(self):
        result = build_cursor_checklist(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        steps = [item["step"] for item in result]
        assert "Set API Provider to 'OpenAI'" in steps
        assert "Set API Key" in steps
        assert "Set API Base URL" in steps
        assert "Set Model" in steps

    def test_contains_api_key_in_step(self):
        result = build_cursor_checklist(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        api_key_item = next(item for item in result if item["step"] == "Set API Key")
        assert api_key_item["value"] == API_KEY

    def test_contains_base_url_in_step(self):
        result = build_cursor_checklist(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        url_item = next(item for item in result if item["step"] == "Set API Base URL")
        assert url_item["value"] == f"{BASE_URL}/v1"

    def test_contains_model_in_step(self):
        result = build_cursor_checklist(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        model_item = next(item for item in result if item["step"] == "Set Model")
        assert model_item["value"] == MODEL_ALIAS

    def test_has_six_steps(self):
        result = build_cursor_checklist(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert len(result) == 6


class TestClaudeCodeConfig:
    def test_returns_string(self):
        result = build_claude_code_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert isinstance(result, str)

    def test_contains_api_key_export(self):
        result = build_claude_code_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert f"export ANTHROPIC_API_KEY={API_KEY}" in result

    def test_contains_base_url_export(self):
        # BASE_URL is /v1-suffixed (matches the setup wizard / stored value); the
        # exported ANTHROPIC_BASE_URL must be the origin so Claude Code's own
        # /v1/messages suffix resolves correctly.
        result = build_claude_code_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        base_url_line = next(
            line for line in result.splitlines() if line.strip().startswith("export ANTHROPIC_BASE_URL=")
        )
        assert base_url_line.strip() == "export ANTHROPIC_BASE_URL=https://api.example.com"
        assert "/v1/v1" not in result

    def test_base_url_without_v1_is_unchanged(self):
        result = build_claude_code_config(API_KEY, MODEL_ALIAS, MODEL_NAME, "https://api.example.com", CONTEXT, OUTPUT)
        base_url_line = next(
            line for line in result.splitlines() if line.strip().startswith("export ANTHROPIC_BASE_URL=")
        )
        assert base_url_line.strip() == "export ANTHROPIC_BASE_URL=https://api.example.com"

    def test_contains_model_flag(self):
        result = build_claude_code_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert f"--model {MODEL_ALIAS}" in result

    def test_contains_claude_code_command(self):
        result = build_claude_code_config(API_KEY, MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        assert "npx @anthropic-ai/claude-code@latest" in result

    def test_escapes_special_chars_in_api_key(self):
        result = build_claude_code_config('sk"test', MODEL_ALIAS, MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import shlex

        assert f"ANTHROPIC_API_KEY={shlex.quote('sk"test')}" in result

    def test_escapes_special_chars_in_model_alias(self):
        result = build_claude_code_config(API_KEY, "model; rm -rf /", MODEL_NAME, BASE_URL, CONTEXT, OUTPUT)
        import shlex

        assert f"--model {shlex.quote('model; rm -rf /')}" in result
