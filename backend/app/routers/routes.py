from fastapi import APIRouter

from app.schemas import RouteInfo
from app.services.routes import ROUTES

router = APIRouter(prefix="/api/routes", tags=["routes"])


@router.get("", response_model=list[RouteInfo])
def list_routes():
    return [RouteInfo(id=r.id, name=r.name, location=r.location) for r in ROUTES.values()]
