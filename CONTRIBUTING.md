# Contributing to SGFleet

## Setup

```bash
git clone https://github.com/sewingsolutions/sgfleet.git
cd sgfleet

# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
ruff check app/

# Frontend
cd frontend
npm install
npm run dev
```

Start services: `docker compose up -d` from the repo root.

## Project scope

SGFleet is purpose-built for single-node Docker environments running SGLang. PRs that extend the project to Kubernetes, multi-node orchestration, or alternative inference backends are out of scope and will not be merged.

Contributions that improve the existing single-node Docker + SGLang workflow — model management, auth, rate limiting, monitoring, and the admin dashboard — are welcome.

## Before submitting

- Backend: `ruff check app/ tests/`, `ruff format --check app/ tests/`, and `python3 -m pytest tests/` pass
- Frontend: `npm run lint`, `npx vitest run`, and `npm run format:check` pass
- Shell scripts, Dockerfiles, YAML, and JSON: `npx prettier --check` passes on the files you touched (file list in AGENTS.md → Formatting)
- No untracked secrets in `.env` (already in `.gitignore`)
- Run `cd backend && ./deploy.sh` locally to confirm the change deploys (and `cd frontend && ./deploy.sh` for frontend changes)

## Pull requests

- Branch from `master`, small focused changes
- Include tests for new behavior
- Reference any related issue in the description
- Name your branch clearly with a prefix, e.g. `[feat|fix|bug|chore|docs|refactor|test|ci]-short-description`
- start the title with the type of change (feat, fix, chore, etc.) and a short description of the change

## Questions or issues

Open an issue on GitHub before starting work on larger changes.
