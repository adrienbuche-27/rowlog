# Roadmap

Ordered by value for daily use. Each item is sized to be a single Claude Code task.

## Next
- [ ] **Verify with the real ComModule.** Log packets, add fixtures (`/ftms-fixture`), adjust the
      parser and silence watchdog timing to the device's real notification rate.
- [ ] **Bluetooth heart rate strap.** Second `BluetoothRower`-like source on the Heart Rate service
      (`0x180D`, measurement `0x2A37`); merge `heartRate` into the recorder.
- [ ] **Auto-pause.** Pause when no stroke for N seconds, resume on the next stroke (setting).
- [x] **Database migrations** with Alembic before changing any model.

## Training features
- [x] Structured workouts: intervals by time or distance with rest, live progress and interval
      splits stored per workout. Targets for split and rate are still to do, as is keeping the
      session across a mid-row reload (a restored workout carries on as a free row).
- [ ] Target pace band on the live chart.
- [ ] Voice or audio cues every 500 m or interval.
- [ ] "Ghost" race against a previous workout or personal best.

## Analytics
- [ ] Power curve (best average power over 10 s … 60 min) across workouts.
- [ ] Stroke efficiency: metres per stroke and watts per stroke rate over time.
- [ ] Heart rate zones and time in zone.
- [ ] Monthly and yearly goals.
- [ ] CSV export of samples.

## Platform
- [ ] Installable PWA (manifest + service worker) so the app opens offline from the dock.
- [ ] Optional access token for the API if hosted beyond localhost.
- [ ] Postgres support via `DATABASE_URL`, samples in a separate table if history grows large.
- [ ] Fitness Machine Control Point: reset the monitor from the app before a workout.
- [ ] Playwright end-to-end test using the simulator.
