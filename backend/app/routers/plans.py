from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Plan, Workout
from app.schemas import PlanCreate, PlanInfo

router = APIRouter(prefix="/api/plans", tags=["plans"])


def get_plan_or_404(db: Session, plan_id: int) -> Plan:
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Training session not found")
    return plan


@router.get("", response_model=list[PlanInfo])
def list_plans(db: Session = Depends(get_db)):
    return db.scalars(select(Plan).order_by(Plan.created_at)).all()


@router.post("", response_model=PlanInfo, status_code=status.HTTP_201_CREATED)
def create_plan(payload: PlanCreate, db: Session = Depends(get_db)):
    plan = Plan(name=payload.name, pieces=[p.model_dump() for p in payload.pieces])
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = get_plan_or_404(db, plan_id)
    # Workouts keep the pieces they actually rowed; they just lose the link to the plan.
    db.query(Workout).filter(Workout.plan_id == plan_id).update({"plan_id": None})
    db.delete(plan)
    db.commit()
