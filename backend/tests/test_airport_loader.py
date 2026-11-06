from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from atc_sim.airport import DEFAULT_AIRPORTS_DIR, AirportRegistry, geo, load_airport, parse_airport
from atc_sim.airport.loader import AirportValidationError, runway_id

GENFIELD = DEFAULT_AIRPORTS_DIR / "genfield.geojson"
SINGLE = DEFAULT_AIRPORTS_DIR / "sample_single.geojson"


@pytest.fixture
def genfield_raw() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(GENFIELD.read_text())
    return data


def _features(data: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    return [f for f in data["features"] if f["properties"]["kind"] == kind]


# --------------------------------------------------------------- bundled data
def test_registry_loads_bundled_airports() -> None:
    reg = AirportRegistry()
    assert {"genfield", "sample_single", "vidp", "vabb", "egll", "ksfo"} <= set(reg.ids())


def test_sample_single_runway() -> None:
    ap = load_airport(SINGLE)
    assert [r.id for r in ap.runways] == ["18/36"]
    rwy = ap.runways[0]
    assert rwy.length_m == pytest.approx(2500, abs=0.5)
    assert rwy.ends[0].designator == "36"
    assert geo.angle_diff_deg(rwy.ends[0].heading_deg, 0.0) < 0.1
    assert len(ap.hold_shorts) == 4
    assert all(h.runway == "18/36" for h in ap.hold_shorts)


def test_genfield_matches_spec() -> None:
    """Two crossing runways, parallel taxiways, 6-10 gates, holds, arr/dep fixes."""
    ap = load_airport(GENFIELD)
    assert {r.id for r in ap.runways} == {"09/27", "04/22"}
    r1, r2 = ap.runway("09/27"), ap.runway("04/22")
    assert geo.segments_intersect(*r1.centerline, *r2.centerline), "runways must cross"
    assert 6 <= len(ap.gates) <= 10
    assert {f.role for f in ap.fixes} == {"arrival", "departure"}
    # Taxiway A crosses runway 04/22, so it must have a hold-short on each side.
    assert sum(1 for h in ap.hold_shorts if (h.taxiway, h.runway) == ("A", "04/22")) == 2
    # Taxiway C crosses 09/27.
    assert sum(1 for h in ap.hold_shorts if (h.taxiway, h.runway) == ("C", "09/27")) == 2


def test_hold_shorts_are_outside_runway_and_at_standard_distance() -> None:
    for path in (GENFIELD, SINGLE):
        ap = load_airport(path)
        for h in ap.hold_shorts:
            r = ap.runway(h.runway)
            mid = geo.scale(geo.add(*h.line), 0.5)
            d = geo.point_line_distance(mid, *r.centerline)
            assert d > r.width_m / 2
            assert d == pytest.approx(90.0, abs=0.5), h.id


def test_projection_round_trip() -> None:
    for lon, lat in [(-30.0, 52.0), (-29.98, 52.01), (-30.02, 51.99)]:
        x, y = geo.project(lon, lat, -30.0, 52.0)
        lon2, lat2 = geo.unproject(x, y, -30.0, 52.0)
        assert lon2 == pytest.approx(lon, abs=1e-10)
        assert lat2 == pytest.approx(lat, abs=1e-10)


def test_runway_headings_and_polygon() -> None:
    ap = load_airport(GENFIELD)
    r = ap.runway("04/22")
    assert r.ends[0].heading_deg == pytest.approx(40.0, abs=0.05)
    assert r.ends[1].heading_deg == pytest.approx(220.0, abs=0.05)
    assert r.length_m == pytest.approx(2200.0, abs=0.5)
    assert len(r.polygon) == 5 and r.polygon[0] == r.polygon[-1]


def test_bounds_contain_everything() -> None:
    ap = load_airport(GENFIELD)
    b = ap.bounds_all
    for f in ap.fixes:
        assert b.min_x <= f.position[0] <= b.max_x and b.min_y <= f.position[1] <= b.max_y
    s = ap.bounds_surface
    assert s.max_x - s.min_x < b.max_x - b.min_x


def test_generator_output_is_up_to_date() -> None:
    from scripts.make_sample_airports import main

    assert main(["--check"]) == 0


def test_runway_id_orders_lower_first() -> None:
    assert runway_id(("36", "18")) == "18/36"
    assert runway_id(("09L", "27R")) == "09L/27R"


# ----------------------------------------------------------------- validation
def _expect(data: dict[str, Any], fragment: str) -> None:
    with pytest.raises(AirportValidationError) as exc:
        parse_airport(data, source="test")
    assert any(fragment in e for e in exc.value.errors), exc.value.errors


def test_rejects_non_featurecollection() -> None:
    _expect({"type": "Feature"}, "FeatureCollection")


def test_rejects_unknown_kind(genfield_raw: dict[str, Any]) -> None:
    genfield_raw["features"][0]["properties"]["kind"] = "helipad"
    _expect(genfield_raw, "unknown kind")


def test_rejects_wrong_geometry(genfield_raw: dict[str, Any]) -> None:
    gate = _features(genfield_raw, "gate")[0]
    gate["geometry"] = {"type": "LineString", "coordinates": [[0, 0], [0, 0.001]]}
    _expect(genfield_raw, "needs Point geometry")


def test_rejects_reversed_runway(genfield_raw: dict[str, Any]) -> None:
    rwy = _features(genfield_raw, "runway")[0]
    rwy["geometry"]["coordinates"].reverse()
    _expect(genfield_raw, "coordinate order reversed")


def test_rejects_non_reciprocal_designators(genfield_raw: dict[str, Any]) -> None:
    _features(genfield_raw, "runway")[0]["properties"]["designators"] = ["09", "26"]
    _expect(genfield_raw, "not reciprocal")


def test_rejects_unpaired_suffixes(genfield_raw: dict[str, Any]) -> None:
    _features(genfield_raw, "runway")[0]["properties"]["designators"] = ["09L", "27L"]
    _expect(genfield_raw, "do not pair")


def test_rejects_hold_short_unknown_refs(genfield_raw: dict[str, Any]) -> None:
    hs = _features(genfield_raw, "hold_short")[0]
    hs["properties"]["runway"] = "18/36"
    hs["properties"]["taxiway"] = "Z9"
    _expect(genfield_raw, "unknown runway")
    _expect(genfield_raw, "unknown taxiway")


def test_rejects_hold_short_not_crossing_taxiway(genfield_raw: dict[str, Any]) -> None:
    hs = _features(genfield_raw, "hold_short")[0]
    hs["properties"]["taxiway"] = "L"  # apron taxilane, nowhere near
    _expect(genfield_raw, "does not cross taxiway")


def test_rejects_hold_short_on_runway(genfield_raw: dict[str, Any]) -> None:
    rwy = _features(genfield_raw, "runway")[0]
    a, b = rwy["geometry"]["coordinates"]
    mid_lon, mid_lat = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    genfield_raw["features"].append(
        {
            "type": "Feature",
            "id": "HS-BAD",
            "geometry": {
                "type": "LineString",
                "coordinates": [[mid_lon, mid_lat - 0.0001], [mid_lon, mid_lat + 0.0001]],
            },
            "properties": {"kind": "hold_short", "runway": "09/27", "taxiway": "A3"},
        }
    )
    _expect(genfield_raw, "lies on runway")


def test_rejects_duplicates(genfield_raw: dict[str, Any]) -> None:
    gates = _features(genfield_raw, "gate")
    dup = copy.deepcopy(gates[0])
    dup["id"] = "GATE-DUP"
    genfield_raw["features"].append(dup)
    _expect(genfield_raw, "duplicate gate name")


def test_rejects_far_away_surface_feature(genfield_raw: dict[str, Any]) -> None:
    _features(genfield_raw, "gate")[0]["geometry"]["coordinates"] = [-29.0, 52.0]
    _expect(genfield_raw, "from the reference point")


def test_rejects_bad_fix_role(genfield_raw: dict[str, Any]) -> None:
    _features(genfield_raw, "fix")[0]["properties"]["role"] = "enroute"
    _expect(genfield_raw, "'role'")


def test_reports_all_errors_at_once(genfield_raw: dict[str, Any]) -> None:
    _features(genfield_raw, "fix")[0]["properties"]["role"] = "enroute"
    _features(genfield_raw, "runway")[0]["properties"]["width_m"] = -1
    with pytest.raises(AirportValidationError) as exc:
        parse_airport(genfield_raw)
    assert len(exc.value.errors) >= 2


def test_rejects_invalid_json(tmp_path: Path) -> None:
    p = tmp_path / "bad.geojson"
    p.write_text("{not json")
    with pytest.raises(AirportValidationError, match="invalid JSON"):
        load_airport(p)


def test_registry_rejects_duplicate_ids(tmp_path: Path) -> None:
    for name in ("a.geojson", "b.geojson"):
        (tmp_path / name).write_text(SINGLE.read_text())
    with pytest.raises(AirportValidationError, match="already defined"):
        AirportRegistry(tmp_path)
