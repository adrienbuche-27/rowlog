import secrets
import time

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.models import StravaToken
from app.routers.workouts import get_workout_or_404
from app.schemas import StravaStatus, WorkoutSummary
from app.services import analytics
from app.services.fit_encoder import encode_rowing_activity
from app.services.routes import ROUTES
from app.services.strava import StravaClient, StravaError, StravaNotConnected

router = APIRouter(prefix="/api", tags=["strava"])

# OAuth "state" values issued recently (single-process, single-user app).
_pending_states: dict[str, float] = {}
STATE_TTL_S = 600


def get_strava_client(settings: Settings = Depends(get_settings)) -> StravaClient:
    return StravaClient(settings)


def _require_configured(settings: Settings) -> None:
    if not settings.strava_configured:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Strava is not configured: set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET",
        )


@router.get("/strava/status", response_model=StravaStatus)
def strava_status(settings: Settings = Depends(get_settings), db: Session = Depends(get_db)):
    token = db.scalars(select(StravaToken)).first()
    return StravaStatus(
        configured=settings.strava_configured,
        connected=token is not None,
        athlete_name=token.athlete_name if token else None,
    )


@router.get("/strava/authorize")
def strava_authorize(
    settings: Settings = Depends(get_settings),
    client: StravaClient = Depends(get_strava_client),
):
    _require_configured(settings)
    now = time.time()
    for key, issued in list(_pending_states.items()):
        if now - issued > STATE_TTL_S:
            _pending_states.pop(key, None)
    state = secrets.token_urlsafe(24)
    _pending_states[state] = now
    return RedirectResponse(client.authorize_url(state))


@router.get("/strava/callback")
def strava_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    settings: Settings = Depends(get_settings),
    client: StravaClient = Depends(get_strava_client),
    db: Session = Depends(get_db),
):
    back = f"{settings.frontend_url.rstrip('/')}/settings"
    if error or not code:
        return RedirectResponse(f"{back}?strava=denied")
    if not state or _pending_states.pop(state, None) is None:
        return RedirectResponse(f"{back}?strava=invalid_state")
    try:
        client.exchange_code(db, code)
    except StravaError:
        return RedirectResponse(f"{back}?strava=error")
    return RedirectResponse(f"{back}?strava=connected")


@router.delete("/strava/connection", status_code=status.HTTP_204_NO_CONTENT)
def strava_disconnect(db: Session = Depends(get_db)):
    db.query(StravaToken).delete()
    db.commit()


@router.post("/workouts/{workout_id}/strava", response_model=WorkoutSummary)
def upload_to_strava(
    workout_id: int,
    settings: Settings = Depends(get_settings),
    client: StravaClient = Depends(get_strava_client),
    db: Session = Depends(get_db),
):
    _require_configured(settings)
    workout = get_workout_or_404(db, workout_id)
    if workout.strava_status in ("processing", "done"):
        return workout

    summary = analytics.summarize(workout.samples)
    route = ROUTES.get(workout.route_id) if workout.route_id else None
    fit = encode_rowing_activity(workout.started_at, workout.samples, summary, route=route)
    km = workout.distance_m / 1000
    try:
        state = client.upload_fit(
            db,
            fit,
            name=f"Indoor row {km:.1f} km",
            description=workout.notes or "Recorded with RowLog",
            external_id=f"rowlog-{workout.client_id}",
        )
    except StravaNotConnected as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except StravaError as exc:
        workout.strava_status, workout.strava_error = "error", str(exc)
        db.commit()
        return workout

    _apply_state(workout, state)
    db.commit()
    return workout


@router.get("/workouts/{workout_id}/strava", response_model=WorkoutSummary)
def refresh_strava_upload(
    workout_id: int,
    client: StravaClient = Depends(get_strava_client),
    db: Session = Depends(get_db),
):
    """Polled by the browser while Strava processes the file."""
    workout = get_workout_or_404(db, workout_id)
    if workout.strava_status != "processing" or workout.strava_upload_id is None:
        return workout
    try:
        state = client.upload_status(db, workout.strava_upload_id)
    except StravaError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    _apply_state(workout, state)
    db.commit()
    return workout


def _apply_state(workout, state) -> None:
    workout.strava_upload_id = state.upload_id
    workout.strava_status = state.status
    workout.strava_activity_id = state.activity_id
    workout.strava_error = state.error
