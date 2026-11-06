"""Generate the bundled sample airport GeoJSON files.

Layouts are authored here in local metres (x east, y north) so the geometry is
easy to reason about, then written as WGS84 GeoJSON, the format the loader reads
and the format a real airport layout would arrive in.

Hold-short lines are placed automatically where each listed taxiway is
``HOLD_DISTANCE_M`` (perpendicular) from the runway centerline.

Usage::

    uv run python scripts/make_sample_airports.py           # write files
    uv run python scripts/make_sample_airports.py --check   # fail if files are stale
"""

from __future__ import annotations

import argparse
import itertools
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from atc_sim.airport import geo
from atc_sim.airport.loader import DEFAULT_AIRPORTS_DIR, runway_id

Point = geo.Point

HOLD_DISTANCE_M = 90.0
TWY_WIDTH_M = 23.0
RWY_WIDTH_M = 45.0


@dataclass
class Layout:
    id: str
    icao: str
    name: str
    ref_lat: float
    ref_lon: float
    elevation_ft: float
    runways: list[tuple[tuple[str, str], Point, Point, float]] = field(default_factory=list)
    taxiways: list[tuple[str, list[Point], float]] = field(default_factory=list)
    aprons: list[tuple[str, list[Point]]] = field(default_factory=list)
    gates: list[tuple[str, Point, float]] = field(default_factory=list)
    fixes: list[tuple[str, str, Point, float | None]] = field(default_factory=list)
    holds: list[tuple[str, str]] = field(default_factory=list)  # (taxiway name, runway id)


def _along(a: Point, b: Point, t: float) -> Point:
    """Point t metres from a toward b."""
    return geo.add(a, geo.scale(geo.unit(geo.sub(b, a)), t))


def hold_short_points(
    taxiway: list[Point], rwy_a: Point, rwy_b: Point, dist: float
) -> list[tuple[Point, Point]]:
    """Points on the taxiway where it is ``dist`` m from the runway centerline,
    within the runway's length, plus the local taxiway direction there."""
    d = geo.unit(geo.sub(rwy_b, rwy_a))
    n = (d[1], -d[0])
    rlen = geo.distance(rwy_a, rwy_b)
    out: list[tuple[Point, Point]] = []
    for p, q in itertools.pairwise(taxiway):
        sp = geo.sub(p, rwy_a)
        sq = geo.sub(q, rwy_a)
        dp = sp[0] * n[0] + sp[1] * n[1]
        dq = sq[0] * n[0] + sq[1] * n[1]
        for target in (dist, -dist):
            if (dp - target) * (dq - target) < 0:
                t = (target - dp) / (dq - dp)
                pt = (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))
                s = geo.sub(pt, rwy_a)
                along = s[0] * d[0] + s[1] * d[1]
                if -200 <= along <= rlen + 200:
                    out.append((pt, geo.unit(geo.sub(q, p))))
    return out


def genfield() -> Layout:
    """Two crossing runways (09/27 and 04/22), parallel taxiways, 8 gates."""
    lay = Layout("genfield", "XGEN", "Genfield International (fictional)", 52.0, -30.0, 120.0)

    # Runway 09/27: 3000 m east-west through the origin.
    r09 = (-1500.0, 0.0)
    r27 = (1500.0, 0.0)
    # Runway 04/22: 2200 m on true 040, crossing 09/27 at (600, 0).
    d22 = geo.heading_vector(40.0)
    cross = (600.0, 0.0)

    def on22(t: float, offset: float = 0.0) -> Point:
        perp_nw = (-d22[1], d22[0])  # left of 040 = north-west side
        return geo.add(geo.add(cross, geo.scale(d22, t)), geo.scale(perp_nw, offset))

    r04 = on22(-1100)
    r22 = on22(1100)
    lay.runways = [(("09", "27"), r09, r27, RWY_WIDTH_M), (("04", "22"), r04, r22, RWY_WIDTH_M)]

    # Taxiway A: north parallel to 09/27, crosses runway 04/22.
    a_y = 180.0
    lay.taxiways.append(("A", [(-1500.0, a_y), (1500.0, a_y)], TWY_WIDTH_M))
    for i, x in enumerate([-1500.0, -700.0, 0.0, 1100.0, 1500.0], start=1):
        lay.taxiways.append((f"A{i}", [(x, a_y), (x, 0.0)], TWY_WIDTH_M))
        lay.holds.append((f"A{i}", "09/27"))
    lay.holds.append(("A", "04/22"))

    # Taxiway B: parallel to 04/22, 250 m on its north-west side, joining A.
    b_off = 250.0
    # Solve for where B meets A (y = a_y).
    t_join = (a_y - on22(0, b_off)[1]) / d22[1]
    lay.taxiways.append(("B", [on22(t_join, b_off), on22(1100, b_off)], TWY_WIDTH_M))
    lay.taxiways.append(("B1", [on22(1100, b_off), on22(1100)], TWY_WIDTH_M))
    lay.taxiways.append(("B2", [on22(500, b_off), on22(500)], TWY_WIDTH_M))
    lay.holds += [("B1", "04/22"), ("B2", "04/22")]

    # Taxiway C: from A south across 09/27 to the runway 04 threshold area.
    c_x = -300.0
    c_end = on22(-1060, 200)
    lay.taxiways.append(("C", [(c_x, a_y), (c_x, c_end[1]), c_end], TWY_WIDTH_M))
    lay.taxiways.append(("C1", [c_end, on22(-1060)], TWY_WIDTH_M))
    lay.holds += [("C", "09/27"), ("C1", "04/22")]

    # Apron, taxilane L and stub connectors J1/J2 down to A.
    lay.aprons.append(
        ("Main apron", [(-920, 250), (320, 250), (320, 440), (-920, 440), (-920, 250)])
    )
    lay.taxiways.append(("L", [(-900.0, 300.0), (300.0, 300.0)], 20.0))
    lay.taxiways.append(("J1", [(-600.0, 300.0), (-600.0, a_y)], TWY_WIDTH_M))
    lay.taxiways.append(("J2", [(100.0, 300.0), (100.0, a_y)], TWY_WIDTH_M))
    lay.gates = [(f"G{i + 1}", (-850.0 + 150.0 * i, 385.0), 0.0) for i in range(8)]

    lay.fixes = [
        ("KILNO", "arrival", (-16000.0, 1500.0), 4000.0),
        ("MUREX", "arrival", (12000.0, 10500.0), 5000.0),
        ("TOPAZ", "arrival", (-6500.0, -13000.0), 4000.0),
        ("VEXAR", "departure", (16000.0, -4000.0), 6000.0),
        ("ORBIT", "departure", (1500.0, 16000.0), 6000.0),
        ("DUNLO", "departure", (-14000.0, 9000.0), 6000.0),
    ]
    return lay


def sample_single() -> Layout:
    """Minimal single-runway field (18/36) used for quick tests and demos."""
    lay = Layout("sample_single", "XSGL", "Singleton Regional (fictional)", 46.0, -40.0, 40.0)
    s, n = (0.0, -1250.0), (0.0, 1250.0)
    lay.runways = [(("36", "18"), s, n, RWY_WIDTH_M)]  # point 0 = threshold of 36 (south end)
    a_x = 180.0
    lay.taxiways.append(("A", [(a_x, -1250.0), (a_x, 1250.0)], TWY_WIDTH_M))
    for i, y in enumerate([-1250.0, -400.0, 400.0, 1250.0], start=1):
        lay.taxiways.append((f"A{i}", [(a_x, y), (0.0, y)], TWY_WIDTH_M))
        lay.holds.append((f"A{i}", "18/36"))
    lay.aprons.append(("Apron", [(260, -300), (420, -300), (420, 300), (260, 300), (260, -300)]))
    lay.taxiways.append(("L", [(300.0, -300.0), (300.0, 300.0)], 20.0))
    lay.taxiways.append(("J1", [(300.0, -200.0), (a_x, -200.0)], TWY_WIDTH_M))
    lay.taxiways.append(("J2", [(300.0, 200.0), (a_x, 200.0)], TWY_WIDTH_M))
    lay.gates = [(f"G{i + 1}", (385.0, -225.0 + 150.0 * i), 90.0) for i in range(4)]
    lay.fixes = [
        ("PELAN", "arrival", (0.0, 16000.0), 4000.0),
        ("RUDOK", "departure", (3000.0, -15000.0), 5000.0),
    ]
    return lay


def to_geojson(lay: Layout) -> dict[str, Any]:
    def ll(p: Point) -> list[float]:
        lon, lat = geo.unproject(p[0], p[1], lay.ref_lon, lay.ref_lat)
        return [round(lon, 8), round(lat, 8)]

    feats: list[dict[str, Any]] = []

    def feat(fid: str, geom_type: str, coords: Any, **props: Any) -> None:
        feats.append(
            {
                "type": "Feature",
                "id": fid,
                "geometry": {"type": geom_type, "coordinates": coords},
                "properties": props,
            }
        )

    rwy_geom: dict[str, tuple[Point, Point]] = {}
    for des, a, b, w in lay.runways:
        rid = runway_id(des)
        rwy_geom[rid] = (a, b)
        feat(
            f"RWY-{rid.replace('/', '-')}",
            "LineString",
            [ll(a), ll(b)],
            kind="runway",
            designators=list(des),
            width_m=w,
        )
    twy_geom: dict[str, tuple[list[Point], float]] = {}
    for name, pts, w in lay.taxiways:
        twy_geom[name] = (pts, w)
        feat(
            f"TWY-{name}", "LineString", [ll(p) for p in pts], kind="taxiway", name=name, width_m=w
        )
    for name, ring in lay.aprons:
        feat(
            f"APRON-{name.replace(' ', '-').upper()}",
            "Polygon",
            [[ll(p) for p in ring]],
            kind="apron",
            name=name,
        )
    for name, pos, hdg in lay.gates:
        feat(f"GATE-{name}", "Point", ll(pos), kind="gate", name=name, heading_deg=hdg)
    for twy, rid in lay.holds:
        pts, w = twy_geom[twy]
        a, b = rwy_geom[rid]
        found = hold_short_points(pts, a, b, HOLD_DISTANCE_M)
        if not found:
            raise SystemExit(f"no hold-short position found for {twy} / {rid}")
        for k, (pt, direction) in enumerate(found, start=1):
            half = (w + 6.0) / 2.0
            perp = (-direction[1], direction[0])
            p1 = geo.add(pt, geo.scale(perp, half))
            p2 = geo.sub(pt, geo.scale(perp, half))
            feat(
                f"HS-{twy}-{rid.replace('/', '-')}-{k}",
                "LineString",
                [ll(p1), ll(p2)],
                kind="hold_short",
                runway=rid,
                taxiway=twy,
            )
    for name, role, pos, alt in lay.fixes:
        feat(f"FIX-{name}", "Point", ll(pos), kind="fix", name=name, role=role, altitude_ft=alt)

    return {
        "type": "FeatureCollection",
        "airport": {
            "id": lay.id,
            "icao": lay.icao,
            "name": lay.name,
            "fictional": True,
            "reference": {"lat": lay.ref_lat, "lon": lay.ref_lon, "elevation_ft": lay.elevation_ft},
            "magnetic_variation_deg": 0.0,
            "notes": "Generated by backend/scripts/make_sample_airports.py. Fictional location.",
        },
        "features": feats,
    }


def render(lay: Layout) -> str:
    return json.dumps(to_geojson(lay), indent=1) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="exit 1 if bundled files are out of date")
    ap.add_argument("--out", type=Path, default=DEFAULT_AIRPORTS_DIR)
    args = ap.parse_args(argv)

    stale = []
    args.out.mkdir(parents=True, exist_ok=True)
    for lay in (genfield(), sample_single()):
        path = args.out / f"{lay.id}.geojson"
        text = render(lay)
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(path.name)
        else:
            path.write_text(text, encoding="utf-8")
            print(f"wrote {path}")
    if stale:
        print(f"stale: {', '.join(stale)}; run scripts/make_sample_airports.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
