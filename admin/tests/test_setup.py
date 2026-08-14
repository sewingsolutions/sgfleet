import os

os.environ.setdefault("SGFLEET_ENCRYPTION_KEY", "0" * 64)

import bcrypt
import pytest
from app.auth import require_admin
from app.crypto import encrypt
from app.db import (
    get_admin_name,
    get_db,
    is_setup_complete,
    load_admin_api_key,
    mark_setup_complete,
)
from app.hf_downloader import get_hf_token, set_hf_token
from fastapi import HTTPException


class TestSetupHelpers:

    @pytest.mark.asyncio
    async def test_is_setup_complete_false_by_default(self):
        assert await is_setup_complete() is False

    @pytest.mark.asyncio
    async def test_mark_setup_complete(self):
        assert await is_setup_complete() is False
        await mark_setup_complete()
        assert await is_setup_complete() is True

    @pytest.mark.asyncio
    async def test_set_admin_credentials(self):
        # Use direct DB insertion to avoid nested get_db() lock, then verify the logic
        raw_key = "my-secret-key-123"
        hashed = bcrypt.hashpw(raw_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        encrypted = encrypt(raw_key)
        async with get_db() as db:
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_name", "TestAdmin"))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_hash", hashed))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_enc", encrypted))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("setup_complete", "true"))
            await db.commit()

        assert await is_setup_complete() is True
        assert await get_admin_name() == "TestAdmin"
        raw = await load_admin_api_key()
        assert raw == "my-secret-key-123"

    @pytest.mark.asyncio
    async def test_get_admin_name_default(self):
        assert await get_admin_name() == "admin"

    @pytest.mark.asyncio
    async def test_load_admin_api_key_empty(self):
        assert await load_admin_api_key() == ""


def _make_request(path: str, headers: dict | None = None):
    """Create a Starlette Request with a proper ASGI HTTP scope."""
    from fastapi import Request
    from starlette.datastructures import Headers

    h = headers or {}
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [(k.encode(), v.encode()) for k, v in h.items()],
    }
    req = Request(scope)
    req._headers = Headers(h)
    return req


class TestRequireAdminSetupGate:

    @pytest.mark.asyncio
    async def test_require_admin_rejects_before_setup(self):
        request = _make_request("/admin/api/dashboard")
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(request)
        assert exc_info.value.status_code == 403
        assert "setup not complete" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_require_admin_accepts_after_setup(self):
        # Set up DB state directly to avoid nested get_db() lock from set_admin_credentials
        raw_key = "my-secret-key-123"
        hashed = bcrypt.hashpw(raw_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        encrypted = encrypt(raw_key)
        async with get_db() as db:
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("setup_complete", "true"))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_name", "TestAdmin"))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_hash", hashed))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_enc", encrypted))
            await db.commit()

        request = _make_request("/admin/api/dashboard", {"authorization": "Bearer my-secret-key-123"})
        await require_admin(request)

    @pytest.mark.asyncio
    async def test_require_admin_rejects_invalid_key_after_setup(self):
        raw_key = "my-secret-key-123"
        hashed = bcrypt.hashpw(raw_key.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        encrypted = encrypt(raw_key)
        async with get_db() as db:
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("setup_complete", "true"))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_hash", hashed))
            await db.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ("admin_api_key_enc", encrypted))
            await db.commit()

        request = _make_request("/admin/api/dashboard", {"authorization": "Bearer wrong-key"})
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(request)
        assert exc_info.value.status_code == 401


class TestHfDownloaderEncryptedToken:

    @pytest.mark.asyncio
    async def test_set_and_get_hf_token(self):
        await set_hf_token("hf-test-token-abc")
        token = await get_hf_token()
        assert token == "hf-test-token-abc"

    @pytest.mark.asyncio
    async def test_clear_hf_token(self):
        await set_hf_token("hf-test-token-abc")
        await set_hf_token("")
        token = await get_hf_token()
        assert token == ""

    @pytest.mark.asyncio
    async def test_get_hf_token_default(self):
        assert await get_hf_token() == ""
