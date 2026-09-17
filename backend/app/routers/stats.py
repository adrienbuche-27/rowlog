from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Workout
from app.schemas import StatsOverview
from app.services import analytics

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/overview", response_model=StatsOverview)
def overview(weeks: int = 12, db: Session = Depends(get_db)):
    workouts = db.scalars(select(Workout).order_by(Workout.started_at)).all()

    bests = []
    for target in analytics.PB_DISTANCES:
        best: tuple[float, Workout] | None = None
        for w in workouts:
            if w.distance_m < target:
                continue
            t = analytics.best_time_for_distance(w.samples, target)
            if t is not None and (best is None or t < best[0]):
                best = (t, w)
        if best:
            bests.append(
                {
                    "distance_m": target,
                    "time_s": best[0],
                    "split_s": round(best[0] / target * 500, 1),
                    "workout_id": best[1].id,
                    "date": best[1].started_at,
                }
            )

    return {
        "total_distance_m": round(sum(w.distance_m for w in workouts), 1),
        "total_duration_s": sum(w.duration_s for w in workouts),
        "total_workouts": len(workouts),
        "weekly": analytics.weekly_totals(workouts, weeks=weeks, now=datetime.now()),
        "split_trend": [
            {
                "workout_id": w.id,
                "date": w.started_at.isoformat(),
                "avg_split_s": w.avg_split_s,
                "distance_m": w.distance_m,
            }
            for w in workouts
            if w.avg_split_s and w.distance_m >= 1000
        ],
        "personal_bests": bests,
    }
