# RowLog

Record WaterRower workouts from your laptop over Bluetooth, see live split, power and stroke rate,
keep your history with analytics, and send workouts to Strava or Garmin.

Built to be dependable: it reconnects automatically when the link drops, keeps distance correct
across dropouts and monitor resets, saves the workout every few seconds so a crash loses nothing,
and queues workouts on your computer if the server is unavailable.

## Requirements

- WaterRower with S4 monitor and the Bluetooth ComModule
- Chrome or Edge on a laptop or desktop (Safari and Firefox don't support Web Bluetooth)
- Python 3.11+ and Node.js 20+ (or Docker)

## Quick start

```bash
make install
cp backend/.env.example backend/.env
make dev
```

Open http://localhost:5173. Choose **Simulator** to try everything without the rower, or
**WaterRower** and **Connect rower** to pair the ComModule. Close any phone app connected to the
rower first: the ComModule accepts one connection at a time.

With Docker instead: `docker compose up --build`, then open http://localhost:8000.

## Connect Strava

1. Go to https://www.strava.com/settings/api and create an application.
   Set **Authorization Callback Domain** to `localhost`.
2. Put the Client ID and Client Secret in `backend/.env`.
3. Restart the backend, open **Settings**, and choose **Connect with Strava**.

Workouts are uploaded as indoor rowing activities, from the workout page or automatically after
saving (setting). For Garmin Connect, download the FIT file from the workout page and use
Garmin Connect's **Import data**.

## Put it on GitHub and continue with Claude Code

```bash
cd rowlog
git init -b main
git add .
git commit -m "Initial RowLog app"
gh repo create rowlog --private --source=. --push
# or: git remote add origin git@github.com:<you>/rowlog.git && git push -u origin main
```

Then run `claude` in the project folder. `CLAUDE.md` gives Claude Code the architecture, commands
and conventions; `docs/ROADMAP.md` lists next tasks; `/check` runs the full quality gate.
GitHub Actions runs the same checks on every push.

## Project layout

```
backend/    FastAPI API, analytics, FIT encoder, Strava client, tests
frontend/   React + TypeScript app: Bluetooth, recording, UI, tests
docs/       Bluetooth protocol notes and roadmap
CLAUDE.md   Guide for Claude Code
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Bluetooth is not available" | Use Chrome or Edge, on `http://localhost` or HTTPS. |
| Rower doesn't appear in the picker | Disconnect it from other apps and your phone; wake the S4 monitor by rowing a stroke. |
| Must pick the device again after reload | Enable `chrome://flags/#enable-web-bluetooth-new-permissions-backend`. |
| Frequent drops | Keep the laptop within a few metres; USB 3 ports and Wi-Fi on 2.4 GHz can interfere with Bluetooth. |
| Strava says "invalid redirect" | Callback domain must be `localhost` and `STRAVA_REDIRECT_URI` must match the URL you use. |
