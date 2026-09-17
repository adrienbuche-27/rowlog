import httpx

from app.routers.strava import _pending_states, get_strava_client
from app.services.strava import StravaClient
from tests.conftest import workout_payload


def test_create_and_fetch_workout(client, samples):
    r = client.post("/api/workouts", json=workout_payload(samples))
    assert r.status_code == 201
    wid = r.json()["id"]
    assert abs(r.json()["distance_m"] - 2500) < 1

    # Idempotent retry
    again = client.post("/api/workouts", json=workout_payload(samples))
    assert again.status_code == 200 and again.json()["id"] == wid

    detail = client.get(f"/api/workouts/{wid}").json()
    assert len(detail["samples"]) == 601
    assert len(detail["splits"]) == 5

    assert len(client.get("/api/workouts").json()) == 1


def test_update_and_delete(client, samples):
    wid = client.post("/api/workouts", json=workout_payload(samples)).json()["id"]
    assert client.patch(f"/api/workouts/{wid}", json={"notes": "Felt good"}).json()["notes"] == "Felt good"
    assert client.delete(f"/api/workouts/{wid}").status_code == 204
    assert client.get(f"/api/workouts/{wid}").status_code == 404


def test_fit_download(client, samples):
    wid = client.post("/api/workouts", json=workout_payload(samples)).json()["id"]
    r = client.get(f"/api/workouts/{wid}/fit")
    assert r.status_code == 200
    assert r.content[8:12] == b".FIT"


def test_stats_overview(client, samples):
    client.post("/api/workouts", json=workout_payload(samples))
    body = client.get("/api/stats/overview").json()
    assert body["total_workouts"] == 1
    pbs = {pb["distance_m"]: pb for pb in body["personal_bests"]}
    assert abs(pbs[2000]["time_s"] - 480) < 1
    assert 5000 not in pbs
    assert len(body["split_trend"]) == 1


def test_strava_full_flow(client, samples):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/oauth/token":
            return httpx.Response(
                200,
                json={
                    "access_token": "acc",
                    "refresh_token": "ref",
                    "expires_at": 9999999999,
                    "athlete": {"id": 7, "firstname": "Adrien", "lastname": "B"},
                },
            )
        if request.url.path == "/api/v3/uploads":
            assert request.headers["Authorization"] == "Bearer acc"
            return httpx.Response(201, json={"id": 555, "activity_id": None, "error": None})
        if request.url.path == "/api/v3/uploads/555":
            return httpx.Response(200, json={"id": 555, "activity_id": 42, "error": None})
        return httpx.Response(404)

    app = client.app_ref
    from app.config import get_settings

    app.dependency_overrides[get_strava_client] = lambda: StravaClient(
        get_settings(), transport=httpx.MockTransport(handler)
    )

    assert client.get("/api/strava/status").json() == {
        "configured": True, "connected": False, "athlete_name": None,
    }

    r = client.get("/api/strava/authorize", follow_redirects=False)
    assert r.status_code == 307 and "strava.com/oauth/authorize" in r.headers["location"]
    state = next(iter(_pending_states))

    bad = client.get("/api/strava/callback?code=abc&state=wrong", follow_redirects=False)
    assert "invalid_state" in bad.headers["location"]

    ok = client.get(f"/api/strava/callback?code=abc&state={state}", follow_redirects=False)
    assert ok.headers["location"].endswith("/settings?strava=connected")
    assert client.get("/api/strava/status").json()["athlete_name"] == "Adrien B"

    wid = client.post("/api/workouts", json=workout_payload(samples)).json()["id"]
    up = client.post(f"/api/workouts/{wid}/strava").json()
    assert up["strava_status"] == "processing"
    done = client.get(f"/api/workouts/{wid}/strava").json()
    assert done["strava_status"] == "done" and done["strava_activity_id"] == 42

    assert client.delete("/api/strava/connection").status_code == 204
    app.dependency_overrides.clear()
