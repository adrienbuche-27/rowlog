"""Famous rowing courses used to give an indoor row a virtual GPS track.

Pure functions only (no I/O), so they stay unit-testable per CLAUDE.md conventions.
Each route is the real centerline of a well-known regatta course, described as dense
(lat, lon) waypoints in degrees. A workout's cumulative distance is walked along that
line, bouncing back to the start whenever it runs past the end — which is exactly what
a crew does when it rows a course longer than one length of it.

Waypoints are generated, not hand-typed one by one: a handful of control points (either
real bend landmarks, for a winding river, or a straight start/end nudged into a gentle
waterway wobble, for the arrow-straight regatta courses) are run through a Catmull-Rom
spline (`_densify`) to get a smooth curve sampled roughly every 50 m. This is still an
approximation, not a surveyed track — see docs/FTMS.md-style caveat in the routes UI.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import asin, atan2, cos, degrees, pi, radians, sin, sqrt

EARTH_RADIUS_M = 6_371_000

LatLon = tuple[float, float]


@dataclass(frozen=True)
class Route:
    id: str
    name: str
    location: str
    # Dense (lat, lon) waypoints in degrees, start to finish. See `_densify`.
    waypoints: tuple[LatLon, ...]


def haversine_m(a: LatLon, b: LatLon) -> float:
    lat1, lon1, lat2, lon2 = radians(a[0]), radians(a[1]), radians(b[0]), radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))


def _bearing_deg(a: LatLon, b: LatLon) -> float:
    lat1, lon1, lat2, lon2 = radians(a[0]), radians(a[1]), radians(b[0]), radians(b[1])
    dlon = lon2 - lon1
    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    return degrees(atan2(x, y)) % 360


def _destination(origin: LatLon, bearing_deg: float, distance_m: float) -> LatLon:
    """Point `distance_m` from `origin` along a great-circle `bearing_deg`."""
    if distance_m == 0:
        return origin
    lat1, lon1 = radians(origin[0]), radians(origin[1])
    brng = radians(bearing_deg)
    ang = distance_m / EARTH_RADIUS_M
    lat2 = asin(sin(lat1) * cos(ang) + cos(lat1) * sin(ang) * cos(brng))
    lon2 = lon1 + atan2(sin(brng) * sin(ang) * cos(lat1), cos(ang) - sin(lat1) * sin(lat2))
    return (degrees(lat2), degrees(lon2))


def _wavy_control_points(
    start: LatLon, end: LatLon, amplitude_m: float, periods: float, n: int = 8
) -> list[LatLon]:
    """Control points along `start`→`end`, nudged sideways in a gentle sine wave.

    For courses that are essentially straight in reality (championship regatta lanes,
    a purpose-built basin) but still sit on a natural waterway that's never a perfect
    ruler line. Endpoints are left exact so the course still starts/ends on its real
    landmark coordinates.
    """
    total = haversine_m(start, end)
    bearing = _bearing_deg(start, end)
    perpendicular = bearing + 90
    points = []
    for i in range(n + 1):
        frac = i / n
        along = _destination(start, bearing, total * frac)
        lateral = amplitude_m * sin(periods * 2 * pi * frac) if 0 < i < n else 0.0
        points.append(_destination(along, perpendicular, lateral) if lateral else along)
    return points


def _catmull_rom_point(p0: LatLon, p1: LatLon, p2: LatLon, p3: LatLon, t: float) -> LatLon:
    t2, t3 = t * t, t * t * t

    def axis(a: float, b: float, c: float, d: float) -> float:
        return 0.5 * (
            2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3
        )

    return (axis(p0[0], p1[0], p2[0], p3[0]), axis(p0[1], p1[1], p2[1], p3[1]))


def _densify(control_points: list[LatLon], spacing_m: float = 50.0) -> tuple[LatLon, ...]:
    """Smooth a polyline through `control_points` with a Catmull-Rom spline.

    Passes exactly through every control point; samples each segment finely enough to
    average ~`spacing_m` between waypoints, so the drawn/exported track curves instead
    of kinking at each control point.
    """
    if len(control_points) < 3:
        return tuple(control_points)
    padded = [control_points[0], *control_points, control_points[-1]]
    out = [control_points[0]]
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        seg_len = haversine_m(p1, p2)
        steps = max(1, round(seg_len / spacing_m))
        for s in range(1, steps + 1):
            out.append(_catmull_rom_point(p0, p1, p2, p3, s / steps))
    return tuple(out)


def _wavy_route(start: LatLon, end: LatLon, amplitude_m: float, periods: float) -> tuple[LatLon, ...]:
    return _densify(_wavy_control_points(start, end, amplitude_m, periods))


ROUTES: dict[str, Route] = {
    r.id: r
    for r in [
        Route(
            id="rotsee",
            name="Rotsee",
            location="Lucerne, Switzerland",
            # Prized as a championship venue precisely because it's almost dead straight;
            # only a very gentle natural shoreline curve.
            waypoints=_wavy_route((47.05995, 8.32395), (47.04430, 8.30980), amplitude_m=25, periods=1),
        ),
        Route(
            id="henley",
            name="Henley Royal Regatta course",
            location="Henley-on-Thames, England",
            # "The Reach" is a long straight stretch of the Thames, with a slight bend
            # near each end.
            waypoints=_wavy_route((51.53690, -0.90080), (51.55490, -0.89440), amplitude_m=20, periods=1.5),
        ),
        Route(
            id="charles-river",
            name="Charles River, Head of the Charles course",
            location="Boston, USA",
            # Genuinely winding — these are its real bends (BU Bridge, past Magazine
            # Beach, under Western Ave, the turn at Eliot Bridge); spline through them
            # instead of straight segments so the turns flow like the real river does.
            waypoints=_densify(
                [
                    (42.35590, -71.12570),
                    (42.35990, -71.10500),
                    (42.36790, -71.09380),
                    (42.37280, -71.07500),
                ]
            ),
        ),
        Route(
            id="lake-bled",
            name="Lake Bled 2000 m course",
            location="Bled, Slovenia",
            # The buoyed lanes are straight, but they hug the oval lake's shoreline curve.
            waypoints=_wavy_route((46.36030, 14.10120), (46.37120, 14.08040), amplitude_m=35, periods=1),
        ),
        Route(
            id="vaires-sur-marne",
            name="Vaires-sur-Marne Olympic course",
            location="Paris, France",
            # Purpose-built regatta basin: genuinely dead straight by design, so only a
            # token wobble.
            waypoints=_wavy_route((48.86960, 2.63120), (48.86490, 2.65710), amplitude_m=4, periods=1),
        ),
    ]
}


def _lerp(a: LatLon, b: LatLon, t: float) -> LatLon:
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


def position_at(route: Route, distance_m: float) -> LatLon:
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
