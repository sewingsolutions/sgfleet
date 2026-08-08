import asyncio
import contextlib
import json
import logging
import os
from pathlib import Path

import httpx

logger = logging.getLogger("sgfleet-admin")

SWITCH_DIR = os.environ.get("SWITCH_DIR", "/opt/switch")
MODELS_DIR = os.environ.get("MODELS_DIR", "YOUR_MODELS_PATH/vllm_models")
CONTAINER_MODELS_DIR = "/models"
CONTAINER_MODELS_DIR_RW = "/downloads"

ADMIN_SKIP = {"sgfleet-admin", "sgfleet-alloy", "sgfleet-nginx-exporter"}


class ModelError(Exception):
    pass


async def _run(cmd: list[str]) -> str:
    logger.info("Running: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    out = stdout.decode()
    err = stderr.decode()
    if proc.returncode != 0:
        raise ModelError(f"Command failed (rc={proc.returncode}): {err.strip()}")
    return out.strip()


async def _stop_container(container_name: str, grace_period: int = 10) -> None:
    try:
        await _run(["docker", "stop", "-t", str(grace_period), container_name])
    except ModelError:
        logger.warning("Container %s may already be stopped or not found", container_name)
    try:
        await _run(["docker", "rm", "-f", container_name])
    except ModelError:
        logger.warning("Container %s may already be removed", container_name)


async def _stop_all_stray_containers(known_names: set[str] | None = None) -> None:
    skip = ADMIN_SKIP | (known_names or set())
    try:
        out = await _run(
            [
                "docker",
                "ps",
                "--filter",
                "name=sgfleet-",
                "--format",
                "{{.Names}}",
            ]
        )
        containers = [c.strip() for c in out.splitlines() if c.strip()]
        to_stop = [c for c in containers if c not in skip]
        for c in to_stop:
            logger.info("Stopping stray container: %s", c)
            await _stop_container(c)
    except ModelError as e:
        logger.warning("Failed to list containers for cleanup: %s", e)


def build_docker_run_cmd(model: dict, is_primary: bool = False) -> list[str]:
    container_name = model["container_name"]
    container_alias = model["container_alias"]
    image = model["image"]
    model_path = model["model_path"]
    port = model["port"]
    gpu = model.get("gpu") or "auto"
    env = model.get("environment", {})
    command_flags = model.get("command_flags", [])

    cmd = [
        "docker",
        "run",
        "-d",
        "--name",
        container_name,
        "--network",
        "sgfleet_default",
        "--network-alias",
        container_alias,
    ]

    if is_primary:
        cmd.extend(["--network-alias", "sgfleet-server"])

    if gpu == "auto":
        cmd.extend(["--gpus", "all"])
    else:
        cmd.extend(["--gpus", f"device={gpu}"])

    cmd.extend(
        [
            "--shm-size",
            "32g",
            "--ipc",
            "host",
            "--cap-add",
            "SYS_NICE",
            "--restart",
            "unless-stopped",
            "--log-driver",
            "json-file",
            "--log-opt",
            "max-size=10m",
            "--log-opt",
            "max-file=3",
        ]
    )

    for key, value in env.items():
        cmd.extend(["-e", f"{key}={value}"])

    cmd.extend(["-v", f"{MODELS_DIR}:/models"])
    cmd.append(image)
    cmd.extend(["sglang", "serve", "--model-path", model_path, "--host", "0.0.0.0", "--port", str(port)])

    if command_flags:
        cmd.extend(command_flags)

    return cmd


DEFAULT_STARTUP_TIMEOUT = int(os.environ.get("MODEL_STARTUP_TIMEOUT", "600"))


async def start_model(model: dict, is_primary: bool = False) -> None:
    """Start a model container and wait until its /health endpoint is reachable.

    Raises ModelError if the container fails to start or the health check
    doesn't succeed within the timeout.
    """
    container_name = model["container_name"]
    try:
        status = await get_container_status(container_name)
        already_running = bool(status and status.get("state", "running") == "running")
    except ModelError:
        already_running = False

    if not already_running:
        cmd = build_docker_run_cmd(model, is_primary)
        primary_label = " (primary)" if is_primary else ""
        logger.info("Starting model %s%s", container_name, primary_label)
        await _run(cmd)
    else:
        logger.info("Container %s already running, skipping docker run", container_name)
        # Ensure primary alias is assigned to already-running containers
        if is_primary:
            with contextlib.suppress(ModelError):
                await _run(["docker", "network", "disconnect", "-f", "sgfleet_default", container_name])
            try:
                await _run(
                    [
                        "docker",
                        "network",
                        "connect",
                        "--alias",
                        "sgfleet-server",
                        "--alias",
                        model["container_alias"],
                        "sgfleet_default",
                        container_name,
                    ]
                )
                logger.info("Assigned primary network alias to %s", container_name)
            except ModelError as e:
                logger.warning("Failed to assign primary alias to %s: %s", container_name, e)

    # Wait for the model server to become reachable
    timeout = int(model.get("startup_timeout") or DEFAULT_STARTUP_TIMEOUT)
    endpoint = f"http://{container_name}:{model['port']}"
    await _wait_for_endpoint(endpoint, timeout=timeout, label=container_name)


async def _wait_for_endpoint(endpoint: str, timeout: int, label: str = "") -> None:
    """Poll {endpoint}/health until success or timeout.

    Raises ModelError when the deadline is exceeded without a successful response.
    """
    import time

    start = time.monotonic()
    deadline = start + timeout
    interval = 2.0
    last_error: str | None = None
    while time.monotonic() < deadline:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{endpoint}/health")
                if resp.status_code < 500:
                    elapsed = time.monotonic() - start
                    logger.info(
                        "Model %s reachable at %s after %.1fs",
                        label,
                        endpoint,
                        elapsed,
                    )
                    return
                last_error = f"HTTP {resp.status_code}"
        except Exception as e:  # noqa: BLE001
            last_error = f"{type(e).__name__}: {e}"
        await asyncio.sleep(interval)
        interval = min(interval * 1.5, 10.0)
    raise ModelError(
        f"Model {label} did not become reachable within {timeout}s at "
        f"{endpoint} (last error: {last_error or 'no response'})"
    )


async def stop_model(model: dict, grace_period: int | None = None) -> None:
    container_name = model["container_name"]
    gp = grace_period if grace_period is not None else model.get("grace_period", 10)
    logger.info("Stopping model container: %s", container_name)
    await _stop_container(container_name, gp)


async def ensure_models_sync(all_models: list[dict]) -> set[str]:
    """Reconcile running containers with configured models.

    Returns the set of model_ids whose containers are up AND passed the health
    check. Callers should use this to gate cache exposure so the gateway only
    routes to models that are truly ready.
    """
    Path(SWITCH_DIR).mkdir(parents=True, exist_ok=True)

    active_models = [m for m in all_models if m.get("active")]
    inactive_models = [m for m in all_models if not m.get("active")]

    known_names = {m["container_name"] for m in all_models}

    for m in inactive_models:
        await stop_model(m)

    await _stop_all_stray_containers(known_names)

    primary_model = active_models[0] if active_models else None

    ready_ids: set[str] = set()
    failures: dict[str, str] = {}

    for m in active_models:
        is_primary = m is primary_model
        try:
            await start_model(m, is_primary)
            ready_ids.add(m["model_id"])
        except ModelError as e:
            failures[m["model_id"]] = str(e)
            logger.error("Model %s failed to become ready: %s", m["model_id"], e)

    if primary_model:
        _write_status(
            {
                "profile": primary_model["model_id"],
                "state": "active" if primary_model["model_id"] in ready_ids else "starting",
                "models": [
                    {
                        "id": m["model_id"],
                        "name": m["name"],
                        "container_name": m["container_name"],
                        "port": m["port"],
                        "is_primary": m is primary_model,
                        "ready": m["model_id"] in ready_ids,
                        "error": failures.get(m["model_id"]),
                    }
                    for m in active_models
                ],
            }
        )
        logger.info(
            "Models synced. Primary: %s. Ready: %s. Failed: %s",
            primary_model["model_id"],
            sorted(ready_ids),
            sorted(failures),
        )
    else:
        _write_status({"profile": None, "state": "inactive", "models": []})
        logger.info("No active models configured")

    return ready_ids


async def get_container_status(container_name: str) -> dict | None:
    try:
        out = await _run(
            [
                "docker",
                "inspect",
                "--format",
                "{{if .State.Running}}running{{else}}stopped{{end}}",
                container_name,
            ]
        )
        return {
            "container_name": container_name,
            "state": out,
        }
    except ModelError:
        return None


async def get_container_logs(container_name: str, tail: int = 100) -> str:
    try:
        return await _run(["docker", "logs", "--tail", str(tail), container_name])
    except ModelError as e:
        logger.warning("Failed to get logs for %s: %s", container_name, e)
        return ""


async def stream_container_logs(container_name: str, tail: int = 500):
    """Async generator that streams docker container logs line by line.

    Uses `docker logs --timestamps -f --tail N` for real-time streaming.
    Yields raw log lines as they arrive from stdout.
    Raises ModelError if the container is not found.
    """
    cmd = [
        "docker",
        "logs",
        "--timestamps",
        "-f",
        "--tail",
        str(tail),
        container_name,
    ]
    logger.info("Streaming logs: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Check stderr for "No such container" errors early
    stderr_task = None
    stderr_lines = []

    async def read_stderr():
        if proc.stderr:
            async for line in proc.stderr:
                stderr_lines.append(line.decode(errors="replace"))

    stderr_task = asyncio.create_task(read_stderr())

    try:
        buffer = ""
        if proc.stdout:
            async for chunk in proc.stdout:
                buffer += chunk.decode(errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    yield line
        if buffer.strip():
            yield buffer.strip()
    finally:
        if stderr_task:
            stderr_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await stderr_task
        proc.terminate()
        await proc.wait()

        # Check if container was not found
        stderr_text = "".join(stderr_lines)
        if "No such container" in stderr_text or "not found" in stderr_text.lower():
            raise ModelError(f"Container '{container_name}' not found")


def _write_status(data: dict) -> None:
    status_file = Path(SWITCH_DIR) / "active_profile.json"
    status_file.write_text(json.dumps(data, indent=2))
