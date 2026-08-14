# Secrets Migration & First-Boot Wizard

Move `ADMIN_API_KEY` and `HUGGINGFACE_TOKEN` from `.env` into encrypted SQLite storage managed via a web UI wizard. Rewrite `init.sh` as an all-in-one host setup script.

## Decision Log

| Decision | Value | Why |
|----------|-------|-----|
| Migration | Breaking | No legacy value migration; simpler code |
| Gateway pre-setup | 503 | No partial service before admin configures |
| `init.sh` prompts | MODELS_DIR, SGFLEET_BASE_URL, PROMETHEUS_HOST | Minimal host config |
| Wizard collects | Admin display name, SGFLEET_BASE_URL, HF token | Admin key auto-generated, shown once |
| Encryption | Fernet (AES-128-CBC) via `cryptography` | Standard, well-tested |
| `init.sh` URL output | Machine LAN IP (not localhost) | Remote access on first boot |
| `init.sh` directories | MODELS_DIR, DATA_DIR (`./data`), LOGS_DIR (`./logs`) | Host-safe ownership, future-use |
| Alloy | Docker Compose profile `monitoring` | Prevents accidental startup when PROMETHEUS_HOST unset |
| JWT signing key | Encrypted raw key stored in DB (`admin_api_key_enc`) | Bcrypt for login verification, raw key for JWT signing |
| Legacy DB migration | None | Existing `admin_api_key_hash` ignored; user re-runs wizard |

---

## Progress Tracking

### Phase 1: `init.sh` rewrite
- [ ] Host verification: `docker`, `docker compose`, `nvidia-smi`, `nvidia-ctk`, `openssl`
- [ ] Prompts: MODELS_DIR, DATA_DIR, LOGS_DIR, SGFLEET_BASE_URL, PROMETHEUS_HOST
- [ ] Auto-generate: `SGFLEET_ENCRYPTION_KEY`, `HOST_MODELS_DIR`
- [ ] Directory creation with user ownership
- [ ] Write `.env` (infrastructure values only)
- [ ] Model scanning + `models.json` generation (preserve existing logic)
- [ ] Launch Docker Compose (conditional on PROMETHEUS_HOST)
- [ ] Detect LAN IP, print setup URL

### Phase 2: `docker-compose.yml`
- [ ] Add `profile: ["monitoring"]` to alloy service
- [ ] Remove `ADMIN_API_KEY`, `HUGGINGFACE_TOKEN` from admin env
- [ ] Add `SGFLEET_ENCRYPTION_KEY` to admin env

### Phase 3: `.env.example`
- [ ] Update to new format (no ADMIN_API_KEY, no HUGGINGFACE_TOKEN)

### Phase 4: Backend — encryption `admin/app/crypto.py`
- [ ] Create new file
- [ ] `encrypt(plaintext) -> str` — Fernet encrypt, base64
- [ ] `decrypt(ciphertext) -> str` — Fernet decrypt
- [ ] Key from `SGFLEET_ENCRYPTION_KEY` env var (hex → SHA-256 → Fernet key)

### Phase 5: `admin/requirements.txt`
- [ ] Add `cryptography`

### Phase 6: `admin/app/config.py`
- [ ] `admin_api_key` optional: default `""`
- [ ] Add `encryption_key: str = ""` from `SGFLEET_ENCRYPTION_KEY`
- [ ] Remove `generate_key()` and `mask_key()` (move to setup module)

### Phase 7: `admin/app/db.py`
- [ ] Migration `migrate_to_v14` (no schema change, version bump)
- [ ] `is_setup_complete() -> bool`
- [ ] `mark_setup_complete()`
- [ ] `set_admin_credentials(admin_name, raw_key)` — bcrypt hash + encrypted raw key
- [ ] `get_admin_name() -> str`
- [ ] `load_admin_api_key()` — decrypt raw key from DB for JWT signing

### Phase 8: `admin/app/hf_downloader.py`
- [ ] `get_hf_token()` — try encrypted `hf_api_token_enc`, fallback to plaintext `hf_api_token`
- [ ] `set_hf_token()` — encrypt before storing as `hf_api_token_enc`

### Phase 9: `admin/app/admin_api.py`
- [x] `GET /admin/api/system/setup-status` — public, no auth
- [x] `POST /admin/api/system/setup` — auto-generates admin key, stores everything

### Phase 10: `admin/app/auth.py`
- [x] `require_admin()` — check `is_setup_complete()` first, return 403 if incomplete
- [x] `_check_token()` and `create_session_token()` take key parameter

### Phase 11: `admin/app/main.py`
- [x] After `init_db()`: check setup status
- [x] If not complete: skip model sync
- [x] If complete: decrypt admin key from DB → set `settings.admin_api_key`

### Phase 12: `admin/app/gateway.py`
- [x] 503 JSON response when `!is_setup_complete()` (both proxy and passthrough)

### Phase 13: `admin/app/admin_ui.py`
- [x] Add `/admin/setup` SPA fallback route
- [x] Login loads key from DB for token creation

### Phase 14: Frontend — `admin/frontend/src/pages/SetupWizard.tsx`
- [x] Create wizard page (full-screen, no layout)
- [x] Step 1: Welcome
- [x] Step 2: Admin name input
- [x] Step 3: Base URL (prefilled from DB)
- [x] Step 4: HuggingFace token (optional)
- [x] Step 5: Confirm — show auto-generated key, copy-to-clipboard
- [x] POST to setup endpoint, redirect to `/login` on success

### Phase 15: Frontend — `admin/frontend/src/App.tsx`
- [x] Add `/setup` route (no ProtectedRoute wrapper)

### Phase 16: Frontend — `admin/frontend/src/context/AuthContext.tsx`
- [x] Add `setupComplete` state
- [x] Check setup status on init; redirect to `/setup` if incomplete

### Phase 17: Frontend — `admin/frontend/src/components/ProtectedRoute.tsx`
- [x] Redirect to `/setup` if `!setupComplete`

### Phase 18: Frontend — `admin/frontend/src/api/client.ts`
- [x] Add `getSetupStatus()`, `completeSetup()` methods
- [x] Add setup types to `types.ts`

### Phase 19: Frontend — build & lint
- [x] `npm run lint` passes
- [x] `tsc --noEmit` passes
- [x] `npm run build` succeeds

### Phase 20: Backend — lint
- [x] `ruff check app/` passes

### Phase 21: Documentation
- [x] Update `admin/AGENTS.md`
- [x] Update root `AGENTS.md`

---

## Architecture Notes

### How JWT signing works post-setup
1. Setup endpoint generates raw admin key (`sk-...`)
2. Raw key stored encrypted as `config.admin_api_key_enc`
3. Bcrypt hash stored as `config.admin_api_key_hash` (for login verification)
4. On startup: `main.py` decrypts `admin_api_key_enc` → sets `settings.admin_api_key`
5. `auth.py` uses `settings.admin_api_key` for JWT encode/decode
6. Login verifies against bcrypt hash in DB

### Encryption key lifecycle
- Generated by `init.sh`: `openssl rand -hex 32`
- Stored in `.env` as `SGFLEET_ENCRYPTION_KEY`
- Passed to admin container as env var
- Used by `crypto.py` to derive Fernet key (SHA-256 of hex → URL-safe base64)
- **If lost, encrypted secrets cannot be recovered** — document this

### Gateway 503 during pre-setup
- Gateway routes (`/v1/*`) return `{"detail": "System setup not complete"}` (503)
- Admin API routes return 403 on non-setup endpoints
- Only `/admin/api/system/setup-status` and `/admin/api/system/setup` are accessible

### Docker Compose alloy profile
- Alloy service has `profile: ["monitoring"]`
- `docker compose up -d` starts everything except alloy
- `docker compose --profile monitoring up -d` starts alloy too
- `init.sh` chooses based on `PROMETHEUS_HOST`
