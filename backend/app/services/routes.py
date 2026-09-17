"""Famous rowing courses used to give an indoor row a virtual GPS track.

Pure functions only (no I/O), so they stay unit-testable per CLAUDE.md conventions.
Each route is the real centerline of a well-known regatta course, described as a
handful of (lat, lon) waypoints in degrees. A workout's cumulative distance is walked
along that line, bouncing back to the start whenever it runs past the end — which is
exactly what a crew does when it rows a course longer than one length of it.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

EARTH_RADIUS_M = 6_371_000


@dataclass(frozen=True)
class Route:
    id: str
    name: str
    location: str
    # (lat, lon) waypoints in degrees, start to finish.
    waypoints: tuple[tuple[float, float], ...]


ROUTES: dict[str, Route] = {
    r.id: r
    for r in [
        Route(
            id="rotsee",
            name="Rotsee",
            location="Lucerne, Switzerland",
            waypoints=((47.05995, 8.32395), (47.04430, 8.30980)),
        ),
        Route(
            id="henley",
            name="Henley Royal Regatta course",
            location="Henley-on-Thames, England",
            waypoints=((51.53690, -0.90080), (51.55490, -0.89440)),
        ),
        Route(
            id="charles-river",
            name="Charles River, Head of the Charles course",
            location="Boston, USA",
            waypoints=(
                (42.35590, -71.12570),
                (42.35990, -71.10500),
                (42.36790, -71.09380),
                (42.37280, -71.07500),
            ),
        ),
        Route(
            id="lake-bled",
            name="Lake Bled 2000 m course",
            location="Bled, Slovenia",
            waypoints=((46.36030, 14.10120), (46.37120, 14.08040)),
        ),
        Route(
            id="vaires-sur-marne",
            name="Vaires-sur-Marne Olympic course",
            location="Paris, France",
            waypoints=((48.86960, 2.63120), (48.86490, 2.65710)),
        ),
    ]
}


def haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = radians(a[0]), radians(a[1]), radians(b[0]), radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))


def _lerp(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def route_length_m(route: Route) -> float:
    pts = route.waypoints
    return sum(haversine_m(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def bounce_distance(distance_m: float, length_m: float) -> float:
    """Fold a distance onto [0, length], bouncing at each end.

    Rowing a course longer than its length means turning around and rowing it
    again, so position should oscillate rather than jump back to the start.
    """
    if length_m <= 0:
        return 0.0
    period = 2 * length_m
    d = distance_m % period
    return d if d <= length_m else period - d


def position_at(route: Route, distance_m: float) -> tuple[float, float]:
    """Lat/lon at `distance_m` along `route`, bouncing past the end."""
    pts = route.waypoints
    length = route_length_m(route)
    d = bounce_distance(max(distance_m, 0.0), length)

    covered = 0.0
    for i in range(len(pts) - 1):
        seg_len = haversine_m(pts[i], pts[i + 1])
        if seg_len <= 0:
            continue
        if d <= covered + seg_len or i == len(pts) - 2:
            t = 0.0 if seg_len == 0 else min(max((d - covered) / seg_len, 0.0), 1.0)
            return _lerp(pts[i], pts[i + 1], t)
        covered += seg_len
    return pts[-1]
