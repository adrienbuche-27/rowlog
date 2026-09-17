from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Client-generated UUID. Makes uploads idempotent when the browser retries.
    client_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    duration_s: Mapped[float] = mapped_column(Float, default=0)
    distance_m: Mapped[float] = mapped_column(Float, default=0)
    strokes: Mapped[int] = mapped_column(Integer, default=0)
    calories: Mapped[int] = mapped_column(Integer, default=0)
    avg_split_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_spm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_spm: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_power_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_power_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr: Mapped[float | None] = mapped_column(Float, nullable=True)
    disconnect_s: Mapped[float] = mapped_column(Float, default=0)

    notes: Mapped[str] = mapped_column(Text, default="")
    # List of sample dicts, one per second. See schemas.Sample.
    samples: Mapped[list] = mapped_column(JSON, default=list)

    # Virtual GPS course to embed in FIT/Strava exports. See services/routes.py.
    route_id: Mapped[str | None] = mapped_column(String(40), nullable=True)

    strava_upload_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    strava_activity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # none | processing | done | error
    strava_status: Mapped[str] = mapped_column(String(16), default="none")
    strava_error: Mapped[str | None] = mapped_column(Text, nullable=True)


class StravaToken(Base):
    """Single-user app: at most one row."""

    __tablename__ = "strava_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    athlete_id: Mapped[int] = mapped_column(Integer)
    athlete_name: Mapped[str] = mapped_column(String(200), default="")
    access_token: Mapped[str] = mapped_column(String(200))
    refresh_token: Mapped[str] = mapped_column(String(200))
    expires_at: Mapped[int] = mapped_column(Integer)  # unix seconds
    scope: Mapped[str] = mapped_column(String(200), default="")
