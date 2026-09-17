from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Sample(BaseModel):
    """One recorded point, captured once per second by the browser."""

    t: float = Field(description="Seconds since workout start (timer time, pauses excluded)")
    distance: float = Field(0, description="Metres since start")
    strokes: int = 0
    spm: float | None = None
    power: float | None = None
    pace: float | None = Field(None, description="Seconds per 500 m")
    hr: int | None = None
    calories: int | None = None
    connected: bool = True


class WorkoutCreate(BaseModel):
    client_id: str = Field(min_length=8, max_length=64)
    started_at: datetime
    notes: str = ""
    samples: list[Sample] = Field(min_length=1)


class WorkoutUpdate(BaseModel):
    notes: str | None = None
    route_id: int | None = None


class WorkoutSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: str
    started_at: datetime
    duration_s: float
    distance_m: float
    strokes: int
    calories: int
    avg_split_s: float | None
    avg_spm: float | None
    max_spm: float | None
    avg_power_w: float | None
    max_power_w: float | None
    avg_hr: float | None
    max_hr: float | None
    disconnect_s: float
    notes: str
    route_id: int | None
    strava_status: str
    strava_activity_id: int | None
    strava_error: str | None


class Split(BaseModel):
    index: int
    distance_m: float
    time_s: float
    split_s: float
    avg_spm: float | None
    avg_power_w: float | None
    avg_hr: float | None


class WorkoutDetail(WorkoutSummary):
    samples: list[Sample]
    splits: list[Split]


class WeeklyTotal(BaseModel):
    week_start: str
    distance_m: float
    duration_s: float
    workouts: int


class PersonalBest(BaseModel):
    distance_m: int
    time_s: float
    split_s: float
    workout_id: int
    date: datetime


class StatsOverview(BaseModel):
    total_distance_m: float
    total_duration_s: float
    total_workouts: int
    weekly: list[WeeklyTotal]
    split_trend: list[dict]
    personal_bests: list[PersonalBest]


class StravaStatus(BaseModel):
    configured: bool
    connected: bool
    athlete_name: str | None = None


class RouteInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    location: str
    length_m: float
    waypoints: list[tuple[float, float]]
