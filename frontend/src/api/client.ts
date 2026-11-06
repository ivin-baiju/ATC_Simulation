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
    throw new ApiError("Backend unreachable. Is the API running on :8000?");
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
  health: (signal?: AbortSignal) => getJson<Health>("/health", signal),
  airports: (signal?: AbortSignal) => getJson<AirportSummary[]>("/airports", signal),
  airport: (id: string, signal?: AbortSignal) =>
    getJson<Airport>(`/airports/${encodeURIComponent(id)}`, signal),
  scenarios: (signal?: AbortSignal) => getJson<ScenarioSummary[]>("/scenarios", signal),
  scenario: (id: string, signal?: AbortSignal) =>
    getJson<ScenarioSpec>(`/scenarios/${encodeURIComponent(id)}`, signal),
  saveScenario: (spec: ScenarioSpec) => postJson<ScenarioSpec>("/scenarios", spec),
  runs: (
    scenarioId: string,
    controller: ControllerKind = "proactive_ai",
    seed?: number,
    signal?: AbortSignal,
  ) => {
    const q = new URLSearchParams({ scenario_id: scenarioId, controller });
    if (seed !== undefined) q.set("seed", String(seed));
    return getJson<SimFrame[]>(`/runs?${q.toString()}`, signal);
  },
  compare: (scenarioId: string, seed?: number, signal?: AbortSignal) => {
    const q = new URLSearchParams({ scenario_id: scenarioId });
    if (seed !== undefined) q.set("seed", String(seed));
    return getJson<ComparisonResult>(`/compare?${q.toString()}`, signal);
  },
  live: (airportId: string, signal?: AbortSignal) =>
    getJson<import("./types").LiveTrafficSnapshot>(`/live/${encodeURIComponent(airportId)}`, signal),
  reportUrl: (scenarioId: string, seed?: number) => {
    const q = new URLSearchParams({ scenario_id: scenarioId });
    if (seed !== undefined) q.set("seed", String(seed));
    return `${BASE}/report?${q.toString()}`;
  },
};
