"""GPS course geometry: parsing a user's GPX file and walking a workout along it.

Pure functions only (no I/O) except `parse_gpx`, which only ever reads the bytes handed
to it — no network, no filesystem — so this stays fast and unit-testable per CLAUDE.md
conventions. A workout's cumulative distance is walked along a route's waypoints,
bouncing back to the start whenever it runs past the end — which is exactly what a crew
does when it rows a course longer than one length of it.

Routes themselves (name, waypoints, length) are stored in the `routes` table
(app.models.Route); this module only has the math and the GPX parser.
"""

from __future__ import annotations

from collections.abc import Sequence
from math import asin, cos, radians, sin, sqrt
from xml.etree import ElementTree

EARTH_RADIUS_M = 6_371_000

LatLon = tuple[float, float]


class GpxParseError(ValueError):
    pass


def parse_gpx(data: bytes, max_points: int = 300) -> list[LatLon]:
    """Extract an ordered (lat, lon) track from a GPX file's track/route points.

    Namespace-agnostic (GPX's default namespace varies by exporter), so this looks at
    local tag names only. Falls back from track points (<trkpt>) to route points
    (<rtept>). Downsamples evenly to `max_points` if the file has more than that, since
    a raw GPS log can have thousands of points recorded every second or two.
    """
    try:
        root = ElementTree.fromstring(data)
    except ElementTree.ParseError as exc:
        raise GpxParseError(f"Not a valid GPX/XML file: {exc}") from exc

    def local_tag(elem: ElementTree.Element) -> str:
        return elem.tag.rsplit("}", 1)[-1]

    points: list[LatLon] = []
    for elem in root.iter():
        if local_tag(elem) not in ("trkpt", "rtept"):
            continue
        lat, lon = elem.get("lat"), elem.get("lon")
        if lat is None or lon is None:
            continue
        try:
            points.append((float(lat), float(lon)))
        except ValueError:
            continue

    if len(points) < 2:
        raise GpxParseError("No track with at least two points found in this GPX file")

    return _simplify(points, max_points)


def _simplify(points: list[LatLon], max_points: int) -> list[LatLon]:
    if len(points) <= max_points:
        return points
    step = (len(points) - 1) / (max_points - 1)
    return [points[round(i * step)] for i in range(max_points)]


def haversine_m(a: LatLon, b: LatLon) -> float:
    lat1, lon1, lat2, lon2 = radians(a[0]), radians(a[1]), radians(b[0]), radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(h))


def _lerp(a: LatLon, b: LatLon, t: float) -> LatLon:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def route_length_m(waypoints: Sequence[LatLon]) -> float:
    return sum(haversine_m(waypoints[i], waypoints[i + 1]) for i in range(len(waypoints) - 1))


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


def position_at(waypoints: Sequence[LatLon], distance_m: float) -> LatLon:
    """Lat/lon at `distance_m` along `waypoints`, bouncing past the end."""
    length = route_length_m(waypoints)
    d = bounce_distance(max(distance_m, 0.0), length)

    covered = 0.0
    for i in range(len(waypoints) - 1):
        seg_len = haversine_m(waypoints[i], waypoints[i + 1])
        if seg_len <= 0:
            continue
        if d <= covered + seg_len or i == len(waypoints) - 2:
            t = 0.0 if seg_len == 0 else min(max((d - covered) / seg_len, 0.0), 1.0)
            return _lerp(waypoints[i], waypoints[i + 1], t)
        covered += seg_len
    return waypoints[-1]
