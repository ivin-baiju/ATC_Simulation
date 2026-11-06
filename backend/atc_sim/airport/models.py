"""Normalized airport layout model served to the simulator and the UI.

Every coordinate here is in local metres (x = east, y = north) relative to the
airport reference point. The raw GeoJSON (lon/lat) never leaves the loader.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Point = tuple[float, float]

# x east, y north, metres, origin = reference point
COORDINATE_SYSTEM: Literal["local-enu-m"] = "local-enu-m"


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Reference(_Frozen):
    lat: float = Field(ge=-85, le=85)
    lon: float = Field(ge=-180, le=180)
    elevation_ft: float = 0.0


class Bounds(_Frozen):
    min_x: float
    min_y: float
    max_x: float
    max_y: float

    @classmethod
    def of(cls, points: list[Point], pad_m: float = 0.0) -> Bounds:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        return cls(
            min_x=min(xs) - pad_m,
            min_y=min(ys) - pad_m,
            max_x=max(xs) + pad_m,
            max_y=max(ys) + pad_m,
        )


class RunwayEnd(_Frozen):
    designator: str
    threshold: Point
    heading_deg: float = Field(description="True heading when using the runway from this end")


class Runway(_Frozen):
    id: str = Field(description="e.g. '09/27', lower designator first")
    ends: tuple[RunwayEnd, RunwayEnd]
    width_m: float
    length_m: float
    centerline: tuple[Point, Point]
    polygon: list[Point]


class Taxiway(_Frozen):
    id: str
    name: str
    width_m: float
    centerline: list[Point]


class Apron(_Frozen):
    id: str
    name: str
    polygon: list[Point]


class Gate(_Frozen):
    id: str
    name: str
    position: Point
    heading_deg: float


class HoldShort(_Frozen):
    id: str
    runway: str
    taxiway: str
    line: tuple[Point, Point]


class Fix(_Frozen):
    id: str
    name: str
    role: Literal["arrival", "departure"]
    position: Point
    altitude_ft: float | None = None


class Airport(_Frozen):
    id: str
    icao: str
    name: str
    fictional: bool
    coordinate_system: Literal["local-enu-m"] = COORDINATE_SYSTEM
    reference: Reference
    magnetic_variation_deg: float = 0.0
    runways: list[Runway]
    taxiways: list[Taxiway]
    aprons: list[Apron]
    gates: list[Gate]
    hold_shorts: list[HoldShort]
    fixes: list[Fix]
    bounds_surface: Bounds = Field(description="Runways, taxiways, aprons, gates")
    bounds_all: Bounds = Field(description="Surface plus arrival/departure fixes")

    def runway(self, runway_id: str) -> Runway:
        for r in self.runways:
            if r.id == runway_id:
                return r
        raise KeyError(runway_id)

    def summary(self) -> AirportSummary:
        return AirportSummary(
            id=self.id,
            icao=self.icao,
            name=self.name,
            fictional=self.fictional,
            runways=[r.id for r in self.runways],
            taxiway_count=len(self.taxiways),
            gate_count=len(self.gates),
            fix_count=len(self.fixes),
        )


class AirportSummary(_Frozen):
    id: str
    icao: str
    name: str
    fictional: bool
    runways: list[str]
    taxiway_count: int
    gate_count: int
    fix_count: int
