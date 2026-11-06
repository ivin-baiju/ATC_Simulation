"""Deterministic airport surface & terminal simulation engine.

Runs a scenario on an :class:`Airport` using :class:`SimClock` and :class:`RngStreams`,
producing pre-computed :class:`SimFrame` snapshots at 1-second intervals (10 ticks of 100 ms)
for instant timeline scrubbing, step-by-step playback, and side-by-side controller comparison.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field
from typing import Literal

from ..airport import Airport, geo
from ..clock import RngStreams, SimClock
from .models import (
    AircraftState,
    AlertSeverity,
    CommEntry,
    ComparisonResult,
    ControllerDecision,
    FlightPhase,
    MetricPoint,
    Point,
    RunMetrics,
    ScenarioSpec,
    ScenarioTrigger,
    SimAlert,
    SimFrame,
    TimelineMarker,
)

KTS_TO_MPS = 0.514444
FRAME_INTERVAL_MS = 1000
DT_MS = 100

ControllerKind = Literal["proactive_ai", "baseline_rule"]


@dataclass
class _MutableAircraft:
    callsign: str
    aircraft_type: str
    role: Literal["arrival", "departure", "surface"]
    phase: FlightPhase
    position: Point
    heading_deg: float
    speed_kts: float
    target_speed_kts: float
    altitude_ft: float
    vertical_speed_fpm: float
    assigned_runway: str | None
    route: list[Point]
    hold_short_of: str | None
    cleared_to_cross: list[str] = field(default_factory=list)
    cleared_takeoff: bool = False
    cleared_land: bool = False
    disregarded_hold: bool = False
    separation_ring_m: float = 150.0
    alert_severity: AlertSeverity | None = None
    delay_accum_s: float = 0.0
    completed: bool = False


def _predict_trajectory(ac: _MutableAircraft, horizon_s: int = 20, step_s: int = 4) -> list[Point]:
    if ac.speed_kts < 1.0 or ac.phase in ("holding_short", "parked"):
        return [ac.position]
    pts: list[Point] = [ac.position]
    curr = ac.position
    rem_route = list(ac.route)
    hdg = ac.heading_deg
    spd_mps = ac.speed_kts * KTS_TO_MPS
    for _ in range(step_s, horizon_s + 1, step_s):
        dist = spd_mps * step_s
        while rem_route and dist > 0:
            wp = rem_route[0]
            d = geo.distance(curr, wp)
            if d <= dist:
                curr = wp
                dist -= d
                rem_route.pop(0)
                if rem_route:
                    hdg = geo.bearing_deg(curr, rem_route[0])
            else:
                hdg = geo.bearing_deg(curr, wp)
                vec = geo.heading_vector(hdg)
                curr = (round(curr[0] + vec[0] * dist, 2), round(curr[1] + vec[1] * dist, 2))
                dist = 0.0
        if not rem_route and dist > 0:
            vec = geo.heading_vector(hdg)
            curr = (round(curr[0] + vec[0] * dist, 2), round(curr[1] + vec[1] * dist, 2))
        pts.append(curr)
    return pts


def _on_runway(pos: Point, airport: Airport, margin_m: float = 40.0) -> str | None:
    for rwy in airport.runways:
        d = geo.point_segment_distance(pos, *rwy.centerline)
        if d <= rwy.width_m / 2.0 + margin_m:
            return rwy.id
    return None


def _approaching_runway_distance(pos: Point, airport: Airport, runway_id: str) -> float:
    rwy = airport.runway(runway_id)
    return geo.point_segment_distance(pos, *rwy.centerline)


def simulate_run(
    airport: Airport,
    scenario: ScenarioSpec,
    controller: ControllerKind = "proactive_ai",
    seed: int | None = None,
) -> list[SimFrame]:
    actual_seed = seed if seed is not None else scenario.default_seed
    run_id = f"{scenario.id}:{controller}:{actual_seed}"
    clock = SimClock(dt_ms=DT_MS, start_ms=0)
    rng = RngStreams(actual_seed)

    active: dict[str, _MutableAircraft] = {}
    alerts: list[SimAlert] = []
    comms: list[CommEntry] = []
    decisions: list[ControllerDecision] = []
    markers: list[TimelineMarker] = []
    metric_series: list[MetricPoint] = []
    seen_alert_keys: set[str] = set()
    issued_intervention_keys: set[str] = set()
    near_miss_pairs: set[tuple[str, str]] = set()
    safety_filter_count = 0
    global_min_sep = 9999.0

    # Schedule spawns
    for sp in scenario.spawns:

        def _do_spawn(c: SimClock, s: ScenarioSpec = scenario, spawn_spec=sp) -> None:  # type: ignore[no-untyped-def]
            jitter = (rng.get("spawn").random() - 0.5) * 0.4
            spd = max(0.0, spawn_spec.speed_kts + jitter if spawn_spec.speed_kts > 0 else 0.0)
            ring = (
                220.0
                if spawn_spec.initial_phase in ("final_approach", "takeoff_roll", "departing")
                else 130.0
            )
            active[spawn_spec.callsign] = _MutableAircraft(
                callsign=spawn_spec.callsign,
                aircraft_type=spawn_spec.aircraft_type,
                role=spawn_spec.role,
                phase=spawn_spec.initial_phase,
                position=spawn_spec.position,
                heading_deg=spawn_spec.heading_deg,
                speed_kts=round(spd, 1),
                target_speed_kts=spawn_spec.target_speed_kts,
                altitude_ft=spawn_spec.altitude_ft,
                vertical_speed_fpm=-650.0 if spawn_spec.initial_phase == "final_approach" else 0.0,
                assigned_runway=spawn_spec.assigned_runway,
                route=list(spawn_spec.route),
                hold_short_of=spawn_spec.hold_short_of,
                cleared_to_cross=list(spawn_spec.cleared_to_cross),
                cleared_takeoff=spawn_spec.cleared_takeoff,
                cleared_land=spawn_spec.cleared_land,
                separation_ring_m=ring,
            )
            if spawn_spec.cleared_takeoff and spawn_spec.assigned_runway:
                msg = (
                    f"{spawn_spec.callsign}, Runway {spawn_spec.assigned_runway}, "
                    "cleared for takeoff."
                )
                comms.append(
                    CommEntry(
                        id=f"comm-{len(comms) + 1}",
                        time_ms=c.now_ms,
                        speaker="ATC",
                        callsign=spawn_spec.callsign,
                        transmission=msg,
                        instruction_kind="cleared_takeoff",
                    )
                )

        clock.schedule_at(sp.spawn_time_ms, _do_spawn, name=f"spawn:{sp.callsign}", priority=-10)

    # Schedule scenario triggers
    for trig in scenario.triggers:

        def _do_trigger(c: SimClock, t: ScenarioTrigger = trig) -> None:
            ac = active.get(t.callsign)
            if ac is None:
                return
            _apply_trigger(
                c.now_ms,
                ac,
                t,
                active,
                airport,
                controller,
                comms,
                decisions,
                markers,
            )

        clock.schedule_at(trig.time_ms, _do_trigger, name=f"trig:{trig.id}", priority=0)

    frames: list[SimFrame] = []
    clock.start()

    total_ticks = scenario.duration_ms // DT_MS
    for tick_idx in range(total_ticks + 1):
        now_ms = clock.now_ms

        # Advance aircraft kinematics when tick > 0
        if tick_idx > 0:
            clock.step(1)
            now_ms = clock.now_ms
            _step_kinematics(active, airport, DT_MS / 1000.0)

        # Evaluate conflicts, controller decisions, and metrics at 1-second boundaries
        if now_ms % FRAME_INTERVAL_MS == 0:
            step_res = _evaluate_safety_and_controller(
                now_ms=now_ms,
                active=active,
                airport=airport,
                controller=controller,
                rng=rng,
                alerts=alerts,
                comms=comms,
                decisions=decisions,
                markers=markers,
                seen_alert_keys=seen_alert_keys,
                issued_intervention_keys=issued_intervention_keys,
                near_miss_pairs=near_miss_pairs,
            )
            safety_filter_count += int(step_res["safety_interventions"])
            min_sep = float(step_res["min_sep_m"])
            if min_sep < global_min_sep:
                global_min_sep = min_sep

            throughput = sum(1 for a in active.values() if a.completed)
            metric_series.append(
                MetricPoint(
                    time_ms=now_ms,
                    min_separation_m=round(min_sep if min_sep < 9000 else 1200.0, 1),
                    active_conflicts=int(step_res["active_conflicts"]),
                    cumulative_alerts=len(alerts),
                    throughput=throughput,
                )
            )

            warn_cnt = sum(1 for a in alerts if a.severity == "warning")
            caut_cnt = sum(1 for a in alerts if a.severity == "caution")
            adv_cnt = sum(1 for a in alerts if a.severity == "advisory")
            avg_delay = sum(a.delay_accum_s for a in active.values()) / max(1, len(active))

            run_metrics = RunMetrics(
                duration_ms=scenario.duration_ms,
                min_separation_m=round(global_min_sep if global_min_sep < 9000 else 1200.0, 1),
                total_alerts=len(alerts),
                warning_alerts=warn_cnt,
                caution_alerts=caut_cnt,
                advisory_alerts=adv_cnt,
                near_miss_count=len(near_miss_pairs),
                instructions_issued=len(decisions),
                safety_filter_interventions=safety_filter_count,
                throughput_completed=throughput,
                avg_taxi_delay_s=round(avg_delay, 1),
                series=list(metric_series),
            )

            ac_snapshots = [
                AircraftState(
                    callsign=a.callsign,
                    aircraft_type=a.aircraft_type,
                    role=a.role,
                    phase=a.phase,
                    position=(round(a.position[0], 2), round(a.position[1], 2)),
                    heading_deg=round(a.heading_deg % 360.0, 1),
                    speed_kts=round(a.speed_kts, 1),
                    target_speed_kts=round(a.target_speed_kts, 1),
                    altitude_ft=round(a.altitude_ft, 0),
                    vertical_speed_fpm=round(a.vertical_speed_fpm, 0),
                    assigned_runway=a.assigned_runway,
                    route=list(a.route),
                    hold_short_of=a.hold_short_of,
                    cleared_to_cross=list(a.cleared_to_cross),
                    cleared_takeoff=a.cleared_takeoff,
                    cleared_land=a.cleared_land,
                    separation_ring_m=a.separation_ring_m,
                    predicted_trajectory=_predict_trajectory(a),
                    alert_severity=a.alert_severity,
                )
                for a in active.values()
            ]

            frames.append(
                SimFrame(
                    run_id=run_id,
                    scenario_id=scenario.id,
                    airport_id=airport.id,
                    controller=controller,
                    seed=actual_seed,
                    tick=clock.tick,
                    time_ms=now_ms,
                    duration_ms=scenario.duration_ms,
                    aircraft=ac_snapshots,
                    alerts=list(alerts),
                    comms=list(comms),
                    decisions=list(decisions),
                    markers=list(markers),
                    metrics=run_metrics,
                )
            )

    return frames


def compare_controllers(
    airport: Airport,
    scenario: ScenarioSpec,
    seed: int | None = None,
    primary: ControllerKind = "proactive_ai",
    secondary: ControllerKind = "baseline_rule",
) -> ComparisonResult:
    actual_seed = seed if seed is not None else scenario.default_seed
    frames_primary = simulate_run(airport, scenario, controller=primary, seed=actual_seed)
    frames_secondary = simulate_run(airport, scenario, controller=secondary, seed=actual_seed)
    last_p = frames_primary[-1]
    last_s = frames_secondary[-1]
    return ComparisonResult(
        scenario_id=scenario.id,
        airport_id=airport.id,
        seed=actual_seed,
        primary_controller=primary,
        secondary_controller=secondary,
        primary_metrics=last_p.metrics,
        secondary_metrics=last_s.metrics,
        primary_markers=last_p.markers,
        secondary_markers=last_s.markers,
    )


def _apply_trigger(
    now_ms: int,
    ac: _MutableAircraft,
    trig: ScenarioTrigger,
    active: dict[str, _MutableAircraft],
    airport: Airport,
    controller: ControllerKind,
    comms: list[CommEntry],
    decisions: list[ControllerDecision],
    markers: list[TimelineMarker],
) -> None:
    if trig.action == "hold_position":
        ac.target_speed_kts = 0.0
        ac.phase = "holding_short"
        comms.append(
            CommEntry(
                id=f"comm-{len(comms) + 1}",
                time_ms=now_ms,
                speaker="ATC",
                callsign=ac.callsign,
                transmission=f"{ac.callsign}, hold position. {trig.note}".strip(),
                instruction_kind="hold_position",
            )
        )
        decisions.append(
            ControllerDecision(
                id=f"dec-{len(decisions) + 1}",
                time_ms=now_ms,
                controller=controller,
                callsign=ac.callsign,
                instruction="HOLD POSITION",
                reason=trig.note or "Sequencing traffic at taxiway intersection",
                confidence=0.96,
                safety_filter_status="passed",
                safety_filter_note="Verified zero runway intrusion risk",
            )
        )
        markers.append(
            TimelineMarker(
                id=f"mkr-{len(markers) + 1}",
                time_ms=now_ms,
                kind="instruction",
                severity="advisory",
                label=f"{ac.callsign} HOLD POSITION",
                callsigns=[ac.callsign],
            )
        )
    elif trig.action == "resume_taxi":
        ac.target_speed_kts = trig.target_speed_kts or 18.0
        ac.phase = "taxi_out"
        comms.append(
            CommEntry(
                id=f"comm-{len(comms) + 1}",
                time_ms=now_ms,
                speaker="ATC",
                callsign=ac.callsign,
                transmission=f"{ac.callsign}, continue taxi.",
                instruction_kind="resume_taxi",
            )
        )
    elif trig.action == "disregard_hold_short":
        ac.disregarded_hold = True
        ac.hold_short_of = None
        ac.phase = "taxi_out"
        ac.target_speed_kts = max(ac.target_speed_kts, 18.0)
        rwy_str = trig.runway or ac.assigned_runway
        comms.append(
            CommEntry(
                id=f"comm-{len(comms) + 1}",
                time_ms=now_ms,
                speaker="PILOT",
                callsign=ac.callsign,
                transmission=f"Tower, {ac.callsign} crossing Runway {rwy_str}.",
                instruction_kind="unauthorized_crossing",
            )
        )
    elif trig.action == "cross_runway" and trig.runway:
        # Check if any aircraft is active on or assigned to trig.runway
        busy = any(
            other.callsign != ac.callsign
            and (
                other.assigned_runway == trig.runway
                or _on_runway(other.position, airport, margin_m=80.0) == trig.runway
            )
            and other.phase
            in ("final_approach", "takeoff_roll", "landing_roll", "lined_up", "go_around")
            for other in active.values()
        )
        if busy and controller == "proactive_ai":
            # Safety filter vetoes unsafe runway crossing clearance
            ac.target_speed_kts = 0.0
            ac.phase = "holding_short"
            ac.hold_short_of = trig.runway
            veto_reason = (
                f"Safety filter vetoed crossing {trig.runway}: arrival/departure active on runway"
            )
            veto_note = f"Blocked CROSS {trig.runway}; enforced HOLD SHORT {trig.runway}"
            decisions.append(
                ControllerDecision(
                    id=f"dec-{len(decisions) + 1}",
                    time_ms=now_ms,
                    controller=controller,
                    callsign=ac.callsign,
                    instruction=f"HOLD SHORT RWY {trig.runway}",
                    reason=veto_reason,
                    confidence=0.99,
                    safety_filter_status="vetoed",
                    safety_filter_note=veto_note,
                )
            )
            neg_msg = (
                f"{ac.callsign}, negative crossing, hold short Runway {trig.runway} "
                "for landing traffic."
            )
            comms.append(
                CommEntry(
                    id=f"comm-{len(comms) + 1}",
                    time_ms=now_ms,
                    speaker="ATC",
                    callsign=ac.callsign,
                    transmission=neg_msg,
                    instruction_kind="hold_short",
                )
            )
            markers.append(
                TimelineMarker(
                    id=f"mkr-{len(markers) + 1}",
                    time_ms=now_ms,
                    kind="instruction",
                    severity="caution",
                    label=f"Safety veto: {ac.callsign} hold short {trig.runway}",
                    callsigns=[ac.callsign],
                )
            )
        else:
            ac.cleared_to_cross.append(trig.runway)
            ac.hold_short_of = None
            ac.phase = "taxi_out"
            ac.target_speed_kts = 18.0
            decisions.append(
                ControllerDecision(
                    id=f"dec-{len(decisions) + 1}",
                    time_ms=now_ms,
                    controller=controller,
                    callsign=ac.callsign,
                    instruction=f"CROSS RWY {trig.runway}",
                    reason=trig.note or f"Cleared to cross {trig.runway}",
                    confidence=0.74,
                    safety_filter_status="passed",
                    safety_filter_note="Rule baseline permitted crossing",
                )
            )
    elif trig.action == "cleared_takeoff":
        ac.cleared_takeoff = True
        ac.phase = "takeoff_roll"
        ac.target_speed_kts = 150.0


def _step_kinematics(active: dict[str, _MutableAircraft], airport: Airport, dt_s: float) -> None:
    for ac in active.values():
        # Check automatic hold-short stop if aircraft has not disregarded hold-short
        if (
            ac.hold_short_of
            and not ac.disregarded_hold
            and ac.hold_short_of not in ac.cleared_to_cross
        ):
            dist_to_rwy = _approaching_runway_distance(ac.position, airport, ac.hold_short_of)
            if dist_to_rwy <= 95.0 and ac.phase == "taxi_out":
                ac.phase = "holding_short"
                ac.target_speed_kts = 0.0
                ac.speed_kts = 0.0

        # Takeoff transition from lined_up
        if ac.phase == "lined_up" and ac.cleared_takeoff:
            ac.phase = "takeoff_roll"
            ac.target_speed_kts = 150.0
            ac.separation_ring_m = 220.0

        # Accelerate/decelerate toward target_speed_kts
        accel_kts_per_s = 12.0 if ac.phase in ("takeoff_roll", "landing_roll", "go_around") else 6.0
        if ac.speed_kts < ac.target_speed_kts:
            ac.speed_kts = min(ac.target_speed_kts, ac.speed_kts + accel_kts_per_s * dt_s)
        elif ac.speed_kts > ac.target_speed_kts:
            ac.speed_kts = max(ac.target_speed_kts, ac.speed_kts - accel_kts_per_s * 1.6 * dt_s)

        if ac.speed_kts < 2.0 and ac.phase in ("taxi_out", "holding_short"):
            ac.delay_accum_s += dt_s

        # Move along route waypoints
        step_m = ac.speed_kts * KTS_TO_MPS * dt_s
        while ac.route and step_m > 0:
            wp = ac.route[0]
            d = geo.distance(ac.position, wp)
            if d <= step_m:
                ac.position = wp
                step_m -= d
                ac.route.pop(0)
                if ac.route:
                    ac.heading_deg = geo.bearing_deg(ac.position, ac.route[0])
            else:
                ac.heading_deg = geo.bearing_deg(ac.position, wp)
                vec = geo.heading_vector(ac.heading_deg)
                ac.position = (
                    ac.position[0] + vec[0] * step_m,
                    ac.position[1] + vec[1] * step_m,
                )
                step_m = 0.0

        if not ac.route and step_m > 0:
            vec = geo.heading_vector(ac.heading_deg)
            ac.position = (
                ac.position[0] + vec[0] * step_m,
                ac.position[1] + vec[1] * step_m,
            )

        # Altitude updates
        if ac.phase == "final_approach":
            ac.altitude_ft = max(
                airport.reference.elevation_ft,
                ac.altitude_ft + (ac.vertical_speed_fpm / 60.0) * dt_s,
            )
            if ac.altitude_ft <= airport.reference.elevation_ft + 5.0:
                ac.phase = "landing_roll"
                ac.vertical_speed_fpm = 0.0
                ac.target_speed_kts = 25.0
        elif ac.phase == "takeoff_roll" and ac.speed_kts >= 135.0:
            ac.phase = "departing"
            ac.vertical_speed_fpm = 1800.0
        elif ac.phase in ("departing", "go_around"):
            ac.altitude_ft += (ac.vertical_speed_fpm / 60.0) * dt_s

        if ac.phase == "departing" and ac.altitude_ft >= 1200.0:
            ac.completed = True
        if ac.phase == "landing_roll" and ac.speed_kts <= 30.0:
            ac.completed = True


def _evaluate_safety_and_controller(
    *,
    now_ms: int,
    active: dict[str, _MutableAircraft],
    airport: Airport,
    controller: ControllerKind,
    rng: RngStreams,
    alerts: list[SimAlert],
    comms: list[CommEntry],
    decisions: list[ControllerDecision],
    markers: list[TimelineMarker],
    seen_alert_keys: set[str],
    issued_intervention_keys: set[str],
    near_miss_pairs: set[tuple[str, str]],
) -> dict[str, int | float]:
    for a in active.values():
        a.alert_severity = None

    min_sep_m = 9999.0
    active_conflicts = 0
    safety_interventions = 0

    ac_list = list(active.values())
    for a, b in itertools.combinations(ac_list, 2):
        d = geo.distance(a.position, b.position)
        if d < min_sep_m:
            min_sep_m = d

        pair_key = (min(a.callsign, b.callsign), max(a.callsign, b.callsign))
        rwy_a = _on_runway(a.position, airport, margin_m=65.0)
        rwy_b = _on_runway(b.position, airport, margin_m=65.0)

        # Check runway incursion / conflict
        either_surface_incursion = a.disregarded_hold or b.disregarded_hold
        same_or_crossing_rwy = (
            (rwy_a is not None and rwy_a == rwy_b)
            or (
                a.assigned_runway is not None
                and a.assigned_runway == rwy_b
                and a.phase in ("takeoff_roll", "final_approach", "landing_roll", "lined_up")
            )
            or (
                b.assigned_runway is not None
                and b.assigned_runway == rwy_a
                and b.phase in ("takeoff_roll", "final_approach", "landing_roll", "lined_up")
            )
            or (
                either_surface_incursion
                and (
                    a.phase in ("takeoff_roll", "final_approach", "landing_roll", "lined_up")
                    or b.phase in ("takeoff_roll", "final_approach", "landing_roll", "lined_up")
                )
            )
            or (
                a.assigned_runway is not None
                and b.assigned_runway is not None
                and a.assigned_runway != b.assigned_runway
                and a.phase in ("takeoff_roll", "final_approach", "landing_roll")
                and b.phase in ("takeoff_roll", "final_approach", "landing_roll")
            )
        )

        if same_or_crossing_rwy and d < 1750.0:
            sev: AlertSeverity = "warning" if d < 1150.0 else "caution"
            active_conflicts += 1
            a.alert_severity = _max_sev(a.alert_severity, sev)
            b.alert_severity = _max_sev(b.alert_severity, sev)

            conflict_rwy = rwy_a or rwy_b or a.assigned_runway or b.assigned_runway or "09/27"
            alert_key = f"rwy:{pair_key[0]}:{pair_key[1]}:{sev}"
            if alert_key not in seen_alert_keys:
                seen_alert_keys.add(alert_key)
                kind: Literal["runway_incursion", "crossing_conflict"] = (
                    "runway_incursion"
                    if (a.disregarded_hold or b.disregarded_hold)
                    else "crossing_conflict"
                )
                alert_msg = (
                    f"{a.callsign} and {b.callsign} converging on "
                    f"Runway {conflict_rwy} ({round(d)} m)."
                )
                alerts.append(
                    SimAlert(
                        id=f"alt-{len(alerts) + 1}",
                        time_ms=now_ms,
                        severity=sev,
                        kind=kind,
                        title=f"{sev.upper()}: Runway {conflict_rwy} Conflict",
                        message=alert_msg,
                        involved=[a.callsign, b.callsign],
                        runway=conflict_rwy,
                        separation_m=round(d, 1),
                    )
                )
                markers.append(
                    TimelineMarker(
                        id=f"mkr-{len(markers) + 1}",
                        time_ms=now_ms,
                        kind="detection",
                        severity=sev,
                        label=f"{sev.upper()}: {a.callsign} / {b.callsign} ({round(d)} m)",
                        callsigns=[a.callsign, b.callsign],
                    )
                )

            # Controller reaction: proactive_ai intervenes earlier (at caution/1650m),
            # whereas baseline_rule reacts only once separation drops below 720m.
            threshold_m = 1650.0 if controller == "proactive_ai" else 720.0
            int_key = f"int:{pair_key[0]}:{pair_key[1]}"
            if d <= threshold_m and int_key not in issued_intervention_keys:
                issued_intervention_keys.add(int_key)
                safety_interventions += 1
                _issue_conflict_resolution(
                    now_ms=now_ms,
                    a=a,
                    b=b,
                    conflict_rwy=conflict_rwy,
                    dist_m=d,
                    controller=controller,
                    rng=rng,
                    comms=comms,
                    decisions=decisions,
                    markers=markers,
                )

        elif d < 280.0:
            sev2: AlertSeverity = "warning" if d < 160.0 else "caution"
            active_conflicts += 1
            a.alert_severity = _max_sev(a.alert_severity, sev2)
            b.alert_severity = _max_sev(b.alert_severity, sev2)
            alert_key2 = f"sep:{pair_key[0]}:{pair_key[1]}:{sev2}"
            if alert_key2 not in seen_alert_keys:
                seen_alert_keys.add(alert_key2)
                alerts.append(
                    SimAlert(
                        id=f"alt-{len(alerts) + 1}",
                        time_ms=now_ms,
                        severity=sev2,
                        kind="loss_of_separation",
                        title=f"{sev2.upper()}: Surface Proximity",
                        message=f"{a.callsign} and {b.callsign} separation {round(d)} m.",
                        involved=[a.callsign, b.callsign],
                        separation_m=round(d, 1),
                    )
                )

        if d < 220.0 and pair_key not in near_miss_pairs:
            near_miss_pairs.add(pair_key)
            markers.append(
                TimelineMarker(
                    id=f"mkr-{len(markers) + 1}",
                    time_ms=now_ms,
                    kind="near_miss",
                    severity="warning",
                    label=f"NEAR MISS: {a.callsign} & {b.callsign} ({round(d)} m)",
                    callsigns=[a.callsign, b.callsign],
                )
            )

    return {
        "min_sep_m": min_sep_m if ac_list else 1200.0,
        "active_conflicts": active_conflicts,
        "safety_interventions": safety_interventions,
    }


def _issue_conflict_resolution(
    *,
    now_ms: int,
    a: _MutableAircraft,
    b: _MutableAircraft,
    conflict_rwy: str,
    dist_m: float,
    controller: ControllerKind,
    rng: RngStreams,
    comms: list[CommEntry],
    decisions: list[ControllerDecision],
    markers: list[TimelineMarker],
) -> None:
    # Prefer stopping encroaching surface traffic first before cancelling an approach
    surface_stopped = False
    for target, other in ((a, b), (b, a)):
        if target.phase == "taxi_out" or (
            target.phase == "takeoff_roll" and target.speed_kts < 85.0
        ):
            was_takeoff = target.phase == "takeoff_roll"
            target.target_speed_kts = 0.0
            target.phase = "holding_short"
            surface_stopped = True
            conf = round(0.92 + rng.get("ctrl").random() * 0.07, 2)
            instr = (
                f"STOP IMMEDIATELY / CANCEL TAKEOFF RWY {conflict_rwy}"
                if was_takeoff
                else f"HOLD POSITION IMMEDIATELY (RWY {conflict_rwy})"
            )
            stop_reason = (
                f"Runway {conflict_rwy} conflict with {other.callsign} at {round(dist_m)} m"
            )
            decisions.append(
                ControllerDecision(
                    id=f"dec-{len(decisions) + 1}",
                    time_ms=now_ms,
                    controller=controller,
                    callsign=target.callsign,
                    instruction=instr,
                    reason=stop_reason,
                    confidence=conf,
                    safety_filter_status="modified" if controller == "proactive_ai" else "passed",
                    safety_filter_note="Safety envelope override: positive stop command issued",
                )
            )
            stop_tx = f"{target.callsign}, STOP IMMEDIATELY, traffic on Runway {conflict_rwy}!"
            comms.append(
                CommEntry(
                    id=f"comm-{len(comms) + 1}",
                    time_ms=now_ms,
                    speaker="ATC",
                    callsign=target.callsign,
                    transmission=stop_tx,
                    instruction_kind="stop_immediately",
                )
            )
            markers.append(
                TimelineMarker(
                    id=f"mkr-{len(markers) + 1}",
                    time_ms=now_ms,
                    kind="instruction",
                    severity="warning",
                    label=f"ATC -> {target.callsign}: STOP IMMEDIATELY",
                    callsigns=[target.callsign, other.callsign],
                )
            )

    if surface_stopped and dist_m > 950.0:
        return

    for target, other in ((a, b), (b, a)):
        if target.phase == "final_approach":
            target.phase = "go_around"
            target.vertical_speed_fpm = 1800.0
            target.target_speed_kts = 155.0
            conf = round(0.94 + rng.get("ctrl").random() * 0.05, 2)
            ga_reason = (
                f"Intersecting traffic {other.callsign} occupying/converging on "
                f"Runway {conflict_rwy}"
            )
            decisions.append(
                ControllerDecision(
                    id=f"dec-{len(decisions) + 1}",
                    time_ms=now_ms,
                    controller=controller,
                    callsign=target.callsign,
                    instruction=f"GO AROUND RWY {conflict_rwy}",
                    reason=ga_reason,
                    confidence=conf,
                    safety_filter_status="passed",
                    safety_filter_note="Missed approach climb gradient verified clear",
                )
            )
            ga_tx = (
                f"{target.callsign}, go around, climb and maintain 3,000 feet, traffic on runway."
            )
            comms.append(
                CommEntry(
                    id=f"comm-{len(comms) + 1}",
                    time_ms=now_ms,
                    speaker="ATC",
                    callsign=target.callsign,
                    transmission=ga_tx,
                    instruction_kind="go_around",
                )
            )
            markers.append(
                TimelineMarker(
                    id=f"mkr-{len(markers) + 1}",
                    time_ms=now_ms,
                    kind="instruction",
                    severity="warning",
                    label=f"ATC -> {target.callsign}: GO AROUND",
                    callsigns=[target.callsign, other.callsign],
                )
            )


def _max_sev(a: AlertSeverity | None, b: AlertSeverity) -> AlertSeverity:
    rank = {None: 0, "advisory": 1, "caution": 2, "warning": 3}
    return b if rank[b] >= rank[a] else (a or b)
