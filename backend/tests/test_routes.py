import pytest

from app.services.routes import (
    GpxParseError,
    bounce_distance,
    haversine_m,
    parse_gpx,
    position_at,
    route_length_m,
)

STRAIGHT = [(0.0, 0.0), (0.0, 0.01)]
STRAIGHT_LEN = route_length_m(STRAIGHT)  # ~1113 m at the equator


def gpx(points: list[tuple[float, float]], tag: str = "trkpt", wrap: str = "trk><trkseg") -> bytes:
    body = "".join(f'<{tag} lat="{lat}" lon="{lon}"/>' for lat, lon in points)
    open_tags = wrap.split("><")
    close_tags = "></".join(reversed(open_tags))
    return f'<gpx><{wrap}>{body}</{close_tags}></gpx>'.encode()


def test_route_length_sums_segment_distances():
    assert route_length_m([(0.0, 0.0), (0.0, 0.0), (0.0, 0.0)]) == 0
    assert route_length_m(STRAIGHT) == pytest.approx(1112, abs=2)


def test_position_at_start_and_end():
    assert position_at(STRAIGHT, 0) == pytest.approx((0.0, 0.0))
    assert position_at(STRAIGHT, STRAIGHT_LEN) == pytest.approx((0.0, 0.01))


def test_position_at_midpoint():
    lat, lon = position_at(STRAIGHT, STRAIGHT_LEN / 2)
    assert lat == pytest.approx(0.0)
    assert lon == pytest.approx(0.005, abs=1e-4)


def test_bounce_distance_folds_past_the_end():
    length = 2000.0
    assert bounce_distance(0, length) == 0
    assert bounce_distance(2000, length) == 2000
    assert bounce_distance(2500, length) == 1500  # turned around, rowing back
    assert bounce_distance(4000, length) == 0  # back at the start
    assert bounce_distance(6500, length) == 1500  # second lap, same as 2500


def test_bounce_distance_handles_zero_length_route():
    assert bounce_distance(500, 0) == 0


def test_position_at_bounces_past_the_end():
    # past one full length, should be heading back toward the start
    lat, lon = position_at(STRAIGHT, STRAIGHT_LEN + 100)
    back_lat, back_lon = position_at(STRAIGHT, STRAIGHT_LEN - 100)
    assert (lat, lon) == pytest.approx((back_lat, back_lon))


def test_parse_gpx_reads_track_points():
    points = [(47.05995, 8.32395), (47.05, 8.32), (47.0443, 8.3098)]
    assert parse_gpx(gpx(points)) == points


def test_parse_gpx_falls_back_to_route_points():
    points = [(51.5369, -0.9008), (51.5549, -0.8944)]
    assert parse_gpx(gpx(points, tag="rtept", wrap="rte")) == points


def test_parse_gpx_handles_the_default_gpx_namespace():
    points = [(0.0, 0.0), (1.0, 1.0)]
    body = "".join(f'<trkpt lat="{lat}" lon="{lon}"/>' for lat, lon in points)
    data = f'<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>{body}</trkseg></trk></gpx>'.encode()
    assert parse_gpx(data) == points


def test_parse_gpx_downsamples_long_tracks():
    points = [(0.0, i * 0.0001) for i in range(1000)]
    result = parse_gpx(gpx(points), max_points=300)
    assert len(result) == 300
    assert result[0] == points[0]
    assert result[-1] == points[-1]


def test_parse_gpx_rejects_a_track_with_fewer_than_two_points():
    with pytest.raises(GpxParseError):
        parse_gpx(gpx([(0.0, 0.0)]))
    with pytest.raises(GpxParseError):
        parse_gpx(gpx([]))


def test_parse_gpx_rejects_invalid_xml():
    with pytest.raises(GpxParseError):
        parse_gpx(b"not xml at all")


def test_haversine_symmetric():
    a, b = (47.05995, 8.32395), (47.0443, 8.3098)
    assert haversine_m(a, b) == pytest.approx(haversine_m(b, a))
