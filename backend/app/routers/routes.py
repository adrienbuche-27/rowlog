from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Route, Workout
from app.schemas import RouteInfo
from app.services.routes import GpxParseError, parse_gpx, route_length_m

router = APIRouter(prefix="/api/routes", tags=["routes"])


def get_route_or_404(db: Session, route_id: int) -> Route:
    route = db.get(Route, route_id)
    if route is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Route not found")
    return route


@router.get("", response_model=list[RouteInfo])
def list_routes(db: Session = Depends(get_db)):
    return db.scalars(select(Route).order_by(Route.created_at)).all()


@router.post("", response_model=RouteInfo, status_code=status.HTTP_201_CREATED)
async def create_route(
    name: str = Form(..., min_length=1, max_length=200),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    data = await file.read()
    try:
        waypoints = parse_gpx(data)
    except GpxParseError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    route = Route(name=name, waypoints=waypoints, length_m=route_length_m(waypoints))
    db.add(route)
    db.commit()
    db.refresh(route)
    return route


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(route_id: int, db: Session = Depends(get_db)):
    route = get_route_or_404(db, route_id)
    # No DB-enforced FK cascade (see models.Workout.route_id) — clear it by hand so no
    # workout is left pointing at a route that no longer exists.
    db.query(Workout).filter(Workout.route_id == route_id).update({"route_id": None})
    db.delete(route)
    db.commit()
