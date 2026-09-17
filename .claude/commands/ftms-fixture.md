The user will paste raw Bluetooth packets logged by the app (Settings → "Log raw Bluetooth packets",
lines like `[rower] rx 2c 02 30 10 00 ...`).

1. Decode each packet by hand against `frontend/src/ble/ftms.ts` and explain the fields.
2. Add them as test cases in `frontend/src/ble/ftms.test.ts` with the expected parsed values.
3. If the parser disagrees with the FTMS spec or with the real device, fix the parser, keep all
   tests green, and document the device quirk in `docs/FTMS.md`.

Packets: $ARGUMENTS
