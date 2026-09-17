# WaterRower Bluetooth protocol notes

The WaterRower S4 monitor gets Bluetooth through the ComModule, which implements the Bluetooth SIG
**Fitness Machine Service (FTMS)**.

| Item | UUID |
| --- | --- |
| Fitness Machine Service | `0x1826` |
| Rower Data (notify) | `0x2AD1` |
| Fitness Machine Feature (read) | `0x2ACC` |
| Fitness Machine Control Point (write/indicate) | `0x2AD9` |
| Fitness Machine Status (notify) | `0x2ADA` |

## Rower Data layout

Little-endian. A 16-bit flags field, then the fields whose flag is set, in this order:

| Bit | Field | Type | Unit / resolution |
| --- | --- | --- | --- |
| 0 = **0** | Stroke Rate, Stroke Count | uint8, uint16 | 0.5 spm, strokes |
| 1 | Average Stroke Rate | uint8 | 0.5 spm |
| 2 | Total Distance | uint24 | m |
| 3 | Instantaneous Pace | uint16 | s/500 m |
| 4 | Average Pace | uint16 | s/500 m |
| 5 | Instantaneous Power | sint16 | W |
| 6 | Average Power | sint16 | W |
| 7 | Resistance Level | sint16 | unitless |
| 8 | Total Energy, Energy/h, Energy/min | uint16, uint16, uint8 | kcal |
| 9 | Heart Rate | uint8 | bpm |
| 10 | Metabolic Equivalent | uint8 | 0.1 |
| 11 | Elapsed Time | uint16 | s |
| 12 | Remaining Time | uint16 | s |

Bit 0 is "More Data" and is **inverted**: stroke rate and count are present when it is 0.

## Known behaviour to handle

- Readings are split across several notifications with different flags. `SessionRecorder.ingest`
  merges fields into the latest known state.
- Instantaneous pace is 0 (or very large) when not rowing: treated as "no pace".
- Heart rate is only reported if a strap is paired with the monitor itself.
- Distance and strokes reset when the monitor is reset or powered down; `CumulativeCounter` detects
  the drop and keeps the session totals.

## Checking your own ComModule

1. Settings → enable "Log raw Bluetooth packets", reconnect.
2. Open DevTools console and row for 30 seconds. Lines look like `[rower] rx 2c 02 ...`.
3. In Claude Code run `/ftms-fixture <paste packets>` to turn them into parser tests.

Firmware varies between units, so verifying with real packets early is the best protection against
surprises.
