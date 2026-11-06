"""Data models for simulation state, aircraft, alerts, communications, decisions, and metrics."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Point = tuple[float, float]

FlightPhase = Literal[
    "taxi_out",
    "holding_short",
    "lined_up",
    "takeoff_roll",
    "departing",
    "final_approach",
    "landing_roll",
    "taxi_in",
    "go_around",
    "parked",
]

AlertSeverity = Literal["advisory", "caution", "warning"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class AircraftState(_Frozen):
    callsign: str
    aircraft_type: str = "B738"
    role: Literal["arrival", "departure", "surface"] = "surface"
    phase: FlightPhase
    position: Point = Field(description="Local ENU metres [x, y]")
    heading_deg: float = Field(description="True heading [0, 360)")
    speed_kts: float = Field(ge=0.0)
    target_speed_kts: float = Field(ge=0.0)
    altitude_ft: float = Field(ge=0.0)
    vertical_speed_fpm: float = 0.0
    assigned_runway: str | None = None
    route: list[Point] = Field(default_factory=list)
    hold_short_of: str | None = None
    cleared_to_cross: list[str] = Field(default_factory=list)
    cleared_takeoff: bool = False
    cleared_land: bool = False
    separation_ring_m: float = 150.0
    predicted_trajectory: list[Point] = Field(
        default_factory=list, description="Future positions over lookahead window"
    )
    alert_severity: AlertSeverity | None = None


class SimAlert(_Frozen):
    id: str
    time_ms: int
    severity: AlertSeverity
    kind: Literal["runway_incursion", "crossing_conflict", "loss_of_separation", "advisory"]
    title: str
    message: str
    involved: list[str]
    runway: str | None = None
    separation_m: float | None = None


class CommEntry(_Frozen):
    id: str
    time_ms: int
    speaker: Literal["ATC", "PILOT", "SYSTEM"]
    callsign: str
    transmission: str
    instruction_kind: str | None = None


class ControllerDecision(_Frozen):
    id: str
    time_ms: int
    controller: str
    callsign: str
    instruction: str
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)
    safety_filter_status: Literal["passed", "vetoed", "modified"]
    safety_filter_note: str


class TimelineMarker(_Frozen):
    id: str
    time_ms: int
    kind: Literal["detection", "instruction", "near_miss"]
    severity: AlertSeverity | None = None
    label: str
    callsigns: list[str] = Field(default_factory=list)


class MetricPoint(_Frozen):
    time_ms: int
    min_separation_m: float
    active_conflicts: int
    cumulative_alerts: int
    throughput: int


class RunMetrics(_Frozen):
    duration_ms: int
    min_separation_m: float
    total_alerts: int
    warning_alerts: int
    caution_alerts: int
    advisory_alerts: int
    near_miss_count: int
    instructions_issued: int
    safety_filter_interventions: int
    throughput_completed: int
    avg_taxi_delay_s: float
    series: list[MetricPoint]


class SimFrame(_Frozen):
    run_id: str
    scenario_id: str
    airport_id: str
    controller: str
    seed: int
    tick: int
    time_ms: int
    duration_ms: int
    aircraft: list[AircraftState]
    alerts: list[SimAlert]
    comms: list[CommEntry]
    decisions: list[ControllerDecision]
    markers: list[TimelineMarker]
    metrics: RunMetrics


class ScenarioSpawn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    callsign: str
    aircraft_type: str = "B738"
    spawn_time_ms: int = 0
    role: Literal["arrival", "departure", "surface"] = "surface"
    initial_phase: FlightPhase = "taxi_out"
    position: Point
    heading_deg: float = 90.0
    speed_kts: float = 15.0
    target_speed_kts: float = 15.0
    altitude_ft: float = 0.0
    assigned_runway: str | None = None
    route: list[Point] = Field(default_factory=list)
    hold_short_of: str | None = None
    cleared_to_cross: list[str] = Field(default_factory=list)
    cleared_takeoff: bool = False
    cleared_land: bool = False


class ScenarioTrigger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    time_ms: int
    callsign: str
    action: Literal[
        "hold_position",
        "resume_taxi",
        "cross_runway",
        "line_up_and_wait",
        "cleared_takeoff",
        "cleared_land",
        "go_around",
        "disregard_hold_short",
    ]
    runway: str | None = None
    target_speed_kts: float | None = None
    note: str = ""


class ScenarioSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str
    airport_id: str = "genfield"
    duration_ms: int = 120_000
    default_seed: int = 42
    spawns: list[ScenarioSpawn]
    triggers: list[ScenarioTrigger] = Field(default_factory=list)


class ScenarioSummary(_Frozen):
    id: str
    name: str
    description: str
    airport_id: str
    duration_ms: int
    default_seed: int
    aircraft_count: int
    trigger_count: int


class ComparisonResult(_Frozen):
    scenario_id: str
    airport_id: str
    seed: int
    primary_controller: str
    secondary_controller: str
    primary_metrics: RunMetrics
    secondary_metrics: RunMetrics
    primary_markers: list[TimelineMarker]
    secondary_markers: list[TimelineMarker]
