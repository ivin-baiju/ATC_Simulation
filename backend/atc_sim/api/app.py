"""HTTP & WebSocket API for airport layouts, scenarios, simulation runs, comparison, and reports."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel

from .. import SAFETY_NOTICE, __version__
from ..airport import DEFAULT_AIRPORTS_DIR, Airport, AirportRegistry, AirportSummary
from ..live import LiveTrafficSnapshot, fetch_live_traffic
from ..sim import (
    DEFAULT_SCENARIOS_DIR,
    ComparisonResult,
    ControllerKind,
    ScenarioRegistry,
    ScenarioSpec,
    ScenarioSummary,
    SimFrame,
    compare_controllers,
    dump_scenario_yaml,
    parse_scenario_yaml,
    render_evaluation_report_html,
    simulate_run,
)


class Health(BaseModel):
    status: str
    version: str
    notice: str
    airports: int
    scenarios: int


class YamlPayload(BaseModel):
    yaml_text: str


def create_app(
    airports_dir: str | Path | None = None,
    scenarios_dir: str | Path | None = None,
) -> FastAPI:
    ap_dir = Path(airports_dir or os.environ.get("ATC_AIRPORTS_DIR") or DEFAULT_AIRPORTS_DIR)
    sc_dir = Path(scenarios_dir or os.environ.get("ATC_SCENARIOS_DIR") or DEFAULT_SCENARIOS_DIR)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.airports = AirportRegistry(ap_dir)
        app.state.scenarios = ScenarioRegistry(sc_dir)
        yield

    app = FastAPI(
        title="ATC Simulator API",
        version=__version__,
        description=f"**{SAFETY_NOTICE}**",
        lifespan=lifespan,
    )

    origins = [
        o for o in os.environ.get("ATC_CORS_ORIGINS", "http://localhost:5173").split(",") if o
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def safety_header(request: Request, call_next):  # type: ignore[no-untyped-def]
        response: Response = await call_next(request)
        response.headers["X-Simulation-Only"] = SAFETY_NOTICE
        return response

    def airports(request: Request) -> AirportRegistry:
        reg: AirportRegistry = request.app.state.airports
        return reg

    def scenarios(request: Request) -> ScenarioRegistry:
        reg: ScenarioRegistry = request.app.state.scenarios
        return reg

    @app.get("/api/health", response_model=Health)
    def health(request: Request) -> Health:
        return Health(
            status="ok",
            version=__version__,
            notice=SAFETY_NOTICE,
            airports=len(airports(request)),
            scenarios=len(scenarios(request).list_summaries()),
        )

    @app.get("/api/airports", response_model=list[AirportSummary])
    def list_airports(request: Request) -> list[AirportSummary]:
        return airports(request).summaries()

    @app.get("/api/airports/{airport_id}", response_model=Airport)
    def get_airport(airport_id: str, request: Request) -> Airport:
        try:
            return airports(request).get(airport_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown airport {airport_id!r}") from None

    @app.get("/api/live/{airport_id}", response_model=LiveTrafficSnapshot)
    def live_traffic(airport_id: str, request: Request) -> LiveTrafficSnapshot:
        try:
            ap = airports(request).get(airport_id)
        except KeyError:
            raise HTTPException(status_code=404, detail=f"unknown airport {airport_id!r}") from None
        return fetch_live_traffic(ap)

    @app.get("/api/scenarios", response_model=list[ScenarioSummary])
    def list_scenarios(request: Request) -> list[ScenarioSummary]:
        return scenarios(request).list_summaries()

    @app.get("/api/scenarios/{scenario_id}", response_model=ScenarioSpec)
    def get_scenario(scenario_id: str, request: Request) -> ScenarioSpec:
        try:
            return scenarios(request).get(scenario_id)
        except KeyError:
            raise HTTPException(
                status_code=404, detail=f"unknown scenario {scenario_id!r}"
            ) from None

    @app.get("/api/scenarios/{scenario_id}/yaml", response_class=PlainTextResponse)
    def get_scenario_yaml(scenario_id: str, request: Request) -> PlainTextResponse:
        try:
            spec = scenarios(request).get(scenario_id)
        except KeyError:
            raise HTTPException(
                status_code=404, detail=f"unknown scenario {scenario_id!r}"
            ) from None
        return PlainTextResponse(dump_scenario_yaml(spec))

    @app.post("/api/scenarios", response_model=ScenarioSpec)
    def save_scenario(spec: ScenarioSpec, request: Request) -> ScenarioSpec:
        try:
            airports(request).get(spec.airport_id)
        except KeyError:
            raise HTTPException(
                status_code=400, detail=f"unknown airport_id {spec.airport_id!r}"
            ) from None
        return scenarios(request).save(spec)

    @app.post("/api/scenarios/from-yaml", response_model=ScenarioSpec)
    def save_scenario_from_yaml(payload: YamlPayload, request: Request) -> ScenarioSpec:
        try:
            spec = parse_scenario_yaml(payload.yaml_text)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"invalid scenario YAML: {exc}") from exc
        try:
            airports(request).get(spec.airport_id)
        except KeyError:
            raise HTTPException(
                status_code=400, detail=f"unknown airport_id {spec.airport_id!r}"
            ) from None
        return scenarios(request).save(spec)

    @app.get("/api/runs", response_model=list[SimFrame])
    def run_scenario(
        request: Request,
        scenario_id: str = "crossing_runways_incursion",
        controller: ControllerKind = "proactive_ai",
        seed: int | None = None,
    ) -> list[SimFrame]:
        try:
            spec = scenarios(request).get(scenario_id)
            ap = airports(request).get(spec.airport_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=f"not found: {exc}") from None
        return simulate_run(ap, spec, controller=controller, seed=seed)

    @app.get("/api/compare", response_model=ComparisonResult)
    def compare_scenario(
        request: Request,
        scenario_id: str = "crossing_runways_incursion",
        seed: int | None = None,
        primary: ControllerKind = "proactive_ai",
        secondary: ControllerKind = "baseline_rule",
    ) -> ComparisonResult:
        try:
            spec = scenarios(request).get(scenario_id)
            ap = airports(request).get(spec.airport_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=f"not found: {exc}") from None
        return compare_controllers(ap, spec, seed=seed, primary=primary, secondary=secondary)

    @app.get("/api/report", response_class=HTMLResponse)
    def evaluation_report(
        request: Request,
        scenario_id: str = "crossing_runways_incursion",
        seed: int | None = None,
    ) -> HTMLResponse:
        try:
            spec = scenarios(request).get(scenario_id)
            ap = airports(request).get(spec.airport_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=f"not found: {exc}") from None
        frames = simulate_run(ap, spec, controller="proactive_ai", seed=seed)
        comp = compare_controllers(ap, spec, seed=seed)
        html_doc = render_evaluation_report_html(spec, frames[-1], comp)
        return HTMLResponse(content=html_doc)

    @app.websocket("/ws/sim")
    async def ws_sim(websocket: WebSocket) -> None:
        await websocket.accept()
        scenario_id = websocket.query_params.get("scenario_id", "crossing_runways_incursion")
        ctrl_raw = websocket.query_params.get("controller", "proactive_ai")
        controller: Literal["proactive_ai", "baseline_rule"] = (
            "baseline_rule" if ctrl_raw == "baseline_rule" else "proactive_ai"
        )
        seed_str = websocket.query_params.get("seed")
        seed = int(seed_str) if seed_str and seed_str.isdigit() else None

        ap_reg: AirportRegistry = websocket.app.state.airports
        sc_reg: ScenarioRegistry = websocket.app.state.scenarios
        spec = sc_reg.get(scenario_id)
        ap = ap_reg.get(spec.airport_id)
        frames = simulate_run(ap, spec, controller=controller, seed=seed)

        idx = 0
        await websocket.send_json({"type": "frame", "frame": frames[idx].model_dump(mode="json")})
        try:
            while True:
                msg = await websocket.receive_json()
                cmd = msg.get("cmd")
                if cmd == "step":
                    delta = int(msg.get("delta", 1))
                    idx = max(0, min(len(frames) - 1, idx + delta))
                elif cmd == "seek":
                    target_ms = int(msg.get("time_ms", 0))
                    idx = max(0, min(len(frames) - 1, round(target_ms / 1000)))
                elif cmd == "reset":
                    idx = 0
                await websocket.send_json(
                    {"type": "frame", "frame": frames[idx].model_dump(mode="json")}
                )
        except WebSocketDisconnect:
            return

    return app


app = create_app()
