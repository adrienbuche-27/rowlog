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


GPX_ROTSEE = b"""<gpx><trk><trkseg>
<trkpt lat="47.05995" lon="8.32395"/>
<trkpt lat="47.05" lon="8.315"/>
<trkpt lat="47.0443" lon="8.3098"/>
</trkseg></trk></gpx>"""


def upload_route(client, name="Rotsee", gpx=GPX_ROTSEE):
    return client.post(
        "/api/routes", data={"name": name}, files={"file": ("route.gpx", gpx, "application/gpx+xml")}
    )


def test_upload_list_and_delete_a_route(client, samples):
    created = upload_route(client)
    assert created.status_code == 201
    route = created.json()
    assert route["name"] == "Rotsee"
    assert 1800 <= route["length_m"] <= 2200
    assert len(route["waypoints"]) == 3

    routes = client.get("/api/routes").json()
    assert any(r["id"] == route["id"] for r in routes)

    assert client.delete(f"/api/routes/{route['id']}").status_code == 204
    assert not any(r["id"] == route["id"] for r in client.get("/api/routes").json())


def test_uploading_a_bad_gpx_file_is_rejected(client):
    r = upload_route(client, gpx=b"not a gpx file")
    assert r.status_code == 400


def test_selecting_and_clearing_a_route_on_a_workout(client, samples):
    route = upload_route(client).json()
    wid = client.post("/api/workouts", json=workout_payload(samples)).json()["id"]
    assert client.get(f"/api/workouts/{wid}").json()["route_id"] is None

    r = client.patch(f"/api/workouts/{wid}", json={"route_id": route["id"]})
    assert r.json()["route_id"] == route["id"]

    assert client.patch(f"/api/workouts/{wid}", json={"route_id": 999999}).status_code == 400

    cleared = client.patch(f"/api/workouts/{wid}", json={"route_id": None})
    assert cleared.json()["route_id"] is None


def test_deleting_a_route_clears_it_from_workouts_that_used_it(client, samples):
    route = upload_route(client).json()
    wid = client.post("/api/workouts", json=workout_payload(samples)).json()["id"]
    client.patch(f"/api/workouts/{wid}", json={"route_id": route["id"]})

    client.delete(f"/api/routes/{route['id']}")

    assert client.get(f"/api/workouts/{wid}").json()["route_id"] is None


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


PLAN_4x1000 = {
    "name": "4x1000m / 2min",
    "pieces": [
        {"kind": "distance", "target": 1000, "rest_s": 120},
        {"kind": "distance", "target": 1000, "rest_s": 120},
        {"kind": "time", "target": 240, "rest_s": 0},
    ],
}


def test_create_list_and_delete_a_plan(client):
    created = client.post("/api/plans", json=PLAN_4x1000)
    assert created.status_code == 201
    plan = created.json()
    assert plan["name"] == "4x1000m / 2min"
    assert len(plan["pieces"]) == 3
    assert plan["pieces"][2]["kind"] == "time"

    assert any(p["id"] == plan["id"] for p in client.get("/api/plans").json())

    assert client.delete(f"/api/plans/{plan['id']}").status_code == 204
    assert client.get("/api/plans").json() == []
    assert client.delete(f"/api/plans/{plan['id']}").status_code == 404


def test_a_plan_needs_at_least_one_valid_piece(client):
    assert client.post("/api/plans", json={"name": "Empty", "pieces": []}).status_code == 422
    bad_target = {"name": "Bad", "pieces": [{"kind": "distance", "target": 0, "rest_s": 0}]}
    assert client.post("/api/plans", json=bad_target).status_code == 422
    bad_kind = {"name": "Bad", "pieces": [{"kind": "calories", "target": 10, "rest_s": 0}]}
    assert client.post("/api/plans", json=bad_kind).status_code == 422


def test_workout_records_the_session_it_followed(client, samples):
    plan = client.post("/api/plans", json=PLAN_4x1000).json()
    payload = workout_payload(samples) | {
        "plan_id": plan["id"],
        "pieces": [
            {"index": 1, "kind": "distance", "target": 1000, "start_t": 0, "end_t": 240},
            {"index": 2, "kind": "distance", "target": 1000, "start_t": 360, "end_t": 600},
        ],
    }
    wid = client.post("/api/workouts", json=payload).json()["id"]

    detail = client.get(f"/api/workouts/{wid}").json()
    assert detail["plan_id"] == plan["id"]
    assert len(detail["pieces"]) == 2

    first, second = detail["pieces"]
    assert first["kind"] == "distance" and first["target"] == 1000
    assert first["time_s"] == 240
    assert first["distance_m"] > 0
    # Rest is the real gap between pieces, not the planned one.
    assert first["rest_s"] == 120
    assert second["rest_s"] is None


def test_deleting_a_plan_keeps_the_workouts_that_used_it(client, samples):
    plan = client.post("/api/plans", json=PLAN_4x1000).json()
    payload = workout_payload(samples) | {
        "plan_id": plan["id"],
        "pieces": [{"index": 1, "kind": "distance", "target": 1000, "start_t": 0, "end_t": 240}],
    }
    wid = client.post("/api/workouts", json=payload).json()["id"]

    client.delete(f"/api/plans/{plan['id']}")

    detail = client.get(f"/api/workouts/{wid}").json()
    assert detail["plan_id"] is None
    assert len(detail["pieces"]) == 1  # the rowed pieces survive the plan


def test_a_free_row_has_no_pieces(client, samples):
    wid = client.post("/api/workouts", json=workout_payload(samples)).json()["id"]
    detail = client.get(f"/api/workouts/{wid}").json()
    assert detail["plan_id"] is None
    assert detail["pieces"] is None
