from datetime import datetime
from types import SimpleNamespace

from app.services import analytics
from tests.conftest import make_samples


def test_summarize_steady_row(samples):
    s = analytics.summarize(samples)
    assert s["duration_s"] == 600
    assert abs(s["distance_m"] - 2500) < 1
    assert abs(s["avg_split_s"] - 120) < 0.5
    assert s["max_power_w"] == 180
    assert s["disconnect_s"] == 0


def test_summarize_counts_disconnects(samples):
    for s in samples[100:130]:
        s["connected"] = False
    assert analytics.summarize(samples)["disconnect_s"] == 30


def test_splits_every_500m(samples):
    result = analytics.splits(samples)
    assert len(result) == 5
    assert all(abs(r["split_s"] - 120) < 0.5 for r in result)
    assert [r["index"] for r in result] == [1, 2, 3, 4, 5]


def test_best_time_finds_fast_section():
    slow = make_samples(seconds=300, pace=150)
    # Continue with a faster section after the slow one.
    fast_speed = 500 / 100
    last = slow[-1]
    fast = [
        {**last, "t": last["t"] + k, "distance": last["distance"] + fast_speed * k, "pace": 100}
        for k in range(1, 201)
    ]
    best = analytics.best_time_for_distance(slow + fast, 500)
    assert abs(best - 100) < 1


def test_best_time_none_when_too_short(samples):
    assert analytics.best_time_for_distance(samples, 5000) is None


def test_weekly_totals_includes_empty_weeks():
    now = datetime(2026, 9, 17)
    workouts = [
        SimpleNamespace(started_at=datetime(2026, 9, 15), distance_m=5000, duration_s=1200),
        SimpleNamespace(started_at=datetime(2026, 9, 16), distance_m=3000, duration_s=700),
        SimpleNamespace(started_at=datetime(2026, 9, 2), distance_m=2000, duration_s=500),
    ]
    weeks = analytics.weekly_totals(workouts, weeks=4, now=now)
    assert [w["week_start"] for w in weeks] == ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"]
    assert weeks[-1]["distance_m"] == 8000 and weeks[-1]["workouts"] == 2
    assert weeks[1]["distance_m"] == 2000
    assert weeks[2]["workouts"] == 0
