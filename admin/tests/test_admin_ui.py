import os

os.environ.setdefault("ADMIN_API_KEY", "test-secret-key-for-testing")


class TestAdminUIRouter:
    def test_router_exists(self):
        from app.admin_ui import router

        assert router is not None
        routes = [getattr(r, "path", "") for r in router.routes]
        assert "/admin/login" in routes
        assert "/admin/logout" in routes

    def test_has_spa_catchall(self):
        from app.admin_ui import router

        routes = [getattr(r, "path", "") for r in router.routes]
        assert "/admin/{path:path}" in routes

    def test_has_login_page(self):
        from app.admin_ui import router

        routes = [getattr(r, "path", "") for r in router.routes]
        assert "/admin/users" in routes
        assert "/admin/settings" in routes
        assert "/admin/models" in routes

    def test_spa_dir_defined(self):
        from app.admin_ui import spa_dir

        assert "frontend_dist" in spa_dir

    def test_login_rate_limit_functions(self):
        from app.admin_ui import _LOGIN_MAX_ATTEMPTS, _is_login_rate_limited

        assert _LOGIN_MAX_ATTEMPTS == 5
        # Fresh IP should not be limited
        assert _is_login_rate_limited("1.2.3.4") is False
