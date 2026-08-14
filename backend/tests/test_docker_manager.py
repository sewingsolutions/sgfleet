import json
import os
from unittest.mock import AsyncMock, patch

import pytest

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")


@pytest.fixture
def switch_dir(tmp_path):
    d = tmp_path / "switch"
    d.mkdir()
    return d


def _make_model(**kwargs):
    defaults = {
        "id": 1,
        "model_id": "test-model",
        "name": "Test Model",
        "image": "lmsysorg/sglang:v0.5.16",
        "model_path": "/models/test",
        "context_length": 32768,
        "max_output_length": 8192,
        "port": 30000,
        "container_name": "sgfleet-test-model",
        "container_alias": "sgfleet-test-model",
        "model_alias": "sgfleet-api-model",
        "active": True,
        "grace_period": 10,
        "environment": {"TEST_VAR": "value"},
        "gpu": "auto",
        "command_flags": ["--kv-cache-dtype", "fp8_e4m3"],
    }
    defaults.update(kwargs)
    return defaults


class TestBuildDockerRunCmd:
    def test_basic_cmd(self):
        from app.docker_manager import build_docker_run_cmd

        model = _make_model()
        cmd = build_docker_run_cmd(model)

        assert cmd[0] == "docker"
        assert cmd[1] == "run"
        assert "-d" in cmd
        assert "--name" in cmd
        assert "sgfleet-test-model" in cmd
        assert "--network" in cmd
        assert "sgfleet_default" in cmd
        assert "--network-alias" in cmd
        assert "sgfleet-test-model" in cmd
        assert "--gpus" in cmd
        assert "all" in cmd
        assert "--shm-size" in cmd
        assert "32g" in cmd
        assert "--ipc" in cmd
        assert "host" in cmd
        assert "--cap-add" in cmd
        assert "SYS_NICE" in cmd
        assert "--privileged" not in cmd
        assert model["image"] in cmd
        assert "sglang" in cmd
        assert "serve" in cmd
        assert "--model-path" in cmd
        assert model["model_path"] in cmd
        assert "--host" in cmd
        assert "0.0.0.0" in cmd
        assert "--port" in cmd
        assert str(model["port"]) in cmd
        assert "--kv-cache-dtype" in cmd
        assert "fp8_e4m3" in cmd

    def test_primary_alias(self):
        from app.docker_manager import build_docker_run_cmd

        model = _make_model()
        cmd = build_docker_run_cmd(model, is_primary=True)

        idx = cmd.index("sgfleet-test-model")
        assert "sgfleet-server" in cmd[idx + 1 :]

    def test_gpu_specific(self):
        from app.docker_manager import build_docker_run_cmd

        model = _make_model(gpu="0")
        cmd = build_docker_run_cmd(model)

        gpu_idx = cmd.index("--gpus")
        assert "device=0" in cmd[gpu_idx + 1]

    def test_env_vars(self):
        from app.docker_manager import build_docker_run_cmd

        model = _make_model(environment={"VAR1": "val1", "VAR2": "val2"})
        cmd = build_docker_run_cmd(model)

        assert "-e" in cmd
        e_count = cmd.count("-e")
        assert e_count == 2
        for val in ["VAR1=val1", "VAR2=val2"]:
            assert val in cmd


class TestWriteStatus:
    def test_write_status(self, switch_dir):
        from app.docker_manager import _write_status

        with patch("app.docker_manager.SWITCH_DIR", str(switch_dir)):
            _write_status({"profile": "test-model", "state": "active"})
            status_file = switch_dir / "active_profile.json"
            assert status_file.exists()
            data = json.loads(status_file.read_text())
            assert data["profile"] == "test-model"
            assert data["state"] == "active"


class TestStopContainer:
    @pytest.mark.asyncio
    async def test_stop_container_success(self):
        from app.docker_manager import _stop_container

        with patch("app.docker_manager._run", new=AsyncMock()) as mock_run:
            await _stop_container("sgfleet-test-model", grace_period=15)
            calls = [list(c[0][0]) for c in mock_run.call_args_list]
            assert ["docker", "stop", "-t", "15", "sgfleet-test-model"] in calls
            assert ["docker", "rm", "-f", "sgfleet-test-model"] in calls

    @pytest.mark.asyncio
    async def test_stop_container_not_found(self):
        from app.docker_manager import ModelError, _stop_container

        call_count = [0]

        async def mock_run(cmd):
            call_count[0] += 1
            raise ModelError("not found")

        with patch("app.docker_manager._run", mock_run):
            await _stop_container("sgfleet-test-model")
            assert call_count[0] == 2


class TestContainerStatus:
    @pytest.mark.asyncio
    async def test_status_running(self):
        from app.docker_manager import get_container_status

        async def mock_run(cmd):
            if "inspect" in cmd:
                return "running"
            raise Exception("unexpected")

        with patch("app.docker_manager._run", mock_run):
            result = await get_container_status("sgfleet-test-model")
            assert result is not None
            assert result["state"] == "running"

    @pytest.mark.asyncio
    async def test_status_not_found(self):
        from app.docker_manager import ModelError, get_container_status

        async def mock_run(cmd):
            raise ModelError("not found")

        with patch("app.docker_manager._run", mock_run):
            result = await get_container_status("sgfleet-test-model")
            assert result is None


class TestStartModel:
    @pytest.mark.asyncio
    async def test_start_model_starts(self):
        from app.docker_manager import ModelError, start_model

        async def mock_run(cmd):
            if "inspect" in cmd:
                raise ModelError("not found")
            return ""

        async def mock_wait(endpoint, timeout, label=""):
            return None

        with patch("app.docker_manager._run", mock_run), patch("app.docker_manager._wait_for_endpoint", mock_wait):
            model = _make_model()
            await start_model(model)

    @pytest.mark.asyncio
    async def test_start_model_raises_on_health_timeout(self):
        from app.docker_manager import ModelError, start_model

        async def mock_run(cmd):
            if "inspect" in cmd:
                raise ModelError("not found")
            return ""

        async def mock_wait(endpoint, timeout, label=""):
            raise ModelError("timeout")

        with (
            patch("app.docker_manager._run", mock_run),
            patch("app.docker_manager._wait_for_endpoint", mock_wait),
            pytest.raises(ModelError),
        ):
            await start_model(_make_model())


class TestEnsureModelsSync:
    @pytest.mark.asyncio
    async def test_sync_starts_active(self, switch_dir):
        from app.docker_manager import ModelError, ensure_models_sync

        active_model = _make_model(active=True)
        inactive_model = _make_model(model_id="inactive", container_name="sgfleet-inactive", active=False)

        async def mock_run(cmd):
            if "inspect" in cmd:
                raise ModelError("not found")
            if "ps" in cmd and "format" in cmd:
                return ""
            return ""

        async def mock_wait(endpoint, timeout, label=""):
            return None

        with (
            patch("app.docker_manager.SWITCH_DIR", str(switch_dir)),
            patch("app.docker_manager._run", mock_run),
            patch("app.docker_manager._wait_for_endpoint", mock_wait),
        ):
            ready = await ensure_models_sync([active_model, inactive_model])

            assert ready == {"test-model"}
            status_file = switch_dir / "active_profile.json"
            assert status_file.exists()
            data = json.loads(status_file.read_text())
            assert data["profile"] == "test-model"
            assert data["state"] == "active"
            assert data["models"][0]["ready"] is True

    @pytest.mark.asyncio
    async def test_sync_reports_unhealthy_as_starting(self, switch_dir):
        from app.docker_manager import ModelError, ensure_models_sync

        active_model = _make_model(active=True)

        async def mock_run(cmd):
            if "inspect" in cmd:
                raise ModelError("not found")
            if "ps" in cmd and "format" in cmd:
                return ""
            return ""

        async def mock_wait(endpoint, timeout, label=""):
            raise ModelError("timeout")

        with (
            patch("app.docker_manager.SWITCH_DIR", str(switch_dir)),
            patch("app.docker_manager._run", mock_run),
            patch("app.docker_manager._wait_for_endpoint", mock_wait),
        ):
            ready = await ensure_models_sync([active_model])

            assert ready == set()
            data = json.loads((switch_dir / "active_profile.json").read_text())
            assert data["state"] == "starting"
            assert data["models"][0]["ready"] is False
            assert data["models"][0]["error"]

    @pytest.mark.asyncio
    async def test_sync_no_active(self, switch_dir):
        from app.docker_manager import ModelError, ensure_models_sync

        inactive_model = _make_model(model_id="inactive", container_name="sgfleet-inactive", active=False)

        async def mock_run(cmd):
            if "inspect" in cmd:
                raise ModelError("not found")
            if "ps" in cmd and "format" in cmd:
                return ""
            return ""

        with patch("app.docker_manager.SWITCH_DIR", str(switch_dir)), patch("app.docker_manager._run", mock_run):
            ready = await ensure_models_sync([inactive_model])
            assert ready == set()

            status_file = switch_dir / "active_profile.json"
            data = json.loads(status_file.read_text())
            assert data["state"] == "inactive"


class TestModelError:
    def test_error_message(self):
        from app.docker_manager import ModelError

        err = ModelError("test error")
        assert str(err) == "test error"
