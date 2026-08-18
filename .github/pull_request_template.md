## Summary

<!-- What and why, 1-3 sentences -->

## Changes

<!-- Notable behavioral changes; omit if trivial -->

## Checklist

- [ ] Title follows Conventional Commits (`type: summary`, no scope)
- [ ] Backend: `cd backend && ruff check app/ tests/ && ruff format --check app/ tests/`
- [ ] Backend tests: `cd backend && python3 -m pytest tests/ -v`
- [ ] Frontend (if touched): `cd frontend && npm run lint && npx vitest run && npm run format:check`
- [ ] Shell/Dockerfile/YAML (if touched): `npx prettier --check <files>`

## Linked issues

<!-- Closes #123 -->
