from datetime import UTC, datetime

import pytest
from garmin_fit_sdk import Decoder, Stream

from app.services import analytics
from app.services.fit_encoder import encode_rowing_activity, fit_crc
from app.services.routes import ROUTES, position_at


def decode(data: bytes):
    def fresh() -> Decoder:  # each check consumes the stream
        return Decoder(Stream.from_byte_array(bytearray(data)))

    assert fresh().is_fit()
    assert fresh().check_integrity()
    messages, errors = fresh().read()
    assert errors == []
    return messages


def test_crc_of_file_with_crc_is_zero(samples):
    data = encode_rowing_activity(datetime(2026, 9, 14, tzinfo=UTC), samples, analytics.summarize(samples))
    assert fit_crc(data) == 0


def test_decodes_with_official_sdk(samples):
    start = datetime(2026, 9, 14, 7, 30, tzinfo=UTC)
    summary = analytics.summarize(samples)
    messages = decode(encode_rowing_activity(start, samples, summary))

    assert messages["file_id_mesgs"][0]["type"] == "activity"
    session = messages["session_mesgs"][0]
    assert session["sport"] == "rowing"
    assert session["sub_sport"] == "indoor_rowing"
    assert abs(session["total_distance"] - summary["distance_m"]) < 0.1
    assert session["total_timer_time"] == 600
    assert session["start_time"] == start

    records = messages["record_mesgs"]
    assert len(records) == len(samples)
    assert records[-1]["power"] == 180
    assert abs(records[-1]["distance"] - samples[-1]["distance"]) < 0.01
    assert len(messages["lap_mesgs"]) == 1
    assert messages["activity_mesgs"][0]["num_sessions"] == 1


def test_missing_values_are_encoded_as_invalid(samples):
    for s in samples:
        s["hr"] = None
        s["pace"] = None
    messages = decode(
        encode_rowing_activity(datetime(2026, 9, 14, tzinfo=UTC), samples, analytics.summarize(samples))
    )
    assert "heart_rate" not in messages["record_mesgs"][10]


def test_records_have_no_position_without_a_route(samples):
    messages = decode(
        encode_rowing_activity(datetime(2026, 9, 14, tzinfo=UTC), samples, analytics.summarize(samples))
    )
    assert "position_lat" not in messages["record_mesgs"][0]
    assert "position_long" not in messages["record_mesgs"][0]


def test_records_carry_the_route_position(samples):
    route = ROUTES["rotsee"]
    messages = decode(
        encode_rowing_activity(
            datetime(2026, 9, 14, tzinfo=UTC), samples, analytics.summarize(samples), route=route
        )
    )
    semicircle_to_deg = 180 / (1 << 31)
    records = messages["record_mesgs"]
    for sample, record in zip(samples, records, strict=True):
        expected_lat, expected_lon = position_at(route, sample["distance"])
        assert record["position_lat"] * semicircle_to_deg == pytest.approx(expected_lat, abs=1e-4)
        assert record["position_long"] * semicircle_to_deg == pytest.approx(expected_lon, abs=1e-4)
