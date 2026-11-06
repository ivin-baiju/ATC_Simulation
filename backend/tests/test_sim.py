from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from atc_sim.api.app import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


def test_list_and_get_scenarios(client: TestClient) -> None:
    r = client.get("/api/scenarios")
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 3
    ids = {s["id"] for s in items}
    assert "crossing_runways_incursion" in ids

    r2 = client.get("/api/scenarios/crossing_runways_incursion")
    assert r2.status_code == 200
    spec = r2.json()
    assert spec["airport_id"] == "genfield"
    assert len(spec["spawns"]) == 4

    ryaml = client.get("/api/scenarios/crossing_runways_incursion/yaml")
    assert ryaml.status_code == 200
    assert "crossing_runways_incursion" in ryaml.text


def test_runs_are_deterministic_and_produce_decisions_and_alerts(client: TestClient) -> None:
    r1 = client.get(
        "/api/runs",
        params={
            "scenario_id": "crossing_runways_incursion",
            "controller": "proactive_ai",
            "seed": 42,
        },
    )
    r2 = client.get(
        "/api/runs",
        params={
            "scenario_id": "crossing_runways_incursion",
            "controller": "proactive_ai",
            "seed": 42,
        },
    )
    assert r1.status_code == 200
    frames1 = r1.json()
    frames2 = r2.json()
    assert frames1 == frames2
    assert len(frames1) == 91  # 0s..90s inclusive

    final = frames1[-1]
    assert len(final["alerts"]) >= 1
    assert len(final["decisions"]) >= 1
    assert len(final["markers"]) >= 1
    assert any(d["safety_filter_status"] == "vetoed" for d in final["decisions"])


def test_compare_controllers_proactive_outperforms_baseline(client: TestClient) -> None:
    r = client.get(
        "/api/compare",
        params={"scenario_id": "crossing_runways_incursion", "seed": 42},
    )
    assert r.status_code == 200
    comp = r.json()
    pm = comp["primary_metrics"]
    sm = comp["secondary_metrics"]
    assert pm["min_separation_m"] > sm["min_separation_m"]
    assert pm["safety_filter_interventions"] >= sm["safety_filter_interventions"]


def test_save_custom_scenario_and_evaluation_report(client: TestClient) -> None:
    yaml_resp = client.get("/api/scenarios/single_runway_ops/yaml")
    custom_yaml = yaml_resp.text.replace("id: single_runway_ops", "id: custom_single_test")
    save_resp = client.post("/api/scenarios/from-yaml", json={"yaml_text": custom_yaml})
    assert save_resp.status_code == 200
    assert save_resp.json()["id"] == "custom_single_test"

    rep = client.get(
        "/api/report", params={"scenario_id": "crossing_runways_incursion", "seed": 42}
    )
    assert rep.status_code == 200
    assert "SIMULATION ONLY - NOT FOR OPERATIONAL USE" in rep.text
    assert "#167D8D" in rep.text
    assert "#071B2B" in rep.text


def test_websocket_sim_stepping_and_seeking(client: TestClient) -> None:
    with client.websocket_connect("/ws/sim?scenario_id=single_runway_ops&seed=77") as ws:
        msg0 = ws.receive_json()
        assert msg0["type"] == "frame"
        assert msg0["frame"]["time_ms"] == 0

        ws.send_json({"cmd": "step", "delta": 5})
        msg5 = ws.receive_json()
        assert msg5["frame"]["time_ms"] == 5000

        ws.send_json({"cmd": "seek", "time_ms": 12000})
        msg12 = ws.receive_json()
        assert msg12["frame"]["time_ms"] == 12000
