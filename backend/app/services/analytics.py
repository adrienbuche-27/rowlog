"""Pure functions computing workout statistics from per-second samples.

Samples are plain dicts (as stored in the database) with the keys of schemas.Sample.
Everything here is side-effect free so it is easy to unit test.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import datetime, timedelta
from statistics import fmean

PB_DISTANCES = (500, 1000, 2000, 5000, 6000, 10000, 21097)


def _values(samples: Iterable[dict], key: str) -> list[float]:
    """Non-null, strictly positive values recorded while connected."""
    return [
        float(s[key])
        for s in samples
        if s.get(key) is not None and s.get(key) > 0 and s.get("connected", True)
    ]


def _mean(values: Sequence[float]) -> float | None:
    return round(fmean(values), 1) if values else None


def _max(values: Sequence[float]) -> float | None:
    return max(values) if values else None


def summarize(samples: Sequence[dict]) -> dict:
    """Aggregate fields stored on the Workout row."""
    if not samples:
        return {"duration_s": 0.0, "distance_m": 0.0, "strokes": 0, "calories": 0}

    duration = float(samples[-1]["t"])
    distance = max(float(s.get("distance") or 0) for s in samples)
    strokes = max(int(s.get("strokes") or 0) for s in samples)
    calories = max(int(s.get("calories") or 0) for s in samples)
    spm, power, hr = _values(samples, "spm"), _values(samples, "power"), _values(samples, "hr")

    return {
        "duration_s": duration,
        "distance_m": round(distance, 1),
        "strokes": strokes,
        "calories": calories,
        "avg_split_s": round(duration / distance * 500, 1) if distance > 0 else None,
        "avg_spm": _mean(spm),
        "max_spm": _max(spm),
        "avg_power_w": _mean(power),
        "max_power_w": _max(power),
        "avg_hr": _mean(hr),
        "max_hr": _max(hr),
        "disconnect_s": float(sum(1 for s in samples if not s.get("connected", True))),
    }


def _time_at_distance(samples: Sequence[dict], i: int, target: float) -> float:
    """Linear interpolation of the time at which `target` metres were reached,
    knowing that samples[i-1].distance < target <= samples[i].distance."""
    a, b = samples[i - 1], samples[i]
    d0, d1 = float(a["distance"]), float(b["distance"])
    if d1 == d0:
        return float(b["t"])
    return float(a["t"]) + (target - d0) / (d1 - d0) * (float(b["t"]) - float(a["t"]))


def splits(samples: Sequence[dict], every_m: float = 500) -> list[dict]:
    """Splits every `every_m` metres, plus the final partial split."""
    if len(samples) < 2:
        return []

    result: list[dict] = []
    start_idx, start_t, start_d = 0, float(samples[0]["t"]), 0.0
    boundary = every_m

    def close(end_idx: int, end_t: float, end_d: float) -> None:
        seg = samples[start_idx : end_idx + 1]
        dist, time = end_d - start_d, end_t - start_t
        if dist <= 0 or time <= 0:
            return
        result.append(
            {
                "index": len(result) + 1,
                "distance_m": round(dist, 1),
                "time_s": round(time, 1),
                "split_s": round(time / dist * 500, 1),
                "avg_spm": _mean(_values(seg, "spm")),
                "avg_power_w": _mean(_values(seg, "power")),
                "avg_hr": _mean(_values(seg, "hr")),
            }
        )

    for i in range(1, len(samples)):
        d = float(samples[i].get("distance") or 0)
        while d >= boundary:
            t = _time_at_distance(samples, i, boundary)
            close(i, t, boundary)
            start_idx, start_t, start_d = i, t, boundary
            boundary += every_m

    last = samples[-1]
    last_d = float(last.get("distance") or 0)
    if last_d - start_d >= 50:  # ignore tiny trailing bits
        close(len(samples) - 1, float(last["t"]), last_d)
    return result


def best_time_for_distance(samples: Sequence[dict], target_m: float) -> float | None:
    """Fastest continuous segment covering `target_m` metres (sliding window)."""
    n = len(samples)
    if n < 2 or float(samples[-1].get("distance") or 0) < target_m:
        return None

    t = [float(s["t"]) for s in samples]
    d = [float(s.get("distance") or 0) for s in samples]
    best: float | None = None
    i = 0
    for j in range(1, n):
        # Advance the window start while it still leaves at least target_m.
        while i + 1 < j and d[j] - d[i + 1] >= target_m:
            i += 1
        if d[j] - d[i] >= target_m:
            # Start of the segment: the moment distance was d[j] - target_m,
            # interpolated between samples i and i+1.
            start_d = d[j] - target_m
            if d[i + 1] > d[i]:
                start_t = t[i] + (start_d - d[i]) / (d[i + 1] - d[i]) * (t[i + 1] - t[i])
            else:
                start_t = t[i]
            candidate = t[j] - start_t
            if best is None or candidate < best:
                best = candidate
    return round(best, 1) if best is not None else None


def week_start(dt: datetime) -> str:
    monday = dt.date() - timedelta(days=dt.weekday())
    return monday.isoformat()


def weekly_totals(workouts: Iterable, weeks: int = 12, now: datetime | None = None) -> list[dict]:
    """Totals for the last `weeks` weeks, oldest first, including empty weeks."""
    now = now or datetime.now()
    buckets: dict[str, dict] = defaultdict(lambda: {"distance_m": 0.0, "duration_s": 0.0, "workouts": 0})
    for w in workouts:
        b = buckets[week_start(w.started_at)]
        b["distance_m"] += w.distance_m
        b["duration_s"] += w.duration_s
        b["workouts"] += 1

    current = datetime.fromisoformat(week_start(now))
    out = []
    for k in range(weeks - 1, -1, -1):
        key = (current - timedelta(weeks=k)).date().isoformat()
        b = buckets.get(key, {"distance_m": 0.0, "duration_s": 0.0, "workouts": 0})
        out.append({"week_start": key, **{**b, "distance_m": round(b["distance_m"], 1)}})
    return out
