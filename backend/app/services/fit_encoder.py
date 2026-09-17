"""Minimal FIT activity file encoder for indoor rowing.

Writes the messages Strava and Garmin Connect need to import an activity:
file_id, event (start), record (one per sample), event (stop), lap, session, activity.

Spec reference: Garmin FIT SDK "FIT File Types" and "Profile.xlsx".
Validated in tests by decoding the output with the official garmin-fit-sdk.
"""

from __future__ import annotations

import struct
from collections.abc import Sequence
from datetime import UTC, datetime

from app.services.routes import LatLon, position_at

FIT_EPOCH = 631065600  # 1989-12-31T00:00:00Z in unix seconds
SEMICIRCLE = (1 << 31) / 180  # degrees -> FIT semicircles

# Base types: (code, struct format, invalid value). Uppercase struct formats (B, H, I) are
# unsigned; lowercase (i) is signed — see _Message.data's clamp, which relies on that.
ENUM = (0x00, "B", 0xFF)
UINT8 = (0x02, "B", 0xFF)
UINT16 = (0x84, "H", 0xFFFF)
UINT32 = (0x86, "I", 0xFFFFFFFF)
UINT32Z = (0x8C, "I", 0x00000000)
SINT32 = (0x85, "i", 0x7FFFFFFF)

SPORT_ROWING = 15
SUB_SPORT_INDOOR_ROWING = 14
MANUFACTURER_DEVELOPMENT = 255

_CRC_TABLE = (
    0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
    0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
)


def fit_crc(data: bytes, crc: int = 0) -> int:
    for byte in data:
        tmp = _CRC_TABLE[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TABLE[byte & 0xF]
        tmp = _CRC_TABLE[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TABLE[(byte >> 4) & 0xF]
    return crc


def fit_timestamp(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return int(dt.timestamp()) - FIT_EPOCH


class _Message:
    """A FIT message type bound to a local message number."""

    def __init__(self, local: int, global_num: int, fields: list[tuple[int, tuple]]):
        self.local = local
        self.global_num = global_num
        self.fields = fields  # (field number, base type)

    def definition(self) -> bytes:
        out = struct.pack("<BBBHB", 0x40 | self.local, 0, 0, self.global_num, len(self.fields))
        for num, (code, fmt, _) in self.fields:
            out += struct.pack("<BBB", num, struct.calcsize(fmt), code)
        return out

    def data(self, values: dict[int, int | float | None]) -> bytes:
        out = struct.pack("<B", self.local)
        for num, (_, fmt, invalid) in self.fields:
            v = values.get(num)
            if v is None:
                v = invalid
            else:
                v = int(round(v))
                # Clamp into the type's range so an outlier never corrupts the file.
                bits = 8 * struct.calcsize(fmt)
                if fmt.isupper():  # unsigned
                    v = max(0, min(v, (1 << bits) - 2))
                else:  # signed
                    v = max(-(1 << (bits - 1)), min(v, (1 << (bits - 1)) - 1))
            out += struct.pack("<" + fmt, v)
        return out


FILE_ID = _Message(0, 0, [(0, ENUM), (1, UINT16), (2, UINT16), (3, UINT32Z), (4, UINT32)])
EVENT = _Message(1, 21, [(253, UINT32), (0, ENUM), (1, ENUM)])
RECORD = _Message(
    2, 20,
    [
        (253, UINT32), (0, SINT32), (1, SINT32), (5, UINT32), (6, UINT16), (7, UINT16),
        (3, UINT8), (4, UINT8), (33, UINT16),
    ],
)
LAP = _Message(
    3, 19,
    [
        (254, UINT16), (253, UINT32), (0, ENUM), (1, ENUM), (2, UINT32), (7, UINT32),
        (8, UINT32), (9, UINT32), (10, UINT32), (11, UINT16), (13, UINT16), (14, UINT16),
        (15, UINT8), (16, UINT8), (17, UINT8), (18, UINT8), (19, UINT16), (20, UINT16),
        (25, ENUM), (39, ENUM),
    ],
)
SESSION = _Message(
    4, 18,
    [
        (254, UINT16), (253, UINT32), (0, ENUM), (1, ENUM), (2, UINT32), (5, ENUM), (6, ENUM),
        (7, UINT32), (8, UINT32), (9, UINT32), (10, UINT32), (11, UINT16), (14, UINT16),
        (15, UINT16), (16, UINT8), (17, UINT8), (18, UINT8), (19, UINT8), (20, UINT16),
        (21, UINT16), (25, UINT16), (26, UINT16),
    ],
)
ACTIVITY = _Message(5, 34, [(253, UINT32), (0, UINT32), (1, UINT16), (2, ENUM), (3, ENUM), (4, ENUM)])


def _speed(pace_s_per_500: float | None) -> float | None:
    """FIT speed is m/s scaled by 1000."""
    if not pace_s_per_500 or pace_s_per_500 <= 0:
        return None
    return 500 / pace_s_per_500 * 1000


def encode_rowing_activity(
    started_at: datetime,
    samples: Sequence[dict],
    summary: dict,
    route_waypoints: Sequence[LatLon] | None = None,
) -> bytes:
    """Build a complete .fit file.

    `samples` are per-second dicts (schemas.Sample), `summary` is analytics.summarize(). When
    `route_waypoints` is given, each record carries a lat/lon walked along that course by the
    sample's cumulative distance, so Strava/Garmin Connect draw a virtual map for the activity.
    """
    if not samples:
        raise ValueError("cannot encode a workout without samples")

    start = fit_timestamp(started_at)
    duration = float(samples[-1]["t"])
    end = start + int(round(duration))
    distance = float(summary.get("distance_m") or 0)
    avg_speed = distance / duration * 1000 if duration > 0 else None
    max_speed = max((_speed(s.get("pace")) or 0 for s in samples), default=0) or None

    body = bytearray()
    for msg in (FILE_ID, EVENT, RECORD, LAP, SESSION, ACTIVITY):
        body += msg.definition()

    body += FILE_ID.data({0: 4, 1: MANUFACTURER_DEVELOPMENT, 2: 1, 3: 1, 4: start})
    body += EVENT.data({253: start, 0: 0, 1: 0})  # timer, start

    for s in samples:
        lat, lon = (
            position_at(route_waypoints, float(s.get("distance") or 0))
            if route_waypoints
            else (None, None)
        )
        body += RECORD.data(
            {
                253: start + int(round(float(s["t"]))),
                0: lat * SEMICIRCLE if lat is not None else None,
                1: lon * SEMICIRCLE if lon is not None else None,
                5: float(s.get("distance") or 0) * 100,
                6: _speed(s.get("pace")),
                7: s.get("power"),
                3: s.get("hr"),
                4: s.get("spm"),
                33: s.get("calories"),
            }
        )

    body += EVENT.data({253: end, 0: 0, 1: 4})  # timer, stop_all

    common = {
        253: end,
        2: start,
        7: duration * 1000,
        8: duration * 1000,
        9: distance * 100,
        10: summary.get("strokes"),
        11: summary.get("calories"),
    }
    body += LAP.data(
        {
            **common, 254: 0, 0: 9, 1: 1,  # event lap, type stop
            13: avg_speed, 14: max_speed,
            15: summary.get("avg_hr"), 16: summary.get("max_hr"),
            17: summary.get("avg_spm"), 18: summary.get("max_spm"),
            19: summary.get("avg_power_w"), 20: summary.get("max_power_w"),
            25: SPORT_ROWING, 39: SUB_SPORT_INDOOR_ROWING,
        }
    )
    body += SESSION.data(
        {
            **common, 254: 0, 0: 8, 1: 1,  # event session, type stop
            5: SPORT_ROWING, 6: SUB_SPORT_INDOOR_ROWING,
            14: avg_speed, 15: max_speed,
            16: summary.get("avg_hr"), 17: summary.get("max_hr"),
            18: summary.get("avg_spm"), 19: summary.get("max_spm"),
            20: summary.get("avg_power_w"), 21: summary.get("max_power_w"),
            25: 0, 26: 1,
        }
    )
    body += ACTIVITY.data({253: end, 0: duration * 1000, 1: 1, 2: 0, 3: 26, 4: 1})

    header = struct.pack("<BBHI4s", 14, 0x20, 2132, len(body), b".FIT")
    header += struct.pack("<H", fit_crc(header))
    data = header + bytes(body)
    return data + struct.pack("<H", fit_crc(data))
