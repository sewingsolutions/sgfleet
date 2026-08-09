import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")

from app.download_tracker import (
    complete_job,
    get_job,
    list_active,
    start_job,
    update_job,
)


def test_start_job():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    job = start_job("/models/test-model", "hf-org/test-model")
    assert job.model_id == "hf-org/test-model"
    assert job.target_dir == "/models/test-model"
    assert job.status == "downloading"
    assert job.progress == 0.0
    assert get_job("/models/test-model") is job


def test_update_job_progress():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    start_job("/models/test", "test-id")
    job = update_job("/models/test", progress=50.0)
    assert job is not None
    assert job.progress == 50.0


def test_update_job_log_line():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    start_job("/models/test", "test-id")
    update_job("/models/test", log_line="downloading...")
    job = get_job("/models/test")
    assert job is not None
    assert len(job.logs) == 1
    assert job.logs[0] == "downloading..."


def test_update_job_trims_logs():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    start_job("/models/test", "test-id")
    for i in range(150):
        update_job("/models/test", log_line=f"line-{i}")
    job = get_job("/models/test")
    assert job is not None
    assert len(job.logs) == 100
    assert job.logs[0] == "line-50"
    assert job.logs[-1] == "line-149"


def test_update_job_missing():
    result = update_job("/nonexistent", progress=10.0)
    assert result is None


def test_complete_job_success():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    start_job("/models/test", "test-id")
    job = complete_job("/models/test")
    assert job is not None
    assert job.status == "complete"
    assert job.progress == 100.0
    assert job.error is None


def test_complete_job_error():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    start_job("/models/test", "test-id")
    job = complete_job("/models/test", error="disk full")
    assert job is not None
    assert job.status == "error"
    assert job.error == "disk full"


def test_complete_job_missing():
    result = complete_job("/nonexistent")
    assert result is None


def test_get_job_missing():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    assert get_job("/nonexistent") is None


def test_list_active():
    from app.download_tracker import active_downloads

    active_downloads.clear()
    start_job("/models/a", "id-a")
    start_job("/models/b", "id-b")
    update_job("/models/a", progress=25.0)

    items = list_active()
    assert len(items) == 2

    a = next(i for i in items if i["model_id"] == "id-a")
    b = next(i for i in items if i["model_id"] == "id-b")
    assert a["progress"] == 25.0
    assert b["progress"] == 0.0
    assert "started_at" in a
    assert "updated_at" in a
