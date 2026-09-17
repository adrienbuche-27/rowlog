import math
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings


def make_samples(seconds: int = 600, pace: float = 120.0, spm: float = 24, power: float = 180):
    """Steady synthetic row: constant pace (s/500m), with small stroke-rate noise."""
    speed = 500 / pace
    return [
        {
            "t": float(t),
            "distance": round(speed * t, 1),
            "strokes": int(t * spm / 60),
            "spm": spm + math.sin(t / 10),
            "power": power,
            "pace": pace,
            "hr": 140,
            "calories": int(t / 6),
            "connected": True,
        }
        for t in range(seconds + 1)
    ]


@pytest.fixture
def samples():
    return make_samples()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "no-static"))
    monkeypatch.setenv("STRAVA_CLIENT_ID", "123")
    monkeypatch.setenv("STRAVA_CLIENT_SECRET", "secret")
    get_settings.cache_clear()
    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        c.app_ref = app
        yield c
    get_settings.cache_clear()


def workout_payload(samples, client_id="11111111-aaaa-bbbb-cccc-000000000001"):
    return {
        "client_id": client_id,
        "started_at": datetime(2026, 9, 14, 7, 30, tzinfo=UTC).isoformat(),
        "notes": "Steady state",
        "samples": samples,
    }
