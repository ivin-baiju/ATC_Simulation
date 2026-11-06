import type {
  Airport,
  AirportSummary,
  ComparisonResult,
  ControllerKind,
  Health,
  ScenarioSpec,
  ScenarioSummary,
  SimFrame,
} from "./types";
import {
  embeddedAirportsSummary,
  embeddedAirports,
  embeddedScenarios,
  embeddedScenarioSpecs,
  embeddedComparisons,
} from "../offline/embeddedData";
import { generateClientLiveTraffic } from "../offline/clientLiveTraffic";
import { generateOfflineSimFrames } from "../offline/simRunner";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { signal, headers: { Accept: "application/json" } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Backend unreachable.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(`${res.status} ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(`${res.status} ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  health: async (signal?: AbortSignal): Promise<Health> => {
    try {
      return await getJson<Health>("/health", signal);
    } catch {
      return {
        status: "ok",
        version: "0.2.0",
        notice: "SIMULATION ONLY",
        airports: 10,
        scenarios: 3,
      };
    }
  },
  airports: async (signal?: AbortSignal): Promise<AirportSummary[]> => {
    try {
      return await getJson<AirportSummary[]>("/airports", signal);
    } catch {
      return embeddedAirportsSummary;
    }
  },
  airport: async (id: string, signal?: AbortSignal): Promise<Airport> => {
    try {
      return await getJson<Airport>(`/airports/${encodeURIComponent(id)}`, signal);
    } catch {
      return (embeddedAirports[id] ?? embeddedAirports["vidp"])!;
    }
  },
  scenarios: async (signal?: AbortSignal): Promise<ScenarioSummary[]> => {
    try {
      return await getJson<ScenarioSummary[]>("/scenarios", signal);
    } catch {
      return embeddedScenarios;
    }
  },
  scenario: async (id: string, signal?: AbortSignal): Promise<ScenarioSpec> => {
    try {
      return await getJson<ScenarioSpec>(`/scenarios/${encodeURIComponent(id)}`, signal);
    } catch {
      return (embeddedScenarioSpecs[id] ?? embeddedScenarioSpecs["crossing_runways_incursion"])!;
    }
  },
  saveScenario: (spec: ScenarioSpec) => postJson<ScenarioSpec>("/scenarios", spec),
  runs: async (
    scenarioId: string,
    controller: ControllerKind = "proactive_ai",
    seed?: number,
    signal?: AbortSignal,
  ): Promise<SimFrame[]> => {
    try {
      const q = new URLSearchParams({ scenario_id: scenarioId, controller });
      if (seed !== undefined) q.set("seed", String(seed));
      return await getJson<SimFrame[]>(`/runs?${q.toString()}`, signal);
    } catch {
      return generateOfflineSimFrames(scenarioId, controller, seed);
    }
  },
  compare: async (scenarioId: string, seed?: number, signal?: AbortSignal): Promise<ComparisonResult> => {
    try {
      const q = new URLSearchParams({ scenario_id: scenarioId });
      if (seed !== undefined) q.set("seed", String(seed));
      return await getJson<ComparisonResult>(`/compare?${q.toString()}`, signal);
    } catch {
      return (embeddedComparisons[scenarioId] ?? embeddedComparisons["crossing_runways_incursion"])!;
    }
  },
  live: async (airportId: string, signal?: AbortSignal): Promise<import("./types").LiveTrafficSnapshot> => {
    try {
      return await getJson<import("./types").LiveTrafficSnapshot>(`/live/${encodeURIComponent(airportId)}`, signal);
    } catch {
      return generateClientLiveTraffic(airportId);
    }
  },
  reportUrl: (scenarioId: string, seed?: number) => {
    const q = new URLSearchParams({ scenario_id: scenarioId });
    if (seed !== undefined) q.set("seed", String(seed));
    return `${BASE}/report?${q.toString()}`;
  },
};
