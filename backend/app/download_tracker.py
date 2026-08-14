import time
from dataclasses import dataclass, field


# Shared download state - survives page navigation within same admin session
@dataclass
class DownloadJob:
    model_id: str
    target_dir: str
    status: str = "downloading"  # downloading | complete | error
    progress: float = 0.0  # 0-100
    logs: list[str] = field(default_factory=list)
    error: str | None = None
    started_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


# Keyed by target_dir (unique per download)
active_downloads: dict[str, DownloadJob] = {}


def start_job(target_dir: str, model_id: str) -> DownloadJob:
    job = DownloadJob(model_id=model_id, target_dir=target_dir)
    active_downloads[target_dir] = job
    return job


def update_job(target_dir: str, progress: float | None = None, log_line: str | None = None) -> DownloadJob | None:
    job = active_downloads.get(target_dir)
    if not job:
        return None
    job.updated_at = time.time()
    if progress is not None:
        job.progress = progress
    if log_line is not None:
        job.logs.append(log_line)
        # Keep last 100 lines
        if len(job.logs) > 100:
            job.logs = job.logs[-100:]
    return job


def complete_job(target_dir: str, error: str | None = None) -> DownloadJob | None:
    job = active_downloads.get(target_dir)
    if not job:
        return None
    job.status = "error" if error else "complete"
    job.error = error
    job.updated_at = time.time()
    if not error:
        job.progress = 100.0
    return job


def get_job(target_dir: str) -> DownloadJob | None:
    return active_downloads.get(target_dir)


def list_active() -> list[dict]:
    return [
        {
            "model_id": j.model_id,
            "target_dir": j.target_dir,
            "status": j.status,
            "progress": j.progress,
            "logs": j.logs[-50:],
            "error": j.error,
            "started_at": j.started_at,
            "updated_at": j.updated_at,
        }
        for j in active_downloads.values()
    ]
