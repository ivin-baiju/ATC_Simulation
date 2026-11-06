import type { SimFrame, ControllerKind, SimAlert } from "../api/types";
import { embeddedScenarioSpecs } from "./embeddedData";

export function generateOfflineSimFrames(
  scenarioId: string,
  controller: ControllerKind,
  seed: number = 42
): SimFrame[] {
  const spec = embeddedScenarioSpecs[scenarioId] ?? embeddedScenarioSpecs["crossing_runways_incursion"];
  const durationMs = spec?.duration_ms ?? 60000;
  const dtMs = 1000;
  const frames: SimFrame[] = [];
  const totalTicks = Math.floor(durationMs / dtMs);

  for (let tick = 0; tick <= totalTicks; tick++) {
    const timeMs = tick * dtMs;
    const progress = timeMs / durationMs;

    const aircraft = (spec?.spawns ?? []).map((s) => {
      const startX = s.position[0];
      const startY = s.position[1];
      const targetPoint = s.route?.[0] ?? [startX + 1000, startY + 1000];
      const curX = startX + (targetPoint[0] - startX) * progress;
      const curY = startY + (targetPoint[1] - startY) * progress;

      return {
        callsign: s.callsign,
        aircraft_type: s.aircraft_type,
        role: s.role,
        phase: s.initial_phase,
        position: [Math.round(curX * 10) / 10, Math.round(curY * 10) / 10] as [number, number],
        heading_deg: s.heading_deg,
        speed_kts: s.speed_kts,
        target_speed_kts: s.target_speed_kts,
        altitude_ft: s.altitude_ft,
        vertical_speed_fpm: 0,
        assigned_runway: s.assigned_runway,
        route: s.route,
        hold_short_of: s.hold_short_of,
        cleared_to_cross: s.cleared_to_cross,
        cleared_takeoff: s.cleared_takeoff,
        cleared_land: s.cleared_land,
        separation_ring_m: 130.0,
        predicted_trajectory: [
          [curX, curY] as [number, number],
          [curX + 300, curY + 300] as [number, number],
        ],
        alert_severity: null as SimAlert["severity"] | null,
      };
    });

    frames.push({
      run_id: `offline_${scenarioId}_${controller}_${seed}`,
      scenario_id: scenarioId,
      airport_id: spec?.airport_id ?? "vidp",
      controller,
      seed,
      tick,
      time_ms: timeMs,
      duration_ms: durationMs,
      aircraft,
      alerts: [],
      comms: [
        {
          id: `c_${tick}`,
          time_ms: timeMs,
          speaker: "ATC",
          callsign: "ALL",
          transmission: `Radar contact standard terminal separation active. Tick ${tick}.`,
          instruction_kind: null,
        },
      ],
      decisions: [],
      markers: [],
      metrics: {
        duration_ms: durationMs,
        min_separation_m: 450,
        total_alerts: 1,
        warning_alerts: 0,
        caution_alerts: 1,
        advisory_alerts: 0,
        near_miss_count: 0,
        instructions_issued: 3,
        safety_filter_interventions: 1,
        throughput_completed: 2,
        avg_taxi_delay_s: 4.2,
        series: [
          {
            time_ms: timeMs,
            min_separation_m: 450,
            active_conflicts: 0,
            cumulative_alerts: 1,
            throughput: 2,
          },
        ],
      },
    });
  }

  return frames;
}
