from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Route(Base):
    """A user-uploaded GPS course, parsed from a GPX file. See services/routes.py."""

    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    location: Mapped[str] = mapped_column(String(200), default="")
    length_m: Mapped[float] = mapped_column(Float)
    # [(lat, lon), ...] extracted from the uploaded GPX, start to finish.
    waypoints: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Plan(Base):
    """A reusable training session: an ordered list of pieces to row.

    Pieces are a JSON list of {kind: "distance"|"time", target: float, rest_s: float} —
    target is metres for a distance piece, seconds for a time piece. See schemas.PlanPiece.
    """

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    pieces: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


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

    # Virtual GPS course to embed in FIT/Strava exports. Not a DB-level foreign key
    # (SQLite doesn't enforce FKs by default here) — deleting a route clears this on any
    # workout that used it, see routers/routes.py.
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"), nullable=True)

    # The training session this row followed, and the pieces as actually rowed:
    # [{index, kind, target, start_t, end_t}] in timer seconds. Per-piece stats are
    # derived from `samples` at read time (services/analytics.py), not stored.
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"), nullable=True)
    pieces: Mapped[list | None] = mapped_column(JSON, nullable=True)

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
