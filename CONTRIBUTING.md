# Contributing to SGFleet

## Setup

```bash
git clone https://github.com/joesew/sgfleet.git
cd sgfleet

# Backend
cd admin
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

- Backend: `ruff check app/` and `python3 -m pytest tests/` pass
- Frontend: `npm run lint` and `npx vitest run` pass
- No untracked secrets in `.env` (already in `.gitignore`)
- Run `cd admin && ./deploy.sh` locally to confirm the change deploys

## Pull requests

- Branch from `master`, small focused changes
- Include tests for new behavior
- Reference any related issue in the description

## Questions or issues

Open an issue on GitHub before starting work on larger changes.
