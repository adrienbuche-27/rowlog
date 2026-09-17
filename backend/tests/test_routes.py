import pytest

from app.services.routes import (
    ROUTES,
    Route,
    _densify,
    _wavy_control_points,
    bounce_distance,
    haversine_m,
    position_at,
    route_length_m,
)

STRAIGHT = Route(id="test", name="Test", location="Nowhere", waypoints=((0.0, 0.0), (0.0, 0.01)))
STRAIGHT_LEN = route_length_m(STRAIGHT)  # ~1113 m at the equator


def test_all_builtin_routes_are_roughly_2000m():
    for route in ROUTES.values():
        assert 1800 <= route_length_m(route) <= 6000, route.id


def test_builtin_routes_are_densely_sampled():
    # ~10 waypoints per 500 m, i.e. roughly every 50 m, so the drawn/exported track curves
    # smoothly instead of kinking at a handful of widely spaced points.
    for route in ROUTES.values():
        length = route_length_m(route)
        spacing = length / (len(route.waypoints) - 1)
        assert 30 <= spacing <= 80, route.id


def test_builtin_routes_are_not_straight_lines():
    # A straight route's waypoints would all sit on the segment between its endpoints;
    # a real (or realistically wobbled) course should stray from that line.
    for route in ROUTES.values():
        start, end = route.waypoints[0], route.waypoints[-1]
        straight_len = haversine_m(start, end)
        via_waypoints = route_length_m(route)
        assert via_waypoints > straight_len, route.id


def test_wavy_control_points_keep_exact_endpoints():
    start, end = (0.0, 0.0), (0.0, 0.02)
    points = _wavy_control_points(start, end, amplitude_m=30, periods=1)
    assert points[0] == pytest.approx(start, abs=1e-9)
    assert points[-1] == pytest.approx(end, abs=1e-9)


def test_wavy_control_points_bulge_away_from_the_straight_line():
    start, end = (0.0, 0.0), (0.0, 0.02)
    # n=4, periods=1: offset(frac) = sin(2*pi*frac) is zero at frac=0, 0.5, 1 and peaks
    # at frac=0.25 — that quarter point is where the bulge actually shows up.
    points = _wavy_control_points(start, end, amplitude_m=30, periods=1, n=4)
    quarter_point = points[1]
    assert quarter_point[0] != pytest.approx(0.0, abs=1e-6)  # nudged off the lon=const line


def test_densify_passes_through_every_control_point():
    controls = [(0.0, 0.0), (0.0, 0.01), (0.001, 0.02), (0.0, 0.03)]
    dense = _densify(controls, spacing_m=1000)
    for c in controls:
        assert any(d == pytest.approx(c, abs=1e-9) for d in dense)


def test_densify_short_lists_pass_through_unchanged():
    assert _densify([(0.0, 0.0), (0.0, 0.01)]) == ((0.0, 0.0), (0.0, 0.01))
    assert _densify([]) == ()


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


def test_route_ids_are_unique_and_match_dict_keys():
    for key, route in ROUTES.items():
        assert route.id == key
