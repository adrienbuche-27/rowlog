import pytest

from app.services.routes import ROUTES, Route, bounce_distance, position_at, route_length_m

STRAIGHT = Route(id="test", name="Test", location="Nowhere", waypoints=((0.0, 0.0), (0.0, 0.01)))
STRAIGHT_LEN = route_length_m(STRAIGHT)  # ~1113 m at the equator


def test_all_builtin_routes_are_roughly_2000m():
    for route in ROUTES.values():
        assert 1800 <= route_length_m(route) <= 6000, route.id


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
