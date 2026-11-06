from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from atc_sim import SAFETY_NOTICE
from atc_sim.api.app import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["notice"] == SAFETY_NOTICE
    assert body["airports"] >= 2


def test_every_response_carries_safety_header(client: TestClient) -> None:
    for path in ("/api/health", "/api/airports", "/api/airports/nope"):
        assert client.get(path).headers["X-Simulation-Only"] == SAFETY_NOTICE


def test_list_airports(client: TestClient) -> None:
    r = client.get("/api/airports")
    assert r.status_code == 200
    by_id = {a["id"]: a for a in r.json()}
    assert by_id["genfield"]["runways"] == ["09/27", "04/22"]
    assert by_id["sample_single"]["runways"] == ["18/36"]


def test_get_airport_layout(client: TestClient) -> None:
    r = client.get("/api/airports/genfield")
    assert r.status_code == 200
    ap = r.json()
    assert ap["coordinate_system"] == "local-enu-m"
    assert {"runways", "taxiways", "aprons", "gates", "hold_shorts", "fixes"} <= ap.keys()
    rwy = ap["runways"][0]
    assert len(rwy["centerline"]) == 2 and len(rwy["centerline"][0]) == 2


def test_unknown_airport_404(client: TestClient) -> None:
    assert client.get("/api/airports/nope").status_code == 404


def test_bad_layout_fails_at_startup(tmp_path) -> None:  # type: ignore[no-untyped-def]
    (tmp_path / "bad.geojson").write_text('{"type": "FeatureCollection"}')
    with pytest.raises(Exception, match="airport"), TestClient(create_app(tmp_path)):
        pass
