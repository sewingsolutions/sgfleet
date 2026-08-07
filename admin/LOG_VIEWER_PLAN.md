# Log Viewer + Timestamp Plan

## Problem
1. JSON logs to docker output lack timestamps
2. No persistent log storage — logs vanish on container restart
3. No UI to view, filter, or control logs
4. Log level is hardcoded to DEBUG

## Solution

### Backend

#### 1. `logging.py` — Timestamps + queue handler
- Add `datetime.now(UTC).isoformat()` to `JSONFormatter.format()` output
- Add `LogQueueHandler(logging.Handler)` that formats each record and puts it on a `queue.Queue`
- Make the handler expose `set_log_level(level_name)` to change both stdout and queue behavior

#### 2. `db.py` — Migration v10
- Create `admin_log` table:
  ```sql
  CREATE TABLE IF NOT EXISTS admin_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      level TEXT NOT NULL,
      event TEXT,
      method TEXT,
      path TEXT,
      status INTEGER,
      latency_ms REAL,
      user TEXT,
      request_id TEXT,
      ip TEXT,
      error TEXT,
      message TEXT
  )
  ```
- Prune to last 1000 entries after insert
- Persist `admin_log_level` in config table (default: DEBUG)

#### 3. `log_store.py` — New module
- Daemon thread drains queue → batch inserts to `admin_log` table
- `get_logs(limit, level, user, path, keyword)` — query with filters, return newest first
- `get_log_level()` / `set_log_level(name)` — read/write from config table, update logger level in-memory

#### 4. `admin_api.py` — New endpoints
- `GET /admin/api/logs` — query params: `limit` (default 100), `level`, `user`, `path`, `keyword`
- `GET /admin/api/logs/config` — returns `{ "level": "DEBUG" }`
- `PATCH /admin/api/logs/config` — accepts `{ "level": "INFO" }`, updates in-memory logger + persists

#### 5. `main.py` — Wire up
- Import and initialize `log_store` on lifespan startup
- Read persisted log level from DB, apply to logger

### Frontend

#### 6. `types.ts` — New interface
- `LogEntry` matching the DB columns

#### 7. `client.ts` — API methods
- `getLogs()`, `getLogLevel()`, `setLogLevel()`

#### 8. `useLogs.ts` — New hook
- TanStack Query with filters, auto-refresh toggle, 5s polling when active

#### 9. `LogsPage.tsx` — New page
- Top section: log level dropdown + save button
- Filter bar: level pills, user input, path input, keyword input, auto-refresh toggle
- Scrollable table: timestamp, level badge, method+path, status, user, message/error

#### 10. `App.tsx` — Route
- Add `/logs` route with `ProtectedRoute` + `Layout`

#### 11. `Layout.tsx` — Nav link
- Add "Logs" to `links` array (desktop + mobile)

#### 12. `admin_ui.py` — SPA catch-all
- Add `/admin/logs` to SPA page routes

### Post-deploy
- Force-restart Alloy container to pick up `/admin/api/metrics` path change
