import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from unittest.mock import MagicMock

from app.admin_api import _client_ip, build_opencode_config, mask_key


def test_mask_key():
    assert mask_key("sk-abc123") == "sk-***"


def test_mask_key_hash():
    assert mask_key("$2b$12$somehash") == "sk-***"


def test_mask_key_empty():
    assert mask_key("") == "sk-***"


def test_build_opencode_config():
    result = build_opencode_config("sk-my-key", "qwen3.6-27b", "Qwen 27B", 188416, 8192)
    assert result["$schema"] == "https://opencode.ai/config.json"
    assert result["lsp"] is True
    assert "sewingsolutions" in result["model"]
    provider = result["provider"]["sewingsolutions"]
    assert provider["name"] == "SGFleet"
    assert provider["npm"] == "@ai-sdk/openai-compatible"
    assert provider["options"]["apiKey"] == "sk-my-key"
    assert provider["options"]["baseURL"] == "https://your-gateway-domain.example.com/v1"
    models = provider["models"]
    assert "qwen3.6-27b" in models
    assert models["qwen3.6-27b"]["name"] == "Qwen 27B"
    assert models["qwen3.6-27b"]["limit"]["context"] == 188416
    assert models["qwen3.6-27b"]["limit"]["output"] == 8192


def test_client_ip_from_forwarded_for():
    mock_request = MagicMock()
    mock_request.headers = {"x-forwarded-for": "1.2.3.4, 5.6.7.8"}
    mock_request.client.host = "127.0.0.1"
    assert _client_ip(mock_request) == "1.2.3.4"


def test_client_ip_from_forwarded_for_with_spaces():
    mock_request = MagicMock()
    mock_request.headers = {"x-forwarded-for": "10.0.0.1 , 10.0.0.2"}
    mock_request.client.host = "127.0.0.1"
    assert _client_ip(mock_request) == "10.0.0.1"


def test_client_ip_fallback_to_client_host():
    mock_request = MagicMock()
    mock_request.headers = {}
    mock_request.client.host = "192.168.1.1"
    assert _client_ip(mock_request) == "192.168.1.1"


def test_client_ip_unknown_when_empty():
    mock_request = MagicMock()
    mock_request.headers = {}
    mock_request.client.host = None
    assert _client_ip(mock_request) == "unknown"
