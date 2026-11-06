"""Bundled YAML scenarios and scenario registry."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from .models import ScenarioSpec, ScenarioSummary

DEFAULT_SCENARIOS_DIR = Path(__file__).resolve().parent.parent / "data" / "scenarios"


def parse_scenario_yaml(text: str) -> ScenarioSpec:
    data: Any = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ValueError("Scenario YAML must decode to a mapping")
    return ScenarioSpec.model_validate(data)


def dump_scenario_yaml(spec: ScenarioSpec) -> str:
    payload = spec.model_dump(mode="json")
    return yaml.safe_dump(payload, sort_keys=False, default_flow_style=False)


class ScenarioRegistry:
    def __init__(self, directory: str | Path = DEFAULT_SCENARIOS_DIR) -> None:
        self.directory = Path(directory)
        self._scenarios: dict[str, ScenarioSpec] = {}
        self.reload()

    def reload(self) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        scenarios: dict[str, ScenarioSpec] = {}
        for path in sorted(self.directory.glob("*.yaml")):
            spec = parse_scenario_yaml(path.read_text(encoding="utf-8"))
            scenarios[spec.id] = spec
        self._scenarios = scenarios

    def list_summaries(self) -> list[ScenarioSummary]:
        return [
            ScenarioSummary(
                id=s.id,
                name=s.name,
                description=s.description,
                airport_id=s.airport_id,
                duration_ms=s.duration_ms,
                default_seed=s.default_seed,
                aircraft_count=len(s.spawns),
                trigger_count=len(s.triggers),
            )
            for s in self._scenarios.values()
        ]

    def get(self, scenario_id: str) -> ScenarioSpec:
        return self._scenarios[scenario_id]

    def save(self, spec: ScenarioSpec) -> ScenarioSpec:
        self._scenarios[spec.id] = spec
        return spec
