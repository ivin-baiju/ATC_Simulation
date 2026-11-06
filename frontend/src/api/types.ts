/** Mirrors backend/atc_sim/airport/models.py and backend/atc_sim/sim/models.py. */
export type Point = [number, number];

export interface Bounds {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

export interface RunwayEnd {
  designator: string;
  threshold: Point;
  heading_deg: number;
}

export interface Runway {
  id: string;
  ends: [RunwayEnd, RunwayEnd];
  width_m: number;
  length_m: number;
  centerline: [Point, Point];
  polygon: Point[];
}

export interface Taxiway {
  id: string;
  name: string;
  width_m: number;
  centerline: Point[];
}

export interface Apron {
  id: string;
  name: string;
  polygon: Point[];
}

export interface Gate {
  id: string;
  name: string;
  position: Point;
  heading_deg: number;
}

export interface HoldShort {
  id: string;
  runway: string;
  taxiway: string;
  line: [Point, Point];
}

export interface Fix {
  id: string;
  name: string;
  role: "arrival" | "departure";
  position: Point;
  altitude_ft: number | null;
}

export interface Airport {
  id: string;
  icao: string;
  name: string;
  fictional: boolean;
  coordinate_system: "local-enu-m";
  reference: { lat: number; lon: number; elevation_ft: number };
  magnetic_variation_deg: number;
  runways: Runway[];
  taxiways: Taxiway[];
  aprons: Apron[];
  gates: Gate[];
  hold_shorts: HoldShort[];
  fixes: Fix[];
  bounds_surface: Bounds;
  bounds_all: Bounds;
}

export interface AirportSummary {
  id: string;
  icao: string;
  name: string;
  fictional: boolean;
  runways: string[];
  taxiway_count: number;
  gate_count: number;
  fix_count: number;
}

export interface Health {
  status: string;
  version: string;
  notice: string;
  airports: number;
  scenarios?: number;
}

export type FlightPhase =
  | "taxi_out"
  | "holding_short"
  | "lined_up"
  | "takeoff_roll"
  | "departing"
  | "final_approach"
  | "landing_roll"
  | "taxi_in"
  | "go_around"
  | "parked";

export type AlertSeverity = "advisory" | "caution" | "warning";

export type ControllerKind = "proactive_ai" | "baseline_rule";

export interface AircraftState {
  callsign: string;
  aircraft_type: string;
  role: "arrival" | "departure" | "surface";
  phase: FlightPhase;
  position: Point;
  heading_deg: number;
  speed_kts: number;
  target_speed_kts: number;
  altitude_ft: number;
  vertical_speed_fpm: number;
  assigned_runway: string | null;
  route: Point[];
  hold_short_of: string | null;
  cleared_to_cross: string[];
  cleared_takeoff: boolean;
  cleared_land: boolean;
  separation_ring_m: number;
  predicted_trajectory: Point[];
  alert_severity: AlertSeverity | null;
}

export interface SimAlert {
  id: string;
  time_ms: number;
  severity: AlertSeverity;
  kind: "runway_incursion" | "crossing_conflict" | "loss_of_separation" | "advisory";
  title: string;
  message: string;
  involved: string[];
  runway: string | null;
  separation_m: number | null;
}

export interface CommEntry {
  id: string;
  time_ms: number;
  speaker: "ATC" | "PILOT" | "SYSTEM";
  callsign: string;
  transmission: string;
  instruction_kind: string | null;
}

export interface ControllerDecision {
  id: string;
  time_ms: number;
  controller: string;
  callsign: string;
  instruction: string;
  reason: string;
  confidence: number;
  safety_filter_status: "passed" | "vetoed" | "modified";
  safety_filter_note: string;
}

export interface TimelineMarker {
  id: string;
  time_ms: number;
  kind: "detection" | "instruction" | "near_miss";
  severity: AlertSeverity | null;
  label: string;
  callsigns: string[];
}

export interface MetricPoint {
  time_ms: number;
  min_separation_m: number;
  active_conflicts: number;
  cumulative_alerts: number;
  throughput: number;
}

export interface RunMetrics {
  duration_ms: number;
  min_separation_m: number;
  total_alerts: number;
  warning_alerts: number;
  caution_alerts: number;
  advisory_alerts: number;
  near_miss_count: number;
  instructions_issued: number;
  safety_filter_interventions: number;
  throughput_completed: number;
  avg_taxi_delay_s: number;
  series: MetricPoint[];
}

export interface SimFrame {
  run_id: string;
  scenario_id: string;
  airport_id: string;
  controller: string;
  seed: number;
  tick: number;
  time_ms: number;
  duration_ms: number;
  aircraft: AircraftState[];
  alerts: SimAlert[];
  comms: CommEntry[];
  decisions: ControllerDecision[];
  markers: TimelineMarker[];
  metrics: RunMetrics;
}

export interface ScenarioSpawn {
  callsign: string;
  aircraft_type: string;
  spawn_time_ms: number;
  role: "arrival" | "departure" | "surface";
  initial_phase: FlightPhase;
  position: Point;
  heading_deg: number;
  speed_kts: number;
  target_speed_kts: number;
  altitude_ft: number;
  assigned_runway: string | null;
  route: Point[];
  hold_short_of: string | null;
  cleared_to_cross: string[];
  cleared_takeoff: boolean;
  cleared_land: boolean;
}

export interface ScenarioTrigger {
  id: string;
  time_ms: number;
  callsign: string;
  action:
    | "hold_position"
    | "resume_taxi"
    | "cross_runway"
    | "line_up_and_wait"
    | "cleared_takeoff"
    | "cleared_land"
    | "go_around"
    | "disregard_hold_short";
  runway: string | null;
  target_speed_kts: number | null;
  note: string;
}

export interface ScenarioSpec {
  id: string;
  name: string;
  description: string;
  airport_id: string;
  duration_ms: number;
  default_seed: number;
  spawns: ScenarioSpawn[];
  triggers: ScenarioTrigger[];
}

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  airport_id: string;
  duration_ms: number;
  default_seed: number;
  aircraft_count: number;
  trigger_count: number;
}

export interface LiveAircraftDetail {
  callsign: string;
  icao24: string;
  airline: string;
  operator_callsign: string;
  country: string;
  aircraft_type: string;
  state: AircraftState;
  live: boolean;
}

export interface LiveTrafficSnapshot {
  airport_id: string;
  icao: string;
  timestamp_s: number;
  source: string;
  aircraft_count: number;
  aircraft: LiveAircraftDetail[];
}

export interface ComparisonResult {
  scenario_id: string;
  airport_id: string;
  seed: number;
  primary_controller: string;
  secondary_controller: string;
  primary_metrics: RunMetrics;
  secondary_metrics: RunMetrics;
  primary_markers: TimelineMarker[];
  secondary_markers: TimelineMarker[];
}
