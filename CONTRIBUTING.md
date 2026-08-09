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
