import { useEffect, useMemo, useState } from "react";
import { api } from "./api/client";
import type {
  Airport,
  AirportSummary,
  ComparisonResult,
  ControllerKind,
  Point,
  ScenarioSpawn,
  ScenarioSpec,
  ScenarioSummary,
  ScenarioTrigger,
  SimFrame,
} from "./api/types";
import {
  FALLBACK_COMPARISON,
  FALLBACK_FRAMES,
  FALLBACK_GENFIELD,
  FALLBACK_SCENARIOS,
  FALLBACK_SCENARIO_SPEC,
} from "./fallbackAirport";
import { DEFAULT_LAYERS, type LayerToggles } from "./radar/drawLayout";
import { RadarCanvas } from "./radar/RadarCanvas";
import { Aircraft3DViewer } from "./radar/Aircraft3DViewer";
import { lookupAircraftSpecs, lookupFlightRoute, lookupAirlineLivery } from "./radar/aircraftSpecs";
import { palette } from "./theme/palette";

export const SAFETY_NOTICE = "SIMULATION ONLY - NOT FOR OPERATIONAL USE";

const FALLBACK_AIRPORT_SUMMARIES: AirportSummary[] = [
  {
    id: FALLBACK_GENFIELD.id,
    icao: FALLBACK_GENFIELD.icao,
    name: FALLBACK_GENFIELD.name,
    fictional: true,
    runways: FALLBACK_GENFIELD.runways.map((r) => r.id),
    taxiway_count: FALLBACK_GENFIELD.taxiways.length,
    gate_count: FALLBACK_GENFIELD.gates.length,
    fix_count: FALLBACK_GENFIELD.fixes.length,
  },
];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function serializeScenarioToYaml(spec: ScenarioSpec): string {
  const lines: string[] = [
    `id: ${spec.id}`,
    `name: ${spec.name}`,
    `description: ${spec.description}`,
    `airport_id: ${spec.airport_id}`,
    `duration_ms: ${spec.duration_ms}`,
    `default_seed: ${spec.default_seed}`,
    `spawns:`,
  ];
  for (const sp of spec.spawns) {
    lines.push(
      `  - callsign: ${sp.callsign}`,
      `    aircraft_type: ${sp.aircraft_type}`,
      `    spawn_time_ms: ${sp.spawn_time_ms}`,
      `    role: ${sp.role}`,
      `    initial_phase: ${sp.initial_phase}`,
      `    position: [${sp.position[0]}, ${sp.position[1]}]`,
      `    heading_deg: ${sp.heading_deg}`,
      `    speed_kts: ${sp.speed_kts}`,
      `    target_speed_kts: ${sp.target_speed_kts}`,
      `    altitude_ft: ${sp.altitude_ft}`,
      `    assigned_runway: "${sp.assigned_runway ?? "09/27"}"`,
    );
  }
  lines.push(`triggers:`);
  for (const tr of spec.triggers) {
    lines.push(
      `  - id: ${tr.id}`,
      `    time_ms: ${tr.time_ms}`,
      `    callsign: ${tr.callsign}`,
      `    action: ${tr.action}`,
      `    runway: "${tr.runway ?? "09/27"}"`,
      `    note: ${tr.note}`,
    );
  }
  return lines.join("\n") + "\n";
}

function SeparationChart({
  primarySeries,
  secondarySeries,
  currentTimeMs,
}: {
  primarySeries: ReadonlyArray<{ time_ms: number; min_separation_m: number }>;
  secondarySeries?: ReadonlyArray<{ time_ms: number; min_separation_m: number }>;
  currentTimeMs: number;
}) {
  const w = 520;
  const h = 150;
  const padL = 42;
  const padR = 16;
  const padT = 14;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxTime = Math.max(
    1000,
    ...primarySeries.map((p) => p.time_ms),
    ...(secondarySeries?.map((p) => p.time_ms) ?? []),
  );
  const maxSep = 1300;

  const toXY = (t: number, sep: number): [number, number] => [
    padL + (t / maxTime) * plotW,
    padT + plotH - (Math.min(maxSep, Math.max(0, sep)) / maxSep) * plotH,
  ];

  const polyPoints = (series: ReadonlyArray<{ time_ms: number; min_separation_m: number }>) =>
    series.map((p) => toXY(p.time_ms, p.min_separation_m).join(",")).join(" ");

  const areaPoints = (series: ReadonlyArray<{ time_ms: number; min_separation_m: number }>) => {
    if (series.length === 0) return "";
    const first = toXY(series[0]!.time_ms, 0);
    const last = toXY(series[series.length - 1]!.time_ms, 0);
    return `${first.join(",")} ${polyPoints(series)} ${last.join(",")}`;
  };

  const cursorX = padL + (Math.min(maxTime, currentTimeMs) / maxTime) * plotW;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="Minimum aircraft separation over simulation time"
    >
      <rect x={padL} y={padT} width={plotW} height={plotH} fill={palette.white} stroke={palette.ink} strokeOpacity={0.12} />
      {primarySeries.length > 1 && (
        <polygon points={areaPoints(primarySeries)} fill={palette.aqua} fillOpacity={0.5} />
      )}
      {secondarySeries && secondarySeries.length > 1 && (
        <polyline
          fill="none"
          stroke={palette.ink}
          strokeWidth={2}
          strokeDasharray="4 3"
          points={polyPoints(secondarySeries)}
        />
      )}
      {primarySeries.length > 1 && (
        <polyline
          fill="none"
          stroke={palette.teal}
          strokeWidth={2.5}
          points={polyPoints(primarySeries)}
        />
      )}
      <line
        x1={cursorX}
        y1={padT}
        x2={cursorX}
        y2={padT + plotH}
        stroke={palette.ink}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <text x={6} y={padT + 10} fill={palette.ink} fontSize={10} fontWeight={600}>
        1300m
      </text>
      <text x={6} y={padT + plotH} fill={palette.ink} fontSize={10} fontWeight={600}>
        0m
      </text>
      <text x={padL} y={h - 6} fill={palette.ink} fontSize={10}>
        00:00
      </text>
      <text x={w - padR - 30} y={h - 6} fill={palette.ink} fontSize={10}>
        {formatTime(maxTime)}
      </text>
    </svg>
  );
}

export function App() {
  const [airports, setAirports] = useState<AirportSummary[]>(FALLBACK_AIRPORT_SUMMARIES);
  const [selectedAirportId, setSelectedAirportId] = useState<string>(FALLBACK_GENFIELD.id);
  const [airport, setAirport] = useState<Airport>(FALLBACK_GENFIELD);

  const [scenarios, setScenarios] = useState<ScenarioSummary[]>(FALLBACK_SCENARIOS);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    "crossing_runways_incursion",
  );
  const [scenarioSpec, setScenarioSpec] = useState<ScenarioSpec>(FALLBACK_SCENARIO_SPEC);

  const [controller, setController] = useState<ControllerKind>("proactive_ai");
  const seed = 42;
  const [frames, setFrames] = useState<SimFrame[]>(FALLBACK_FRAMES);
  const [comparison, setComparison] = useState<ComparisonResult>(FALLBACK_COMPARISON);

  const [frameIdx, setFrameIdx] = useState<number>(6);
  const [playing, setPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>("EZY409");

  const [layers, setLayers] = useState<LayerToggles>(DEFAULT_LAYERS);
  const [viewMode, setViewMode] = useState<"surface" | "terminal">("surface");
  const [resetCounter, setResetCounter] = useState<number>(0);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);

  // Operation Mode: "simulation" vs "live"
  const [opMode, setOpMode] = useState<"simulation" | "live">("live");
  const [liveTraffic, setLiveTraffic] = useState<import("./api/types").LiveTrafficSnapshot | null>(null);
  const [liveLastUpdated, setLiveLastUpdated] = useState<string>("");
  const [liveAircraftPositions, setLiveAircraftPositions] = useState<import("./api/types").AircraftState[]>([]);

  const [bottomTab, setBottomTab] = useState<"flights" | "metrics" | "comparison" | "builder">("flights");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [airlineFilter, setAirlineFilter] = useState<string>("ALL");
  const [placementMode, setPlacementMode] = useState<boolean>(false);
  const [newCallsign, setNewCallsign] = useState<string>("BAW910");
  const [newTriggerAction, setNewTriggerAction] =
    useState<ScenarioTrigger["action"]>("hold_position");
  const [newTriggerTimeS, setNewTriggerTimeS] = useState<number>(12);

  // Load initial airports and scenarios
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([api.airports(ctrl.signal), api.scenarios(ctrl.signal)])
      .then(([apList, scList]) => {
        if (apList.length > 0) setAirports(apList);
        if (scList.length > 0) setScenarios(scList);
        setApiConnected(true);
      })
      .catch(() => setApiConnected(false));
    return () => ctrl.abort();
  }, []);

  // Load airport when selectedAirportId changes
  useEffect(() => {
    const ctrl = new AbortController();
    api
      .airport(selectedAirportId, ctrl.signal)
      .then((ap) => {
        setAirport(ap);
        setApiConnected(true);
      })
      .catch(() => {
        if (selectedAirportId === FALLBACK_GENFIELD.id) setAirport(FALLBACK_GENFIELD);
      });
    return () => ctrl.abort();
  }, [selectedAirportId]);

  // Load scenario frames + comparison when scenario, controller, or seed changes
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      api.scenario(selectedScenarioId, ctrl.signal),
      api.runs(selectedScenarioId, controller, seed, ctrl.signal),
      api.compare(selectedScenarioId, seed, ctrl.signal),
    ])
      .then(([spec, runFrames, comp]) => {
        setScenarioSpec(spec);
        if (spec.airport_id !== selectedAirportId) {
          setSelectedAirportId(spec.airport_id);
        }
        if (runFrames.length > 0) {
          setFrames(runFrames);
          setFrameIdx((idx) => Math.min(idx, runFrames.length - 1));
        }
        setComparison(comp);
        setApiConnected(true);
      })
      .catch(() => {
        /* keep fallback frames */
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScenarioId, controller, seed]);

  // Poll live traffic when in "live" mode
  useEffect(() => {
    if (opMode !== "live") return undefined;
    const fetchLive = () => {
      api
        .live(selectedAirportId)
        .then((data) => {
          setLiveTraffic(data);
          setLiveAircraftPositions(data.aircraft.map((d) => d.state));
          setLiveLastUpdated(new Date().toLocaleTimeString());
          setApiConnected(true);
        })
        .catch(() => {
          // Keep prior snapshot or fallback
        });
    };
    fetchLive();
    const timer = window.setInterval(fetchLive, 5000);
    return () => window.clearInterval(timer);
  }, [opMode, selectedAirportId]);

  // Real-time smooth dead-reckoning animation for live aircraft (60 FPS kinematic movement)
  useEffect(() => {
    if (opMode !== "live") return undefined;
    const interval = window.setInterval(() => {
      setLiveAircraftPositions((prev) =>
        prev.map((ac) => {
          if (ac.speed_kts < 5) return ac;
          const spdMps = ac.speed_kts * 0.514444;
          const stepM = spdMps * 0.1; // 100ms step
          const rad = (ac.heading_deg * Math.PI) / 180;
          return {
            ...ac,
            position: [
              ac.position[0] + Math.sin(rad) * stepM,
              ac.position[1] + Math.cos(rad) * stepM,
            ],
          };
        }),
      );
    }, 100);
    return () => window.clearInterval(interval);
  }, [opMode]);

  // Playback timer
  useEffect(() => {
    if (!playing) return undefined;
    const intervalMs = Math.max(80, Math.round(1000 / speedMultiplier));
    const timer = window.setInterval(() => {
      setFrameIdx((prev) => {
        if (prev >= frames.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [playing, speedMultiplier, frames.length]);

  const currentFrame: SimFrame =
    frames[Math.min(frameIdx, frames.length - 1)] ?? FALLBACK_FRAMES[0]!;
  const durationMs = currentFrame.duration_ms || 90000;

  // Active aircraft list filtered by mode, airline, and search query
  const displayedAircraft = useMemo(() => {
    const list =
      opMode === "live" && liveAircraftPositions.length > 0
        ? liveAircraftPositions
        : currentFrame.aircraft;

    return list.filter((ac) => {
      if (airlineFilter !== "ALL") {
        const p = ac.callsign.slice(0, 3).toUpperCase();
        if (airlineFilter === "INTL") {
          const indian = ["IGO", "AIC", "AXB", "SEJ", "VTI", "AKJ"];
          if (indian.includes(p)) return false;
        } else if (p !== airlineFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        return ac.callsign.toUpperCase().includes(q);
      }
      return true;
    });
  }, [opMode, liveAircraftPositions, currentFrame.aircraft, airlineFilter, searchQuery]);

  const selectedAircraftInfo = useMemo(() => {
    if (!selectedCallsign) return null;

    if (opMode === "live" && liveTraffic) {
      const match = liveTraffic.aircraft.find((a) => a.callsign === selectedCallsign);
      if (match) {
        const livePos = liveAircraftPositions.find((a) => a.callsign === match.callsign);
        return {
          callsign: match.callsign,
          airline: match.airline,
          country: match.country,
          operator_callsign: match.operator_callsign,
          icao24: match.icao24,
          isLive: match.live,
          specs: lookupAircraftSpecs(match.aircraft_type || match.callsign),
          telemetry: {
            speedKts: livePos?.speed_kts ?? match.state.speed_kts,
            altitudeFt: match.state.altitude_ft,
            headingDeg: livePos?.heading_deg ?? match.state.heading_deg,
            phase: match.state.phase,
            icao24: match.icao24,
            country: match.country,
          },
        };
      }
    }

    const simAc = displayedAircraft.find((a) => a.callsign === selectedCallsign);
    if (simAc) {
      const specs = lookupAircraftSpecs(simAc.aircraft_type || simAc.callsign);
      const prefix = simAc.callsign.slice(0, 3).toUpperCase();
      let airline = "Commercial Jetliner";
      if (prefix === "IGO") airline = "IndiGo Airlines";
      else if (prefix === "AIC") airline = "Air India";
      else if (prefix === "SEJ") airline = "SpiceJet";
      else if (prefix === "VTI") airline = "Vistara";
      else if (prefix === "AKJ") airline = "Akasa Air";
      else if (prefix === "BAW") airline = "British Airways";
      else if (prefix === "UAE") airline = "Emirates";
      else if (prefix === "EZY") airline = "easyJet";
      else if (prefix === "DLH") airline = "Lufthansa";
      else if (prefix === "SWA") airline = "Southwest Airlines";

      return {
        callsign: simAc.callsign,
        airline,
        country:
          prefix === "BAW"
            ? "United Kingdom"
            : prefix === "AIC" ||
                prefix === "IGO" ||
                prefix === "SEJ" ||
                prefix === "VTI" ||
                prefix === "AKJ"
              ? "India"
              : "International",
        operator_callsign: airline.split(" ")[0],
        icao24: "ADSB-" + simAc.callsign,
        isLive: false,
        specs,
        telemetry: {
          speedKts: simAc.speed_kts,
          altitudeFt: simAc.altitude_ft,
          headingDeg: simAc.heading_deg,
          phase: simAc.phase,
          icao24: "ADSB-" + simAc.callsign,
          country: "Simulated Transponder",
        },
      };
    }

    return null;
  }, [selectedCallsign, opMode, liveTraffic, liveAircraftPositions, displayedAircraft]);

  const selectedRouteDetails = useMemo(() => {
    if (!selectedAircraftInfo) return undefined;
    return lookupFlightRoute(
      selectedAircraftInfo.callsign,
      airport.icao,
      selectedAircraftInfo.telemetry.speedKts,
      selectedAircraftInfo.telemetry.altitudeFt,
    );
  }, [selectedAircraftInfo, airport.icao]);

  const visibleAlerts = useMemo(
    () => currentFrame.alerts.filter((a) => a.time_ms <= currentFrame.time_ms),
    [currentFrame],
  );
  const visibleComms = useMemo(
    () => currentFrame.comms.filter((c) => c.time_ms <= currentFrame.time_ms),
    [currentFrame],
  );
  const visibleDecisions = useMemo(
    () => currentFrame.decisions.filter((d) => d.time_ms <= currentFrame.time_ms),
    [currentFrame],
  );

  const toggleLayer = (key: keyof LayerToggles) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePlaceAircraftOnCanvas = (pt: Point) => {
    const newSpawn: ScenarioSpawn = {
      callsign: newCallsign.trim().toUpperCase() || `AC${scenarioSpec.spawns.length + 1}`,
      aircraft_type: "B738",
      spawn_time_ms: 0,
      role: "surface",
      initial_phase: "taxi_out",
      position: pt,
      heading_deg: 90,
      speed_kts: 15,
      target_speed_kts: 15,
      altitude_ft: airport.reference.elevation_ft,
      assigned_runway: airport.runways[0]?.id ?? "09/27",
      route: [[pt[0] + 400, pt[1]]],
      hold_short_of: airport.runways[0]?.id ?? "09/27",
      cleared_to_cross: [],
      cleared_takeoff: false,
      cleared_land: false,
    };
    setScenarioSpec((prev) => ({ ...prev, spawns: [...prev.spawns, newSpawn] }));
    setPlacementMode(false);
    setNewCallsign(`BAW${911 + scenarioSpec.spawns.length}`);
  };

  const handleAddTrigger = () => {
    const targetCs =
      selectedCallsign ?? scenarioSpec.spawns[0]?.callsign ?? "BAW204";
    const trig: ScenarioTrigger = {
      id: `trig-custom-${scenarioSpec.triggers.length + 1}`,
      time_ms: newTriggerTimeS * 1000,
      callsign: targetCs,
      action: newTriggerAction,
      runway: airport.runways[0]?.id ?? "09/27",
      target_speed_kts: null,
      note: `User trigger: ${newTriggerAction} on ${targetCs}`,
    };
    setScenarioSpec((prev) => ({ ...prev, triggers: [...prev.triggers, trig] }));
  };

  const yamlText = useMemo(() => serializeScenarioToYaml(scenarioSpec), [scenarioSpec]);

  const handleDownloadYaml = () => {
    const blob = new Blob([yamlText], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenarioSpec.id}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const seekToMs = (ms: number) => {
    const targetIdx = Math.max(0, Math.min(frames.length - 1, Math.round(ms / 1000)));
    setFrameIdx(targetIdx);
  };

  return (
    <div className="app-shell">
      <div className="safety-banner" role="region" aria-label="Operational safety notice">
        <div className="safety-banner-left">
          <span className="safety-pill" aria-hidden="true">
            NOTICE
          </span>
          <span>{SAFETY_NOTICE}</span>
        </div>
        <span>
          {apiConnected === true
            ? "LIVE ADS-B SURVEILLANCE & ATC ENGINE"
            : "OFFLINE FLIGHTRADAR & ATC ENGINE"}
        </span>
      </div>

      <header className="top-header">
        <div className="brand-title">
          <h1>ATC Surface &amp; Terminal Simulator</h1>
          <span className="brand-subtitle">
            {airport.icao} · {airport.name}
          </span>
        </div>

        <div className="toolbar-group">
          <div className="segmented" role="group" aria-label="Operating Mode">
            <button
              type="button"
              className="segmented-btn"
              aria-pressed={opMode === "live"}
              onClick={() => {
                setOpMode("live");
                setPlaying(false);
              }}
            >
              ● LIVE AIRPORT &amp; FLIGHTS
            </button>
            <button
              type="button"
              className="segmented-btn"
              aria-pressed={opMode === "simulation"}
              onClick={() => setOpMode("simulation")}
            >
              SIMULATION / SCENARIO
            </button>
          </div>

          <label className="field-label" htmlFor="airport-select">
            Airport
            <select
              id="airport-select"
              className="select-input"
              value={selectedAirportId}
              onChange={(e) => setSelectedAirportId(e.target.value)}
            >
              {airports.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.icao} — {a.name}
                </option>
              ))}
            </select>
          </label>

          {opMode === "simulation" && (
            <>
              <label className="field-label" htmlFor="scenario-select">
                Scenario
                <select
                  id="scenario-select"
                  className="select-input"
                  value={selectedScenarioId}
                  onChange={(e) => {
                    setSelectedScenarioId(e.target.value);
                    setFrameIdx(0);
                  }}
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label" htmlFor="controller-select">
                Controller
                <select
                  id="controller-select"
                  className="select-input"
                  value={controller}
                  onChange={(e) => setController(e.target.value as ControllerKind)}
                >
                  <option value="proactive_ai">Proactive AI + Safety Filter</option>
                  <option value="baseline_rule">Baseline Rule Controller</option>
                </select>
              </label>
            </>
          )}

          <div className="segmented" role="group" aria-label="Viewport bounds">
            <button
              type="button"
              className="segmented-btn"
              aria-pressed={viewMode === "surface"}
              onClick={() => setViewMode("surface")}
            >
              Surface
            </button>
            <button
              type="button"
              className="segmented-btn"
              aria-pressed={viewMode === "terminal"}
              onClick={() => setViewMode("terminal")}
            >
              Terminal Fixes
            </button>
          </div>

          <button
            type="button"
            className="btn"
            onClick={() => setResetCounter((c) => c + 1)}
          >
            Reset View
          </button>

          <a
            className="btn btn-primary"
            href={api.reportUrl(selectedScenarioId, seed)}
            target="_blank"
            rel="noreferrer"
          >
            HTML / PDF Report
          </a>
        </div>
      </header>

      {/* Playback controls & timeline scrubber with markers */}
      {opMode === "simulation" ? (
        <section className="playback-bar" aria-label="Playback and timeline scrubber">
          <div className="playback-controls-row">
            <div className="playback-buttons">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPlaying(false);
                  setFrameIdx((i) => Math.max(0, i - 1));
                }}
                aria-label="Step back 1 second"
              >
                −1s Step
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPlaying(false);
                  setFrameIdx((i) => Math.min(frames.length - 1, i + 1));
                }}
                aria-label="Step forward 1 second"
              >
                +1s Step
              </button>
              <span className="clock-pill" aria-live="polite">
                T+{formatTime(currentFrame.time_ms)} / {formatTime(durationMs)} (Tick{" "}
                {currentFrame.tick})
              </span>
            </div>

            <div className="playback-buttons">
              <span className="field-label">Speed</span>
              <div className="segmented" role="group" aria-label="Playback speed">
                {[0.5, 1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    className="segmented-btn"
                    aria-pressed={speedMultiplier === spd}
                    onClick={() => setSpeedMultiplier(spd)}
                  >
                    {spd}×
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="scrubber-track-wrap">
            <input
              type="range"
              className="scrubber-input"
              aria-label="Timeline scrubber"
              min={0}
              max={Math.max(1, frames.length - 1)}
              value={frameIdx}
              onChange={(e) => {
                setPlaying(false);
                setFrameIdx(Number(e.target.value));
              }}
            />
            <div className="timeline-markers-row" aria-label="Timeline event markers">
              {currentFrame.markers.map((m) => {
                const pct = Math.min(96, Math.max(4, (m.time_ms / durationMs) * 100));
                const icon =
                  m.kind === "near_miss" ? "◆" : m.kind === "detection" ? "▲" : "●";
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`timeline-marker-pin pin-${m.kind}`}
                    style={{ left: `${pct}%` }}
                    title={`${formatTime(m.time_ms)} — ${m.label}`}
                    onClick={() => {
                      setPlaying(false);
                      seekToMs(m.time_ms);
                    }}
                  >
                    {icon} {m.kind.replace("_", " ").toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <section className="playback-bar" aria-label="Live stream status">
          <div className="playback-controls-row">
            <div className="playback-buttons">
              <span className="safety-pill" style={{ background: "var(--teal)" }}>
                ● LIVE RADAR STREAM
              </span>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>
                {liveTraffic?.source ?? "Connecting..."} ·{" "}
                <strong>{liveTraffic?.aircraft_count ?? 0} aircraft tracked</strong> in terminal
                radius
              </span>
            </div>
            <div className="playback-buttons">
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                Auto-refreshing (5s interval) · Updated {liveLastUpdated || "Just now"}
              </span>
            </div>
          </div>
        </section>
      )}

      <main className="workspace-grid">
        <div className="left-column">
          <section className="card" aria-label="Surface radar display">
            <div className="card-header">
              <span>
                Radar Display · {airport.icao} ({airport.runways.map((r) => r.id).join(", ")})
              </span>
              <span>
                {displayedAircraft.length} Aircraft Shown · Selected:{" "}
                {selectedCallsign ?? "None"}
              </span>
            </div>

            {/* FlightRadar24 Quick Search & Airline Filter Toolbar */}
            <div className="flight-toolbar" role="toolbar" aria-label="Flight radar search and airline filters">
              <div className="search-wrap">
                <span aria-hidden="true" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Search flight number, callsign, or airline..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Filter aircraft by callsign or flight number"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--text-secondary)",
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="airline-pills" role="radiogroup" aria-label="Filter by airline">
                {(
                  [
                    ["ALL", "All Flights"],
                    ["IGO", "IndiGo"],
                    ["AIC", "Air India"],
                    ["AXB", "AI Express"],
                    ["SEJ", "SpiceJet"],
                    ["VTI", "Vistara"],
                    ["AKJ", "Akasa"],
                    ["INTL", "International"],
                  ] as const
                ).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    className="airline-pill-btn"
                    aria-pressed={airlineFilter === code}
                    onClick={() => setAirlineFilter(code)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <RadarCanvas
              airport={airport}
              layers={layers}
              viewMode={viewMode}
              resetCounter={resetCounter}
              aircraft={displayedAircraft}
              selectedCallsign={selectedCallsign}
              onSelectAircraft={setSelectedCallsign}
              alerts={visibleAlerts}
              placementMode={placementMode}
              onPlaceWorldPoint={handlePlaceAircraftOnCanvas}
            />
          </section>

          {/* Bottom workspace card: Live Flight Board, Metrics, Comparison, Builder */}
          <section className="card" aria-label="Airport flight board, analytics, and scenario builder">
            <div className="tab-strip" role="tablist">
              <button
                type="button"
                role="tab"
                className="tab-btn"
                aria-selected={bottomTab === "flights"}
                onClick={() => setBottomTab("flights")}
              >
                Live Flight Board ({displayedAircraft.length})
              </button>
              <button
                type="button"
                role="tab"
                className="tab-btn"
                aria-selected={bottomTab === "metrics"}
                onClick={() => setBottomTab("metrics")}
              >
                Metrics Dashboard
              </button>
              <button
                type="button"
                role="tab"
                className="tab-btn"
                aria-selected={bottomTab === "comparison"}
                onClick={() => setBottomTab("comparison")}
              >
                Run Comparison (Teal vs. Ink)
              </button>
              <button
                type="button"
                role="tab"
                className="tab-btn"
                aria-selected={bottomTab === "builder"}
                onClick={() => setBottomTab("builder")}
              >
                Scenario Builder (YAML)
              </button>
            </div>

            {bottomTab === "flights" && (
              <div className="card-body">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                    Tracking <strong>{displayedAircraft.length} flights</strong> in {airport.name} ({airport.icao}) airspace. Click any row to inspect 3D airframe &amp; specs.
                  </span>
                  {selectedCallsign && (
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => setSelectedCallsign(null)}
                      style={{ fontSize: 11, padding: "2px 8px" }}
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                <div style={{ overflowX: "auto", maxHeight: 420 }}>
                  <table className="runway-table" aria-label="Live airport flight board">
                    <thead>
                      <tr>
                        <th>Flight</th>
                        <th>Airline</th>
                        <th>Callsign</th>
                        <th>Aircraft Type</th>
                        <th>Route</th>
                        <th>Speed</th>
                        <th>Altitude</th>
                        <th>Squawk</th>
                        <th>Phase</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedAircraft.map((ac) => {
                        const isSel = ac.callsign === selectedCallsign;
                        const route = lookupFlightRoute(ac.callsign, airport.icao, ac.speed_kts, ac.altitude_ft);
                        const specs = lookupAircraftSpecs(ac.aircraft_type || ac.callsign);
                        const livery = lookupAirlineLivery(ac.callsign);
                        return (
                          <tr
                            key={ac.callsign}
                            className={isSel ? "row-selected" : undefined}
                            style={{ cursor: "pointer" }}
                            onClick={() => setSelectedCallsign(ac.callsign)}
                          >
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    backgroundColor: `#${livery.primaryColor.toString(16).padStart(6, "0")}`,
                                  }}
                                />
                                <strong>{route.flightNumber}</strong>
                              </div>
                            </td>
                            <td>{route.airline}</td>
                            <td>
                              <code style={{ fontSize: 11 }}>{ac.callsign}</code>
                            </td>
                            <td>{specs.model}</td>
                            <td>
                              <span style={{ fontWeight: 600 }}>{route.origin.iata}</span> ➔{" "}
                              <span style={{ fontWeight: 600 }}>{route.destination.iata}</span>
                            </td>
                            <td>{Math.round(ac.speed_kts)} kt</td>
                            <td>{Math.round(ac.altitude_ft)} ft</td>
                            <td>{route.squawk}</td>
                            <td>
                              <span
                                className="safety-pill"
                                style={{
                                  fontSize: 10,
                                  padding: "1px 6px",
                                  background: isSel ? "var(--teal)" : "var(--aqua)",
                                  color: isSel ? "var(--white)" : "var(--ink)",
                                }}
                              >
                                {ac.phase.replace("_", " ").toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-sm"
                                style={{
                                  fontSize: 11,
                                  padding: "2px 8px",
                                  background: isSel ? "var(--teal)" : undefined,
                                  color: isSel ? "var(--white)" : undefined,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedCallsign(ac.callsign);
                                }}
                              >
                                {isSel ? "Inspecting" : "3D Specs"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {bottomTab === "metrics" && (
              <div className="card-body">
                <div className="kv-grid">
                  <div className="kv-item">
                    <div className="kv-label">Min Separation</div>
                    <div className="kv-value">{currentFrame.metrics.min_separation_m} m</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Safety Filter Vetoes/Mods</div>
                    <div className="kv-value">
                      {currentFrame.metrics.safety_filter_interventions}
                    </div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Near-Miss Events</div>
                    <div className="kv-value">{currentFrame.metrics.near_miss_count}</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Instructions Issued</div>
                    <div className="kv-value">{currentFrame.metrics.instructions_issued}</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Avg Surface Delay</div>
                    <div className="kv-value">{currentFrame.metrics.avg_taxi_delay_s} s</div>
                  </div>
                  <div className="kv-item">
                    <div className="kv-label">Throughput Completed</div>
                    <div className="kv-value">{currentFrame.metrics.throughput_completed}</div>
                  </div>
                </div>
                <SeparationChart
                  primarySeries={currentFrame.metrics.series}
                  currentTimeMs={currentFrame.time_ms}
                />
              </div>
            )}

            {bottomTab === "comparison" && (
              <div className="card-body">
                <div className="playback-controls-row">
                  <span>
                    <strong>Same-Seed Side-by-Side Comparison</strong>
                  </span>
                  <span>
                    <strong style={{ color: palette.teal }}>
                      ■ Primary: {comparison.primary_controller} (Teal)
                    </strong>{" "}
                    ·{" "}
                    <strong style={{ color: palette.ink }}>
                      -- Secondary: {comparison.secondary_controller} (Ink)
                    </strong>
                  </span>
                </div>
                <SeparationChart
                  primarySeries={comparison.primary_metrics.series}
                  secondarySeries={comparison.secondary_metrics.series}
                  currentTimeMs={currentFrame.time_ms}
                />
                <table className="runway-table" aria-label="Controller comparison table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Proactive AI + Safety Filter (Teal)</th>
                      <th>Baseline Rule Controller (Ink)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Minimum Separation</td>
                      <td>
                        <strong>{comparison.primary_metrics.min_separation_m} m</strong>
                      </td>
                      <td>{comparison.secondary_metrics.min_separation_m} m</td>
                    </tr>
                    <tr>
                      <td>Near-Miss Count (&lt; 220 m)</td>
                      <td>
                        <strong>{comparison.primary_metrics.near_miss_count}</strong>
                      </td>
                      <td>{comparison.secondary_metrics.near_miss_count}</td>
                    </tr>
                    <tr>
                      <td>Total Safety Alerts</td>
                      <td>{comparison.primary_metrics.total_alerts}</td>
                      <td>{comparison.secondary_metrics.total_alerts}</td>
                    </tr>
                    <tr>
                      <td>Safety Filter Interventions</td>
                      <td>{comparison.primary_metrics.safety_filter_interventions}</td>
                      <td>{comparison.secondary_metrics.safety_filter_interventions}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {bottomTab === "builder" && (
              <div className="card-body">
                <div className="playback-controls-row">
                  <div className="playback-buttons">
                    <input
                      type="text"
                      className="text-input"
                      aria-label="New aircraft callsign"
                      value={newCallsign}
                      onChange={(e) => setNewCallsign(e.target.value)}
                      placeholder="Callsign"
                    />
                    <button
                      type="button"
                      className={placementMode ? "btn btn-primary" : "btn"}
                      onClick={() => setPlacementMode((p) => !p)}
                    >
                      {placementMode
                        ? "Click Radar Canvas to Place…"
                        : "+ Click-to-Place Aircraft"}
                    </button>
                  </div>
                  <div className="playback-buttons">
                    <select
                      className="select-input"
                      aria-label="Trigger action"
                      value={newTriggerAction}
                      onChange={(e) =>
                        setNewTriggerAction(e.target.value as ScenarioTrigger["action"])
                      }
                    >
                      <option value="hold_position">Hold Position</option>
                      <option value="cross_runway">Cross Runway</option>
                      <option value="disregard_hold_short">Disregard Hold-Short</option>
                      <option value="resume_taxi">Resume Taxi</option>
                      <option value="cleared_takeoff">Cleared Takeoff</option>
                    </select>
                    <input
                      type="number"
                      className="text-input"
                      style={{ width: 68 }}
                      aria-label="Trigger time seconds"
                      value={newTriggerTimeS}
                      onChange={(e) => setNewTriggerTimeS(Number(e.target.value) || 10)}
                    />
                    <button type="button" className="btn" onClick={handleAddTrigger}>
                      + Add Trigger
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleDownloadYaml}
                    >
                      Save as YAML
                    </button>
                  </div>
                </div>
                <textarea
                  className="yaml-box"
                  aria-label="Scenario YAML preview"
                  readOnly
                  value={yamlText}
                />
              </div>
            )}
          </section>
        </div>

        {/* Right inspector stack */}
        <aside className="sidebar-stack" aria-label="Controller, alerts, comms, and layer panels">
          {/* 3D Aircraft Inspector & Technical Specifications */}
          {selectedAircraftInfo ? (
            <section className="card" aria-label="Selected flight details and 3D model">
              <div className="card-header">
                <span>FlightRadar 3D Inspector</span>
                <span className="safety-pill" style={{ background: "var(--teal)" }}>
                  {selectedAircraftInfo.isLive ? "LIVE ADS-B" : "RADAR TARGET"}
                </span>
              </div>
              <div className="card-body">
                <Aircraft3DViewer
                  specs={selectedAircraftInfo.specs}
                  airlineName={selectedAircraftInfo.airline}
                  callsign={selectedAircraftInfo.callsign}
                  onClose={() => setSelectedCallsign(null)}
                  liveTelemetry={selectedAircraftInfo.telemetry}
                  routeDetails={selectedRouteDetails}
                />
              </div>
            </section>
          ) : (
            <section className="card" aria-label="Flight inspector idle state">
              <div className="card-header">
                <span>FlightRadar 3D Inspector</span>
                <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Ready</span>
              </div>
              <div className="card-body" style={{ textAlign: "center", padding: "20px 16px" }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>✈</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                  Select Any Aircraft on Radar
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>
                  Click any aircraft on the map or search above to inspect its real-world 3D
                  airframe, route, and full technical specifications.
                </div>
                {displayedAircraft.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                    {displayedAircraft.slice(0, 4).map((ac) => (
                      <button
                        key={ac.callsign}
                        type="button"
                        className="btn-sm"
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        onClick={() => setSelectedCallsign(ac.callsign)}
                      >
                        Inspect {ac.callsign}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Controller Decision Panel */}
          <section className="card" aria-label="Controller decision panel">
            <div className="card-header">
              <span>Controller Decision Panel</span>
              <span>Safety Filter Active</span>
            </div>
            <div className="card-body">
              <div className="feed-list">
                {visibleDecisions.length === 0 ? (
                  <div className="decision-item">No controller decisions issued yet.</div>
                ) : (
                  visibleDecisions.map((d) => (
                    <div key={d.id} className="decision-item">
                      <div className="decision-top">
                        <span>
                          T+{formatTime(d.time_ms)} · <strong>{d.callsign}</strong>:{" "}
                          {d.instruction}
                        </span>
                        <span className={`filter-pill filter-${d.safety_filter_status}`}>
                          {d.safety_filter_status}
                        </span>
                      </div>
                      <div>{d.reason}</div>
                      <div style={{ color: "var(--text-secondary)" }}>
                        Confidence: <strong>{Math.round(d.confidence * 100)}%</strong> ·{" "}
                        {d.safety_filter_note}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          {/* Live Alerts List */}
          <section className="card" aria-label="Live safety alerts">
            <div className="card-header">
              <span>Live Safety Alerts</span>
              <span>{visibleAlerts.length} Active</span>
            </div>
            <div className="card-body">
              <div className="alert-legend">
                {visibleAlerts.map((a) => {
                  const icon =
                    a.severity === "warning" ? "◆" : a.severity === "caution" ? "▲" : "ℹ";
                  return (
                    <div
                      key={a.id}
                      className={`alert-badge alert-badge-${a.severity}`}
                    >
                      <div>
                        <div>
                          <span aria-hidden="true">{icon} </span>
                          <strong>{a.title}</strong> ({formatTime(a.time_ms)})
                        </div>
                        <div>{a.message}</div>
                      </div>
                    </div>
                  );
                })}
                <div className="alert-badge alert-badge-advisory">
                  <span>
                    <span aria-hidden="true">ℹ </span>
                    ADVISORY — Standard Surface Monitoring
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Communication Log */}
          <section className="card" aria-label="VHF communication log">
            <div className="card-header">
              <span>Communication Log</span>
              <span>118.700 MHz</span>
            </div>
            <div className="card-body">
              <div className="feed-list">
                {visibleComms.map((c) => (
                  <div key={c.id} className="comm-item">
                    <div className="comm-top">
                      <span>
                        [{c.speaker}] {c.callsign}
                      </span>
                      <span>T+{formatTime(c.time_ms)}</span>
                    </div>
                    <div>“{c.transmission}”</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Map Layers & Runways */}
          <section className="card" aria-label="Radar layers and airport runways">
            <div className="card-header">
              <span>Radar Layers &amp; Runways</span>
              <span>{airport.icao}</span>
            </div>
            <div className="card-body">
              <div className="layer-list">
                {(
                  [
                    ["mapBackground", "Real Map Satellite/Base"],
                    ["aircraft", "Aircraft Icons"],
                    ["dataBlocks", "Speed/Alt Blocks"],
                    ["trajectories", "Predicted Paths"],
                    ["separationRings", "Separation Rings"],
                    ["alerts", "Alert Highlights"],
                    ["holdShorts", "Hold-Short Bars"],
                    ["taxiwayLabels", "Taxiway Labels"],
                    ["gates", "Gates"],
                    ["fixes", "Terminal Fixes"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="layer-toggle">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={layers[key]}
                      onChange={() => toggleLayer(key)}
                    />
                  </label>
                ))}
              </div>

              <table className="runway-table" aria-label="Runways">
                <thead>
                  <tr>
                    <th>Runway</th>
                    <th>Length</th>
                    <th>Width</th>
                    <th>Headings</th>
                  </tr>
                </thead>
                <tbody>
                  {airport.runways.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.id}</strong>
                      </td>
                      <td>{Math.round(r.length_m)} m</td>
                      <td>{r.width_m} m</td>
                      <td>
                        {Math.round(r.ends[0].heading_deg)}° /{" "}
                        {Math.round(r.ends[1].heading_deg)}°
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
