import os
from unittest.mock import patch

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")


class TestEstimateVRAM:
    def test_fp8(self):
        from app.hf_downloader import estimate_vram_gb

        st = {"parameters": {"FP8": 27_000_000_000}}
        # 27B params * 1 byte = 27GB * 1.15 overhead
        result = estimate_vram_gb(st)
        assert result == round(27_000_000_000 / (1024**3) * 1.15, 2)

    def test_fp4(self):
        from app.hf_downloader import estimate_vram_gb

        st = {"parameters": {"FP4": 20_000_000_000}}
        result = estimate_vram_gb(st)
        assert result == round(20_000_000_000 * 0.5 / (1024**3) * 1.15, 2)

    def test_bf16(self):
        from app.hf_downloader import estimate_vram_gb

        st = {"parameters": {"BF16": 31_000_000_000}}
        result = estimate_vram_gb(st)
        assert result == round(31_000_000_000 * 2 / (1024**3) * 1.15, 2)

    def test_multiple_dtypes(self):
        from app.hf_downloader import estimate_vram_gb

        st = {"parameters": {"FP8": 10_000_000_000, "BF16": 5_000_000_000}}
        fp8_bytes = 10_000_000_000 * 1
        bf16_bytes = 5_000_000_000 * 2
        result = estimate_vram_gb(st)
        assert result == round((fp8_bytes + bf16_bytes) / (1024**3) * 1.15, 2)

    def test_none_input(self):
        from app.hf_downloader import estimate_vram_gb

        assert estimate_vram_gb(None) == 0.0

    def test_empty_safetensors(self):
        from app.hf_downloader import estimate_vram_gb

        assert estimate_vram_gb({}) == 0.0
        assert estimate_vram_gb({"parameters": {}}) == 0.0

    def test_unknown_dtype_falls_back_to_2_bytes(self):
        from app.hf_downloader import estimate_vram_gb

        st = {"parameters": {"GPTQ": 1_000_000_000}}
        result = estimate_vram_gb(st)
        assert result == round(1_000_000_000 * 2 / (1024**3) * 1.15, 2)

    def test_int8_and_int4(self):
        from app.hf_downloader import estimate_vram_gb

        st = {"parameters": {"INT8": 1_000_000_000, "INT4": 1_000_000_000}}
        result = estimate_vram_gb(st)
        assert result == round((1_000_000_000 * 1 + 1_000_000_000 * 0.5) / (1024**3) * 1.15, 2)


class TestGenerateModelConfig:
    def test_basic(self):
        from app.hf_downloader import generate_model_config

        hf = {"id": "org/model-name", "tags": ["FP8"], "config": {"max_position_embeddings": 32768}}
        config = generate_model_config(hf, "/downloads/model-name", [0, 1])

        assert config["model_id"] == "model-name"
        assert "FP8" in config["name"]
        assert config["image"] == "lmsysorg/sglang:v0.5.16"
        assert config["context_length"] == 32768
        assert config["active"] is False
        assert config["gpu"] is None  # multiple GPUs
        assert "--tensor-parallel-size" in config["command_flags"]
        assert "2" in config["command_flags"]

    def test_single_gpu(self):
        from app.hf_downloader import generate_model_config

        hf = {"id": "org/model", "tags": [], "config": {}}
        config = generate_model_config(hf, "/downloads/model", [0])
        assert config["gpu"] == "0"

    def test_no_gpu(self):
        from app.hf_downloader import generate_model_config

        hf = {"id": "org/model", "tags": [], "config": {}}
        config = generate_model_config(hf, "/downloads/model", [])
        assert config["gpu"] is None
        assert config["command_flags"] == []

    def test_long_name_truncated(self):
        from app.hf_downloader import generate_model_config

        hf = {"id": "org/very-long-model-name-that-exceeds-thirty-chars", "tags": [], "config": {}}
        config = generate_model_config(hf, "/downloads/model", [0])
        assert len(config["model_id"]) <= 30

    def test_context_length_capped(self):
        from app.hf_downloader import generate_model_config

        hf = {"id": "org/model", "tags": [], "config": {"max_position_embeddings": 200000}}
        config = generate_model_config(hf, "/downloads/model", [0])
        assert config["context_length"] == 131072


class TestDetectGPUs:
    async def test_no_gpu(self):
        from app.hf_downloader import detect_gpus

        with patch("app.hf_downloader._run") as mock_run:
            from app.docker_manager import ModelError

            mock_run.side_effect = [ModelError("no nvidia"), ModelError("no docker")]
            result = await detect_gpus()
            assert result == []


class TestCheckDiskSpace:
    async def test_returns_positive(self):
        from app.hf_downloader import check_disk_space

        with patch("app.hf_downloader.CONTAINER_MODELS_DIR_RW", "/tmp"):
            info = await check_disk_space()
            assert "free_bytes" in info
            assert "free_gb" in info
            assert "total_gb" in info
            assert info["free_bytes"] > 0


class TestCheckModelPathExists:
    async def test_returns_false_for_nonexistent(self):
        from app.hf_downloader import check_model_path_exists

        result = await check_model_path_exists("/nonexistent/path/xyz123")
        assert result is False

    async def test_returns_true_for_valid(self, tmp_path):
        from app.hf_downloader import check_model_path_exists

        dir_p = tmp_path / "model"
        dir_p.mkdir()
        (dir_p / "config.json").write_text("{}")
        (dir_p / "model.safetensors").write_bytes(b"\x00" * 100)
        assert await check_model_path_exists(str(dir_p))

    async def test_returns_false_without_weights(self, tmp_path):
        from app.hf_downloader import check_model_path_exists

        dir_p = tmp_path / "model"
        dir_p.mkdir()
        (dir_p / "config.json").write_text("{}")
        assert not await check_model_path_exists(str(dir_p))

    async def test_accepts_bin_extension(self, tmp_path):
        from app.hf_downloader import check_model_path_exists

        dir_p = tmp_path / "model"
        dir_p.mkdir()
        (dir_p / "config.json").write_text("{}")
        (dir_p / "pytorch_model.bin").write_bytes(b"\x00" * 100)
        assert await check_model_path_exists(str(dir_p))


class TestCleanupModelPath:
    async def test_removes_existing(self, tmp_path):
        from app.hf_downloader import cleanup_model_path

        dir_p = tmp_path / "model"
        dir_p.mkdir()
        (dir_p / "config.json").write_text("{}")
        result = await cleanup_model_path(str(dir_p))
        assert result is True
        assert not dir_p.exists()

    async def test_noop_for_nonexistent(self, tmp_path):
        from app.hf_downloader import cleanup_model_path

        result = await cleanup_model_path(str(tmp_path / "nonexistent"))
        assert result is False
