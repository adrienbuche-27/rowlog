from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Route, Workout
from app.schemas import WorkoutCreate, WorkoutDetail, WorkoutSummary, WorkoutUpdate
from app.services import analytics
from app.services.fit_encoder import encode_rowing_activity

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def get_workout_or_404(db: Session, workout_id: int) -> Workout:
    workout = db.get(Workout, workout_id)
    if workout is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workout not found")
    return workout


def to_detail(workout: Workout) -> WorkoutDetail:
    return WorkoutDetail.model_validate(
        {
            **WorkoutSummary.model_validate(workout).model_dump(),
            "samples": workout.samples,
            "splits": analytics.splits(workout.samples),
        }
    )


@router.get("", response_model=list[WorkoutSummary])
def list_workouts(limit: int = 100, offset: int = 0, db: Session = Depends(get_db)):
    stmt = select(Workout).order_by(Workout.started_at.desc()).limit(limit).offset(offset)
    return db.scalars(stmt).all()


@router.post("", response_model=WorkoutSummary, status_code=status.HTTP_201_CREATED)
def create_workout(payload: WorkoutCreate, response: Response, db: Session = Depends(get_db)):
    # Idempotent on client_id: the browser outbox may retry an upload that already landed.
    existing = db.scalars(select(Workout).where(Workout.client_id == payload.client_id)).first()
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return existing

    samples = [s.model_dump() for s in payload.samples]
    started_at = payload.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    workout = Workout(
        client_id=payload.client_id,
        started_at=started_at,
        notes=payload.notes,
        samples=samples,
        **analytics.summarize(samples),
    )
    db.add(workout)
    db.commit()
    db.refresh(workout)
    return workout


@router.get("/{workout_id}", response_model=WorkoutDetail)
def get_workout(workout_id: int, db: Session = Depends(get_db)):
    return to_detail(get_workout_or_404(db, workout_id))


@router.patch("/{workout_id}", response_model=WorkoutSummary)
def update_workout(workout_id: int, payload: WorkoutUpdate, db: Session = Depends(get_db)):
    workout = get_workout_or_404(db, workout_id)
    if payload.notes is not None:
        workout.notes = payload.notes
    if "route_id" in payload.model_fields_set:
        if payload.route_id is not None and db.get(Route, payload.route_id) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown route")
        workout.route_id = payload.route_id
    db.commit()
    return workout


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(workout_id: int, db: Session = Depends(get_db)):
    db.delete(get_workout_or_404(db, workout_id))
    db.commit()


@router.get("/{workout_id}/fit")
def download_fit(workout_id: int, db: Session = Depends(get_db)):
    workout = get_workout_or_404(db, workout_id)
    route = db.get(Route, workout.route_id) if workout.route_id else None
    data = encode_rowing_activity(
        workout.started_at,
        workout.samples,
        analytics.summarize(workout.samples),
        route_waypoints=route.waypoints if route else None,
    )
    filename = f"row-{workout.started_at:%Y%m%d-%H%M}.fit"
    return Response(
        content=data,
        media_type="application/vnd.ant.fit",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
