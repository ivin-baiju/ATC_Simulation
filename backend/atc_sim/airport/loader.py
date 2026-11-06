"""Load and validate airport layouts from GeoJSON.

File format (a GeoJSON FeatureCollection with one foreign member, ``airport``)::

    {
      "type": "FeatureCollection",
      "airport": {
        "id": "xgen", "icao": "XGEN", "name": "Genfield (fictional)",
        "fictional": true,
        "reference": {"lat": 52.0, "lon": -30.0, "elevation_ft": 120},
        "magnetic_variation_deg": 0
      },
      "features": [ ... ]
    }

Each feature has ``properties.kind`` and a fixed geometry type:

==============  ============  ==================================================
kind            geometry      required properties
==============  ============  ==================================================
``runway``      LineString    ``designators`` [first, second], ``width_m``.
                (2 points)    Point 0 is the threshold of ``designators[0]``.
``taxiway``     LineString    ``name``, ``width_m``
``apron``       Polygon       ``name``
``gate``        Point         ``name``, ``heading_deg``
``hold_short``  LineString    ``runway`` (runway id, e.g. ``"09/27"``),
                (2 points)    ``taxiway`` (taxiway name). Must cross it.
``fix``         Point         ``name``, ``role`` (arrival|departure),
                              optional ``altitude_ft``
==============  ============  ==================================================

All problems in a file are collected and reported together, so an author can
fix a layout in one pass.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from . import geo
from .models import (
    Airport,
    AirportSummary,
    Apron,
    Bounds,
    Fix,
    Gate,
    HoldShort,
    Reference,
    Runway,
    RunwayEnd,
    Taxiway,
)

DEFAULT_AIRPORTS_DIR = Path(__file__).resolve().parent.parent / "data" / "airports"

GEOMETRY_FOR_KIND = {
    "runway": "LineString",
    "taxiway": "LineString",
    "apron": "Polygon",
    "gate": "Point",
    "hold_short": "LineString",
    "fix": "Point",
}

DESIGNATOR_RE = re.compile(r"^(0[1-9]|[12][0-9]|3[0-6])([LCR]?)$")
OPPOSITE_SUFFIX = {"": "", "L": "R", "R": "L", "C": "C"}

MAX_SURFACE_RADIUS_M = 20_000.0
MAX_FIX_RADIUS_M = 250_000.0
MIN_RUNWAY_LENGTH_M = 300.0
HEADING_TOLERANCE_DEG = 10.0


class AirportValidationError(ValueError):
    """A layout file is malformed. ``errors`` lists every problem found."""

    def __init__(self, source: str, errors: list[str]) -> None:
        self.source = source
        self.errors = errors
        bullet = "\n  - "
        super().__init__(f"{source}: {len(errors)} problem(s):{bullet}{bullet.join(errors)}")


def _designator_number(d: str) -> int:
    m = DESIGNATOR_RE.match(d)
    assert m is not None
    return int(m.group(1))


def runway_id(designators: tuple[str, str]) -> str:
    a, b = designators
    return f"{a}/{b}" if _designator_number(a) < _designator_number(b) else f"{b}/{a}"


class _Ctx:
    def __init__(self, source: str) -> None:
        self.source = source
        self.errors: list[str] = []

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")


def _num(
    ctx: _Ctx, where: str, props: dict[str, Any], key: str, *, positive: bool = False
) -> float:
    v = props.get(key)
    if isinstance(v, bool) or not isinstance(v, int | float):
        ctx.err(where, f"'{key}' must be a number, got {v!r}")
        return 0.0
    if positive and v <= 0:
        ctx.err(where, f"'{key}' must be > 0, got {v}")
    return float(v)


def _str(ctx: _Ctx, where: str, props: dict[str, Any], key: str) -> str:
    v = props.get(key)
    if not isinstance(v, str) or not v.strip():
        ctx.err(where, f"'{key}' must be a non-empty string, got {v!r}")
        return ""
    return v.strip()


def _coords(ctx: _Ctx, where: str, raw: Any) -> list[tuple[float, float]] | None:
    if not isinstance(raw, list) or not raw:
        ctx.err(where, "coordinates must be a non-empty list")
        return None
    out: list[tuple[float, float]] = []
    for c in raw:
        ok = (
            isinstance(c, list | tuple)
            and len(c) >= 2
            and all(isinstance(v, int | float) and not isinstance(v, bool) for v in c[:2])
        )
        if not ok:
            ctx.err(where, f"bad coordinate {c!r}; expected [lon, lat]")
            return None
        lon, lat = float(c[0]), float(c[1])
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            ctx.err(where, f"coordinate out of range: lon={lon}, lat={lat}")
            return None
        out.append((lon, lat))
    return out


def parse_airport(data: Any, source: str = "<memory>") -> Airport:
    """Validate a decoded GeoJSON document and return the normalized :class:`Airport`."""
    ctx = _Ctx(source)
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise AirportValidationError(source, ["top level must be a GeoJSON FeatureCollection"])

    meta = data.get("airport")
    if not isinstance(meta, dict):
        raise AirportValidationError(source, ["missing 'airport' metadata object"])
    ref_raw = meta.get("reference")
    try:
        ref = Reference.model_validate(ref_raw)
    except Exception as exc:
        raise AirportValidationError(source, [f"airport.reference invalid: {exc}"]) from exc

    airport_id = _str(ctx, "airport", meta, "id")
    icao = _str(ctx, "airport", meta, "icao")
    name = _str(ctx, "airport", meta, "name")
    if airport_id and not re.fullmatch(r"[a-z0-9_\-]+", airport_id):
        ctx.err("airport", f"id must be lowercase [a-z0-9_-], got {airport_id!r}")
    magvar = meta.get("magnetic_variation_deg", 0.0)
    if isinstance(magvar, bool) or not isinstance(magvar, int | float) or abs(magvar) > 60:
        ctx.err("airport", f"magnetic_variation_deg must be a number in [-60, 60], got {magvar!r}")
        magvar = 0.0

    features = data.get("features")
    if not isinstance(features, list):
        raise AirportValidationError(source, ["'features' must be a list"])

    def proj(pts: list[tuple[float, float]]) -> list[geo.Point]:
        # Centimetre rounding keeps API output stable and readable.
        out = []
        for lon, lat in pts:
            x, y = geo.project(lon, lat, ref.lon, ref.lat)
            out.append((round(x, 2), round(y, 2)))
        return out

    runways: list[Runway] = []
    taxiways: list[Taxiway] = []
    aprons: list[Apron] = []
    gates: list[Gate] = []
    fixes: list[Fix] = []
    pending_holds: list[tuple[str, str, str, str, tuple[geo.Point, geo.Point]]] = []
    seen_ids: set[str] = set()
    seen_names: dict[str, set[str]] = {k: set() for k in GEOMETRY_FOR_KIND}

    for i, feat in enumerate(features):
        where = f"features[{i}]"
        if not isinstance(feat, dict) or feat.get("type") != "Feature":
            ctx.err(where, "not a GeoJSON Feature")
            continue
        props = feat.get("properties") or {}
        kind = props.get("kind")
        if kind not in GEOMETRY_FOR_KIND:
            ctx.err(where, f"unknown kind {kind!r}; expected one of {sorted(GEOMETRY_FOR_KIND)}")
            continue
        geom = feat.get("geometry") or {}
        if geom.get("type") != GEOMETRY_FOR_KIND[kind]:
            ctx.err(
                where, f"{kind} needs {GEOMETRY_FOR_KIND[kind]} geometry, got {geom.get('type')!r}"
            )
            continue

        label = props.get("name") or props.get("designators") or feat.get("id") or i
        where = f"{kind} {label!r}"

        fid_raw = feat.get("id")
        if kind in ("runway", "hold_short"):
            fid = str(fid_raw) if fid_raw is not None else f"{kind}:{i}"
        else:
            fid = str(fid_raw) if fid_raw is not None else f"{kind}:{props.get('name', i)}"
        if fid in seen_ids:
            ctx.err(where, f"duplicate feature id {fid!r}")
        seen_ids.add(fid)

        nm = props.get("name")
        if isinstance(nm, str) and kind != "runway":
            if nm in seen_names[kind]:
                ctx.err(where, f"duplicate {kind} name {nm!r}")
            seen_names[kind].add(nm)

        if geom["type"] == "Polygon":
            rings = geom.get("coordinates")
            if not isinstance(rings, list) or not rings:
                ctx.err(where, "polygon needs at least one ring")
                continue
            raw_pts = _coords(ctx, where, rings[0])
        elif geom["type"] == "Point":
            raw_pts = _coords(ctx, where, [geom.get("coordinates")])
        else:
            raw_pts = _coords(ctx, where, geom.get("coordinates"))
        if raw_pts is None:
            continue
        pts = proj(raw_pts)

        limit = MAX_FIX_RADIUS_M if kind == "fix" else MAX_SURFACE_RADIUS_M
        far = max(geo.length(p) for p in pts)
        if far > limit:
            ctx.err(
                where, f"{far / 1000:.1f} km from the reference point (limit {limit / 1000:.0f} km)"
            )
            continue

        if kind == "runway":
            des = props.get("designators")
            if (
                not isinstance(des, list)
                or len(des) != 2
                or not all(isinstance(d, str) and DESIGNATOR_RE.match(d) for d in des)
            ):
                ctx.err(
                    where,
                    f"'designators' must be two runway designators like ['09','27'], got {des!r}",
                )
                continue
            width = _num(ctx, where, props, "width_m", positive=True)
            if len(pts) != 2:
                ctx.err(where, f"runway centerline must have exactly 2 points, got {len(pts)}")
                continue
            a, b = pts
            rlen = geo.distance(a, b)
            if rlen < MIN_RUNWAY_LENGTH_M:
                ctx.err(
                    where, f"runway is only {rlen:.0f} m long (min {MIN_RUNWAY_LENGTH_M:.0f} m)"
                )
                continue
            d0, d1 = des[0], des[1]
            m0, m1 = DESIGNATOR_RE.match(d0), DESIGNATOR_RE.match(d1)
            assert m0 and m1
            n0, n1 = int(m0.group(1)), int(m1.group(1))
            if (n0 + 18 - 1) % 36 + 1 != n1:
                ctx.err(where, f"designators {d0}/{d1} are not reciprocal (must differ by 18)")
            if OPPOSITE_SUFFIX[m0.group(2)] != m1.group(2):
                ctx.err(where, f"designator suffixes {d0}/{d1} do not pair (L<->R, C<->C)")
            hdg0 = geo.bearing_deg(a, b)
            hdg1 = geo.bearing_deg(b, a)
            magnetic0 = (hdg0 - float(magvar)) % 360
            expected0 = (n0 * 10) % 360
            if geo.angle_diff_deg(magnetic0, expected0) > HEADING_TOLERANCE_DEG:
                ctx.err(
                    where,
                    f"geometry heading {magnetic0:.0f} deg (magnetic) does not match designator "
                    f"{d0} (~{expected0:03d} deg); is the coordinate order reversed?",
                )
            runways.append(
                Runway(
                    id=runway_id((d0, d1)),
                    ends=(
                        RunwayEnd(designator=d0, threshold=a, heading_deg=round(hdg0, 2)),
                        RunwayEnd(designator=d1, threshold=b, heading_deg=round(hdg1, 2)),
                    ),
                    width_m=width,
                    length_m=round(rlen, 2),
                    centerline=(a, b),
                    polygon=geo.runway_polygon(a, b, width),
                )
            )
        elif kind == "taxiway":
            name_ = _str(ctx, where, props, "name")
            width = _num(ctx, where, props, "width_m", positive=True)
            if len(pts) < 2:
                ctx.err(where, "taxiway centerline needs at least 2 points")
                continue
            taxiways.append(Taxiway(id=fid, name=name_, width_m=width, centerline=pts))
        elif kind == "apron":
            name_ = _str(ctx, where, props, "name")
            if len(pts) < 4 or pts[0] != pts[-1]:
                ctx.err(
                    where, "apron polygon ring must be closed and have at least 3 distinct points"
                )
                continue
            aprons.append(Apron(id=fid, name=name_, polygon=pts))
        elif kind == "gate":
            name_ = _str(ctx, where, props, "name")
            hdg = _num(ctx, where, props, "heading_deg") % 360
            gates.append(Gate(id=fid, name=name_, position=pts[0], heading_deg=hdg))
        elif kind == "fix":
            name_ = _str(ctx, where, props, "name")
            role = props.get("role")
            if role not in ("arrival", "departure"):
                ctx.err(where, f"'role' must be 'arrival' or 'departure', got {role!r}")
                continue
            alt = props.get("altitude_ft")
            if alt is not None and (isinstance(alt, bool) or not isinstance(alt, int | float)):
                ctx.err(where, f"'altitude_ft' must be a number, got {alt!r}")
                alt = None
            fixes.append(
                Fix(
                    id=fid,
                    name=name_,
                    role=role,
                    position=pts[0],
                    altitude_ft=float(alt) if alt is not None else None,
                )
            )
        elif kind == "hold_short":
            rwy = _str(ctx, where, props, "runway")
            twy = _str(ctx, where, props, "taxiway")
            if len(pts) != 2:
                ctx.err(where, "hold_short line must have exactly 2 points")
                continue
            pending_holds.append((fid, where, rwy, twy, (pts[0], pts[1])))

    # Cross-reference checks need every runway/taxiway parsed first.
    rwy_by_id = {r.id: r for r in runways}
    if len(rwy_by_id) != len(runways):
        ctx.err("runways", "duplicate runway ids")
    twy_by_name = {t.name: t for t in taxiways}
    hold_shorts: list[HoldShort] = []
    for fid, where, rwy, twy, line in pending_holds:
        r = rwy_by_id.get(rwy)
        t = twy_by_name.get(twy)
        if r is None:
            ctx.err(where, f"references unknown runway {rwy!r} (known: {sorted(rwy_by_id)})")
        if t is None:
            ctx.err(where, f"references unknown taxiway {twy!r}")
        if r is None or t is None:
            continue
        if not geo.polyline_intersects_segment(t.centerline, *line):
            ctx.err(where, f"line does not cross taxiway {twy!r} centerline")
        mid = geo.scale(geo.add(*line), 0.5)
        clearance = geo.point_segment_distance(mid, *r.centerline) - r.width_m / 2
        if clearance <= 0:
            ctx.err(
                where, f"hold-short line lies on runway {rwy} (must be outside the runway edge)"
            )
        hold_shorts.append(HoldShort(id=fid, runway=rwy, taxiway=twy, line=line))

    if not runways:
        ctx.err("airport", "layout has no runways")

    if ctx.errors:
        raise AirportValidationError(source, ctx.errors)

    surface_pts: list[geo.Point] = [p for r in runways for p in r.polygon]
    surface_pts += [p for t in taxiways for p in t.centerline]
    surface_pts += [p for a in aprons for p in a.polygon]
    surface_pts += [g.position for g in gates]
    bounds_surface = Bounds.of(surface_pts, pad_m=60.0)
    bounds_all = Bounds.of(surface_pts + [f.position for f in fixes], pad_m=500.0)

    return Airport(
        id=airport_id,
        icao=icao,
        name=name,
        fictional=bool(meta.get("fictional", False)),
        reference=ref,
        magnetic_variation_deg=float(magvar),
        runways=runways,
        taxiways=taxiways,
        aprons=aprons,
        gates=gates,
        hold_shorts=hold_shorts,
        fixes=fixes,
        bounds_surface=bounds_surface,
        bounds_all=bounds_all,
    )


def load_airport(path: str | Path) -> Airport:
    p = Path(path)
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise AirportValidationError(str(p), [f"invalid JSON: {exc}"]) from exc
    return parse_airport(data, source=p.name)


class AirportRegistry:
    """Discovers ``*.geojson`` layouts in a directory and caches parsed airports."""

    def __init__(self, directory: str | Path = DEFAULT_AIRPORTS_DIR) -> None:
        self.directory = Path(directory)
        self._airports: dict[str, Airport] = {}
        self.reload()

    def reload(self) -> None:
        airports: dict[str, Airport] = {}
        for path in sorted(self.directory.glob("*.geojson")):
            ap = load_airport(path)
            if ap.id in airports:
                raise AirportValidationError(path.name, [f"airport id {ap.id!r} already defined"])
            airports[ap.id] = ap
        self._airports = airports

    def __iter__(self) -> Iterator[Airport]:
        return iter(self._airports.values())

    def __len__(self) -> int:
        return len(self._airports)

    def ids(self) -> list[str]:
        return list(self._airports)

    def get(self, airport_id: str) -> Airport:
        return self._airports[airport_id]

    def summaries(self) -> list[AirportSummary]:
        return [a.summary() for a in self._airports.values()]
