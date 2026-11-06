"""Simulation engine, scenarios, models, and HTML report generator."""

from .engine import ControllerKind, compare_controllers, simulate_run
from .models import (
    AircraftState,
    AlertSeverity,
    CommEntry,
    ComparisonResult,
    ControllerDecision,
    FlightPhase,
    MetricPoint,
    RunMetrics,
    ScenarioSpawn,
    ScenarioSpec,
    ScenarioSummary,
    ScenarioTrigger,
    SimAlert,
    SimFrame,
    TimelineMarker,
)
from .report import render_evaluation_report_html
from .scenarios import (
    DEFAULT_SCENARIOS_DIR,
    ScenarioRegistry,
    dump_scenario_yaml,
    parse_scenario_yaml,
)

__all__ = [
    "DEFAULT_SCENARIOS_DIR",
    "AircraftState",
    "AlertSeverity",
    "CommEntry",
    "ComparisonResult",
    "ControllerDecision",
    "ControllerKind",
    "FlightPhase",
    "MetricPoint",
    "RunMetrics",
    "ScenarioRegistry",
    "ScenarioSpawn",
    "ScenarioSpec",
    "ScenarioSummary",
    "ScenarioTrigger",
    "SimAlert",
    "SimFrame",
    "TimelineMarker",
    "compare_controllers",
    "dump_scenario_yaml",
    "parse_scenario_yaml",
    "render_evaluation_report_html",
    "simulate_run",
]
