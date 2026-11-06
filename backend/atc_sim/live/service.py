"""Live ADS-B Aircraft Tracker service with real airline identification."""

from __future__ import annotations

import json
import math
import time
import urllib.request

from pydantic import BaseModel, ConfigDict

from ..airport import Airport, geo
from ..sim.models import AircraftState, FlightPhase

AIRLINE_CODES: dict[str, dict[str, str]] = {
    # Indian Airlines
    "AIC": {"airline": "Air India", "country": "India", "callsign": "AIRINDIA"},
    "IGO": {"airline": "IndiGo", "country": "India", "callsign": "IFLY"},
    "VTI": {"airline": "Vistara", "country": "India", "callsign": "VISTARA"},
    "SEJ": {"airline": "SpiceJet", "country": "India", "callsign": "SPICEJET"},
    "AKJ": {"airline": "Akasa Air", "country": "India", "callsign": "AKASA AIR"},
    "AXB": {"airline": "Air India Express", "country": "India", "callsign": "EXPRESS INDIA"},
    # International Major Carriers
    "BAW": {"airline": "British Airways", "country": "United Kingdom", "callsign": "SPEEDBIRD"},
    "VIR": {"airline": "Virgin Atlantic", "country": "United Kingdom", "callsign": "VIRGIN"},
    "EZY": {"airline": "easyJet", "country": "United Kingdom", "callsign": "EASY"},
    "UAL": {"airline": "United Airlines", "country": "United States", "callsign": "UNITED"},
    "DAL": {"airline": "Delta Air Lines", "country": "United States", "callsign": "DELTA"},
    "AAL": {"airline": "American Airlines", "country": "United States", "callsign": "AMERICAN"},
    "SWA": {"airline": "Southwest Airlines", "country": "United States", "callsign": "SOUTHWEST"},
    "UAE": {"airline": "Emirates", "country": "United Arab Emirates", "callsign": "EMIRATES"},
    "ETD": {"airline": "Etihad Airways", "country": "United Arab Emirates", "callsign": "ETIHAD"},
    "QTR": {"airline": "Qatar Airways", "country": "Qatar", "callsign": "QATARI"},
    "SIA": {"airline": "Singapore Airlines", "country": "Singapore", "callsign": "SINGAPORE"},
    "DLH": {"airline": "Lufthansa", "country": "Germany", "callsign": "LUFTHANSA"},
    "AFR": {"airline": "Air France", "country": "France", "callsign": "AIRFRANS"},
    "KLM": {"airline": "KLM Royal Dutch Airlines", "country": "Netherlands", "callsign": "KLM"},
}


class LiveAircraftDetail(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    callsign: str
    icao24: str
    airline: str
    operator_callsign: str
    country: str
    aircraft_type: str
    state: AircraftState
    live: bool = True


class LiveTrafficSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    airport_id: str
    icao: str
    timestamp_s: float
    source: str
    aircraft_count: int
    aircraft: list[LiveAircraftDetail]


def lookup_airline(callsign: str, origin_country: str = "") -> tuple[str, str, str]:
    prefix = callsign[:3].upper() if len(callsign) >= 3 else ""
    info = AIRLINE_CODES.get(prefix)
    if info:
        return info["airline"], info["callsign"], info["country"]
    country = origin_country or "Commercial"
    return f"Flight {callsign.strip()}", callsign.strip(), country


_cache: dict[str, tuple[float, LiveTrafficSnapshot]] = {}
CACHE_TTL_S = 6.0


def fetch_live_traffic(airport: Airport) -> LiveTrafficSnapshot:
    """Fetch live ADS-B state vectors within 60 km of airport reference point."""
    now = time.time()
    cached = _cache.get(airport.id)
    if cached and (now - cached[0]) < CACHE_TTL_S:
        return cached[1]

    ref_lat = airport.reference.lat
    ref_lon = airport.reference.lon
    delta_lat = 0.55  # ~60 km
    cos_lat = max(0.1, math.cos(math.radians(ref_lat)))
    delta_lon = delta_lat / cos_lat

    url = (
        f"https://opensky-network.org/api/states/all?"
        f"lamin={round(ref_lat - delta_lat, 4)}&lomin={round(ref_lon - delta_lon, 4)}&"
        f"lamax={round(ref_lat + delta_lat, 4)}&lomax={round(ref_lon + delta_lon, 4)}"
    )

    states_raw = None
    source = "OpenSky Network (Live ADS-B)"
    try:
        user_agent = "ATC-Sim/0.2 (Research Live Engine)"
        req = urllib.request.Request(url, headers={"User-Agent": user_agent})
        with urllib.request.urlopen(req, timeout=4.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            states_raw = data.get("states")
    except Exception:
        states_raw = None

    results: list[LiveAircraftDetail] = []
    if states_raw:
        for st in states_raw:
            # OpenSky state vector fields:
            # 0: icao24, 1: callsign, 2: origin_country, 5: lon, 6: lat,
            # 7: alt_m, 8: on_ground, 9: vel_m_s, 10: track_deg, 11: vs_m_s
            icao24 = str(st[0])
            raw_cs = (st[1] or "").strip() or f"SK_{icao24[:4].upper()}"
            country = str(st[2] or "")
            lon = st[5]
            lat = st[6]
            if lon is None or lat is None:
                continue

            alt_m = st[7] or 0.0
            alt_ft = max(0.0, alt_m * 3.28084)
            on_ground = bool(st[8])
            vel_mps = st[9] or 0.0
            spd_kts = max(0.0, vel_mps * 1.94384)
            track_deg = float(st[10] or 0.0) % 360.0
            vs_mps = st[11] or 0.0
            vs_fpm = vs_mps * 196.85

            x, y = geo.project(lon, lat, ref_lon, ref_lat)
            dist_to_center = math.hypot(x, y)
            if dist_to_center > 75000:
                continue

            airline_name, op_callsign, ctry = lookup_airline(raw_cs, country)

            phase: FlightPhase
            if on_ground:
                phase = "taxi_in" if spd_kts < 25.0 else "landing_roll"
            elif alt_ft <= airport.reference.elevation_ft + 1500.0 and dist_to_center < 12000:
                phase = "final_approach" if vs_fpm < -100 else "departing"
            elif vs_fpm < -250:
                phase = "final_approach"
            else:
                phase = "departing"

            ac_state = AircraftState(
                callsign=raw_cs,
                aircraft_type="Commercial",
                role="arrival" if vs_fpm <= 0 else "departure",
                phase=phase,
                position=(round(x, 1), round(y, 1)),
                heading_deg=round(track_deg, 1),
                speed_kts=round(spd_kts, 1),
                target_speed_kts=round(spd_kts, 1),
                altitude_ft=round(alt_ft, 0),
                vertical_speed_fpm=round(vs_fpm, 0),
                assigned_runway=airport.runways[0].id if airport.runways else None,
                route=[],
                hold_short_of=None,
                cleared_to_cross=[],
                cleared_takeoff=on_ground and spd_kts > 40,
                cleared_land=not on_ground and alt_ft < 1200,
                separation_ring_m=200.0 if not on_ground else 130.0,
                predicted_trajectory=[
                    (round(x, 1), round(y, 1)),
                    (
                        round(x + math.sin(math.radians(track_deg)) * (spd_kts * 0.514444 * 25), 1),
                        round(y + math.cos(math.radians(track_deg)) * (spd_kts * 0.514444 * 25), 1),
                    ),
                ],
                alert_severity=None,
            )

            results.append(
                LiveAircraftDetail(
                    callsign=raw_cs,
                    icao24=icao24,
                    airline=airline_name,
                    operator_callsign=op_callsign,
                    country=ctry,
                    aircraft_type="Jetliner",
                    state=ac_state,
                    live=True,
                )
            )

    if not results:
        source = "Live Synthetic Schedule (ADS-B Offline Fallback)"
        results = generate_realistic_live_traffic(airport)

    snap = LiveTrafficSnapshot(
        airport_id=airport.id,
        icao=airport.icao,
        timestamp_s=round(now, 1),
        source=source,
        aircraft_count=len(results),
        aircraft=results,
    )
    _cache[airport.id] = (now, snap)
    return snap


def generate_realistic_live_traffic(airport: Airport) -> list[LiveAircraftDetail]:
    """Generates authentic scheduled airline traffic when offline or rate-limited."""
    now = time.time()
    t = int(now) % 3600

    carriers = ["AIC", "IGO", "VTI", "BAW", "UAE", "DLH"]
    if airport.id == "vidp":
        carriers = ["AIC", "IGO", "VTI", "SEJ", "AKJ", "BAW", "UAE", "SIA"]
    elif airport.id == "vabb":
        carriers = ["IGO", "AIC", "VTI", "AKJ", "UAE", "QTR", "BAW"]
    elif airport.id == "egll":
        carriers = ["BAW", "VIR", "EZY", "AIC", "UAL", "DAL", "DLH", "AFR"]
    elif airport.id == "ksfo":
        carriers = ["UAL", "SWA", "DAL", "AAL", "AIC", "BAW", "SIA"]

    out: list[LiveAircraftDetail] = []
    for i, code in enumerate(carriers):
        flight_num = 101 + i * 42 + (int(now) // 300) % 20
        cs = f"{code}{flight_num}"
        airline_name, op_cs, ctry = lookup_airline(cs)

        angle = (i * (360 / len(carriers)) + (t * 0.8)) % 360
        rad = math.radians(angle)
        dist = 9000 + ((i * 3500 + t * 40) % 28000)
        x = math.sin(rad) * dist
        y = math.cos(rad) * dist

        track = (angle + 180 + 15) % 360
        spd = 140.0 + (i * 12) % 60
        alt = max(airport.reference.elevation_ft + 400, (dist / 1000.0) * 260)

        ac_state = AircraftState(
            callsign=cs,
            aircraft_type="A320" if i % 2 == 0 else "B789",
            role="arrival" if i % 3 != 0 else "departure",
            phase="final_approach" if i % 3 != 0 else "departing",
            position=(round(x, 1), round(y, 1)),
            heading_deg=round(track, 1),
            speed_kts=round(spd, 1),
            target_speed_kts=round(spd, 1),
            altitude_ft=round(alt, 0),
            vertical_speed_fpm=-650.0 if i % 3 != 0 else 1800.0,
            assigned_runway=airport.runways[0].id if airport.runways else None,
            route=[],
            hold_short_of=None,
            cleared_to_cross=[],
            cleared_takeoff=i % 3 == 0,
            cleared_land=i % 3 != 0,
            separation_ring_m=200.0,
            predicted_trajectory=[
                (round(x, 1), round(y, 1)),
                (
                    round(x + math.sin(math.radians(track)) * (spd * 0.514444 * 25), 1),
                    round(y + math.cos(math.radians(track)) * (spd * 0.514444 * 25), 1),
                ),
            ],
            alert_severity=None,
        )

        out.append(
            LiveAircraftDetail(
                callsign=cs,
                icao24=f"40{i:02x}{flight_num:02x}",
                airline=airline_name,
                operator_callsign=op_cs,
                country=ctry,
                aircraft_type="Commercial",
                state=ac_state,
                live=False,
            )
        )
    return out
