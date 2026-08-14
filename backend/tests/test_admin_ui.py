import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")


class TestAdminUIRouter:
    def test_router_exists(self):
        from app.admin_ui import router

        assert router is not None
        routes = [getattr(r, "path", "") for r in router.routes]
        assert "/login" in routes
        assert "/logout" in routes

    def test_login_rate_limit_functions(self):
        from app.admin_ui import _LOGIN_MAX_ATTEMPTS, _is_login_rate_limited

        assert _LOGIN_MAX_ATTEMPTS == 5
        assert _is_login_rate_limited("1.2.3.4") is False
