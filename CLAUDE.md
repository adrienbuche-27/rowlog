# RowLog — guide for Claude Code

A personal web app that records WaterRower workouts over Bluetooth, keeps a workout history with
analytics, and exports to Strava (API upload) and Garmin (FIT file). Single user, runs locally.

## Commands

| Task | Command |
| --- | --- |
| Install everything | `make install` |
| Run dev servers (backend :8000, frontend :5173) | `make dev`, then open http://localhost:5173 |
| All tests | `make test` |
| Lint and type check | `make lint` |
| Production-like single server | `make serve` → http://localhost:8000 |
| Full check (slash command) | `/check` |

Backend only: `cd backend && .venv/bin/pytest -q`. Frontend only: `cd frontend && npm test`.
Always run the relevant tests after a change, and `/check` before committing.

## Architecture

```
Browser (Chrome/Edge, laptop)                         Backend (FastAPI + SQLite)
┌──────────────────────────────────────────┐          ┌─────────────────────────────┐
│ BluetoothRower / SimulatedRower           │          │ /api/workouts   CRUD, FIT    │
│   └─ ftms.ts parses Rower Data (0x2AD1)   │          │ /api/stats      analytics    │
│ SessionRecorder (pure logic, 1 sample/s)  │  POST    │ /api/strava     OAuth+upload │
│ IndexedDB: active session + outbox  ──────┼────────► │ services/fit_encoder.py      │
│ React UI (Live, History, Workout, Settings)│          │ services/analytics.py        │
└──────────────────────────────────────────┘          └─────────────────────────────┘
```

The live workout never depends on the network. The browser talks to the rower, records locally,
and only sends the finished workout to the backend. If the backend is down, workouts wait in the
IndexedDB outbox and sync later; `POST /api/workouts` is idempotent on `client_id`.

### Frontend (`frontend/src`)
- `ble/ftms.ts` — FTMS Rower Data parser and encoder. Protocol notes in `docs/FTMS.md`.
- `ble/BluetoothRower.ts` — Web Bluetooth connection, auto-reconnect with backoff, connect
  timeout, silence watchdog. Emits `data`, `connection`, `log`.
- `ble/SimulatedRower.ts` — fake rower that goes through the same encode/parse path; can simulate
  dropouts and monitor resets. Use it for any UI or recording work.
- `session/SessionRecorder.ts` — pure, time-injected recording logic (start on first stroke,
  pause, per-second samples, gap filling, stale-data detection, serialize/restore).
- `session/CumulativeCounter.ts` — keeps distance/strokes/energy monotonic across monitor resets,
  pauses and reloads.
- `session/SessionProvider.tsx` — React context wiring source → recorder → UI; persistence every
  5 s, wake lock, outbox sync, settings.
- `pages/` — `LivePage`, `HistoryPage`, `WorkoutPage`, `SettingsPage`.
- `api/types.ts` mirrors `backend/app/schemas.py`. **Change both together.**

### Backend (`backend/app`)
- `routers/workouts.py`, `routers/stats.py`, `routers/strava.py`, `routers/routes.py`
- `services/analytics.py` — pure functions: summary, 500 m splits, best time over a distance
  (sliding window with interpolation), weekly totals.
- `services/fit_encoder.py` — hand-written FIT encoder (file_id, events, records, lap, session,
  activity). Tests decode the output with Garmin's official `garmin-fit-sdk`.
- `services/routes.py` — GPX parsing (namespace-agnostic, downsamples long tracks) and the pure
  geo functions (haversine, position along a route, bounce-past-the-end) that place a workout's
  cumulative distance on a route's waypoints for the FIT export.
- `services/strava.py` — OAuth code exchange, token refresh, upload + status polling. Takes an
  optional `httpx` transport so tests mock Strava without network.
- Samples are stored as a JSON column on `workouts` (one dict per second).
- Routes (virtual GPS courses) are user-uploaded GPX files, stored in the `routes` table —
  `POST /api/routes` (multipart: `name` + `file`) parses and stores one; `workouts.route_id` is a
  nullable FK to it, cleared by hand on delete (SQLite doesn't enforce FKs here by default).

## Conventions
- Units everywhere: metres, seconds, watts, bpm; pace is **seconds per 500 m**.
- Keep `SessionRecorder`, `CumulativeCounter`, `ftms.ts` and `analytics.py` free of I/O so they stay
  unit-testable. Pass `now` explicitly instead of calling `Date.now()` inside them.
- New recording or parsing behaviour needs a unit test first (they are fast).
- UI copy: sentence case, plain verbs, buttons say what happens ("Save workout"). Errors say what
  went wrong and what to do.
- Styling: tokens in `frontend/src/styles.css` (`--lake`, `--water`, `--ash`…). Numbers use
  `--font-numbers` with tabular figures. Keep the split as the single dominant element on the Row page.
- Python: ruff (line length 110), type hints, SQLAlchemy 2 typed models. TypeScript: strict.
- Schema changes go through Alembic (`backend/alembic/`). After editing `models.py`, run
  `make migration name="..."`, review the generated script, then `make migrate` (or just restart
  the app — `init_engine()` runs migrations on startup). A pre-Alembic dev database with no
  `alembic_version` table is auto-stamped at the baseline revision instead of re-created.

## Gotchas
- Web Bluetooth only works in Chrome/Edge (desktop, Android) and only in a secure context:
  `http://localhost` or HTTPS. Serving on a LAN IP over plain HTTP disables Bluetooth.
- `requestDevice()` must be called from a user gesture (click handler).
- FTMS flag bit 0 is inverted; the ComModule splits readings over several notifications.
- The ComModule accepts one Bluetooth central at a time: a phone app connected to it blocks the laptop.
- Chrome throttles timers in hidden tabs; `SessionRecorder.tick` back-fills missing seconds.
- Strava OAuth redirect in dev goes through the Vite proxy (`/api/strava/callback` on :5173).
  The Strava app's callback domain must be `localhost`.
- The API has no authentication. Keep it bound to localhost (docker-compose already does) or add
  auth before exposing it.

## Roadmap
See `docs/ROADMAP.md` for the prioritised backlog.
