"""Small, dependency-free planar geometry helpers.

All simulator geometry runs in a local tangent plane: metres, x = east,
y = north, origin = the airport reference point. Over an airport-sized area
(tens of km) an equirectangular projection has errors well under a metre per
kilometre, which is fine for a simulator. A real deployment would use a proper
geodesic library; that is out of scope here.
"""

from __future__ import annotations

import math

EARTH_RADIUS_M = 6_371_008.8

Point = tuple[float, float]


def project(lon: float, lat: float, ref_lon: float, ref_lat: float) -> Point:
    """WGS84 lon/lat (degrees) -> local metres (x east, y north)."""
    x = math.radians(lon - ref_lon) * EARTH_RADIUS_M * math.cos(math.radians(ref_lat))
    y = math.radians(lat - ref_lat) * EARTH_RADIUS_M
    return (x, y)


def unproject(x: float, y: float, ref_lon: float, ref_lat: float) -> tuple[float, float]:
    """Local metres -> WGS84 (lon, lat) in degrees. Inverse of :func:`project`."""
    lat = ref_lat + math.degrees(y / EARTH_RADIUS_M)
    lon = ref_lon + math.degrees(x / (EARTH_RADIUS_M * math.cos(math.radians(ref_lat))))
    return (lon, lat)


def sub(a: Point, b: Point) -> Point:
    return (a[0] - b[0], a[1] - b[1])


def add(a: Point, b: Point) -> Point:
    return (a[0] + b[0], a[1] + b[1])


def scale(a: Point, k: float) -> Point:
    return (a[0] * k, a[1] * k)


def length(a: Point) -> float:
    return math.hypot(a[0], a[1])


def distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def unit(a: Point) -> Point:
    n = length(a)
    if n == 0:
        raise ValueError("zero-length vector")
    return (a[0] / n, a[1] / n)


def bearing_deg(a: Point, b: Point) -> float:
    """True bearing from a to b, degrees in [0, 360). 0 = north, 90 = east."""
    dx, dy = sub(b, a)
    return math.degrees(math.atan2(dx, dy)) % 360.0


def heading_vector(heading_deg: float) -> Point:
    r = math.radians(heading_deg)
    return (math.sin(r), math.cos(r))


def angle_diff_deg(a: float, b: float) -> float:
    """Smallest absolute difference between two headings, in [0, 180]."""
    d = (a - b) % 360.0
    return min(d, 360.0 - d)


def polyline_length(points: list[Point]) -> float:
    return sum(distance(points[i], points[i + 1]) for i in range(len(points) - 1))


def point_segment_distance(p: Point, a: Point, b: Point) -> float:
    ab = sub(b, a)
    denom = ab[0] ** 2 + ab[1] ** 2
    if denom == 0:
        return distance(p, a)
    t = max(0.0, min(1.0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / denom))
    return distance(p, (a[0] + t * ab[0], a[1] + t * ab[1]))


def point_line_distance(p: Point, a: Point, b: Point) -> float:
    """Perpendicular distance from p to the infinite line through a and b."""
    ab = sub(b, a)
    return abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / length(ab)


def segments_intersect(p1: Point, p2: Point, q1: Point, q2: Point) -> bool:
    def orient(a: Point, b: Point, c: Point) -> float:
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    def on_seg(a: Point, b: Point, c: Point) -> bool:
        return (
            min(a[0], b[0]) - 1e-9 <= c[0] <= max(a[0], b[0]) + 1e-9
            and min(a[1], b[1]) - 1e-9 <= c[1] <= max(a[1], b[1]) + 1e-9
        )

    d1, d2 = orient(q1, q2, p1), orient(q1, q2, p2)
    d3, d4 = orient(p1, p2, q1), orient(p1, p2, q2)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and d1 and d2 and d3 and d4:
        return True
    eps = 1e-9
    return (
        (abs(d1) < eps and on_seg(q1, q2, p1))
        or (abs(d2) < eps and on_seg(q1, q2, p2))
        or (abs(d3) < eps and on_seg(p1, p2, q1))
        or (abs(d4) < eps and on_seg(p1, p2, q2))
    )


def polyline_intersects_segment(points: list[Point], a: Point, b: Point) -> bool:
    return any(segments_intersect(points[i], points[i + 1], a, b) for i in range(len(points) - 1))


def runway_polygon(a: Point, b: Point, width_m: float) -> list[Point]:
    """Rectangle around centerline a->b, counter-clockwise, closed (first == last)."""
    d = unit(sub(b, a))
    n = (-d[1] * width_m / 2.0, d[0] * width_m / 2.0)
    ring = [sub(a, n), sub(b, n), add(b, n), add(a, n)]
    return [*ring, ring[0]]
