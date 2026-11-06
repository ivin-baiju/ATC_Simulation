"""Generate real-world airports (DEL, BOM, LHR, SFO) in GeoJSON format."""

import json
import math

from atc_sim.airport import geo
from atc_sim.airport.loader import DEFAULT_AIRPORTS_DIR, runway_id


# 1. Delhi Indira Gandhi International Airport (VIDP / DEL)
# Coordinates: 28.5665° N, 77.1031° E, elevation 777 ft
def vidp_delhi():
    ref_lat, ref_lon = 28.5665, 77.1031

    # Runways 11/29 are ~110 true degrees
    # 110 deg heading vector: x = sin(110), y = cos(110)
    def pt_on_hdg(center, hdg_deg, dist):
        rad = math.radians(hdg_deg)
        return (center[0] + math.sin(rad) * dist, center[1] + math.cos(rad) * dist)

    c_11r = (0.0, -500.0)
    r11r_start = pt_on_hdg(c_11r, 110.0, -2200.0)
    r11r_end = pt_on_hdg(c_11r, 110.0, 2200.0)

    c_11l = (0.0, 900.0)
    r11l_start = pt_on_hdg(c_11l, 110.0, -1900.0)
    r11l_end = pt_on_hdg(c_11l, 110.0, 1900.0)

    c_10 = (0.0, -1800.0)
    r10_start = pt_on_hdg(c_10, 100.0, -1900.0)
    r10_end = pt_on_hdg(c_10, 100.0, 1900.0)

    return {
        "id": "vidp",
        "icao": "VIDP",
        "name": "Indira Gandhi International Airport (Delhi, India)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 777.0,
        "runways": [
            (("11R", "29L"), r11r_start, r11r_end, 60.0),
            (("11L", "29R"), r11l_start, r11l_end, 45.0),
            (("10", "28"), r10_start, r10_end, 45.0),
        ],
        "taxiways": [
            ("A", [(-2000.0, -320.0), (2000.0, -1770.0)], 25.0),
            ("B", [(-1800.0, 1080.0), (1800.0, -220.0)], 25.0),
            ("Z", [(-600.0, 1200.0), (-600.0, -1800.0)], 30.0),
            ("M", [(600.0, 1000.0), (600.0, -1600.0)], 30.0),
        ],
        "aprons": [
            (
                "Terminal 3 International",
                [(-700, 100), (500, 100), (500, 600), (-700, 600), (-700, 100)],
            ),
            (
                "Terminal 1 Domestic",
                [(-400, 1100), (400, 1100), (400, 1500), (-400, 1500), (-400, 1100)],
            ),
        ],
        "gates": [
            ("G-T3-01", (-500.0, 350.0), 180.0),
            ("G-T3-08", (-100.0, 350.0), 180.0),
            ("G-T3-15", (300.0, 350.0), 180.0),
            ("G-T1-01", (-200.0, 1300.0), 180.0),
            ("G-T1-05", (200.0, 1300.0), 180.0),
        ],
        "fixes": [
            ("IBANI", "arrival", (-25000.0, 12000.0), 7000.0),
            ("DRAKO", "arrival", (-18000.0, -18000.0), 6000.0),
            ("GUDUM", "arrival", (22000.0, -15000.0), 5000.0),
            ("BUTOP", "departure", (28000.0, 18000.0), 9000.0),
            ("ALI", "departure", (-20000.0, 24000.0), 8000.0),
        ],
    }


# 2. Mumbai Chhatrapati Shivaji Maharaj International (VABB / BOM)
def vabb_mumbai():
    ref_lat, ref_lon = 19.0896, 72.8656
    # 09/27 is ~090 true
    # 14/32 is ~140 true
    return {
        "id": "vabb",
        "icao": "VABB",
        "name": "Chhatrapati Shivaji Maharaj International Airport (Mumbai, India)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 39.0,
        "runways": [
            (("09", "27"), (-1800.0, 0.0), (1800.0, 0.0), 45.0),
            (("14", "32"), (-964.0, 1149.0), (964.0, -1149.0), 45.0),
        ],
        "taxiways": [
            ("A", [(-1800.0, 180.0), (1800.0, 180.0)], 25.0),
            ("N", [(-1800.0, -180.0), (1800.0, -180.0)], 25.0),
            ("W", [(-850.0, 1050.0), (850.0, -1050.0)], 25.0),
        ],
        "aprons": [
            (
                "Terminal 2 Concourse",
                [(200, 300), (1200, 300), (1200, 750), (200, 750), (200, 300)],
            ),
            (
                "Terminal 1 Domestic",
                [(-1400, -250), (-700, -250), (-700, -650), (-1400, -650), (-1400, -250)],
            ),
        ],
        "gates": [
            ("G-T2-42", (450.0, 500.0), 180.0),
            ("G-T2-48", (750.0, 500.0), 180.0),
            ("G-T2-55", (1050.0, 500.0), 180.0),
            ("G-T1-02", (-1200.0, -450.0), 0.0),
            ("G-T1-06", (-900.0, -450.0), 0.0),
        ],
        "fixes": [
            ("BBB", "arrival", (-22000.0, -16000.0), 5000.0),
            ("EPKOS", "arrival", (-25000.0, 12000.0), 6000.0),
            ("MABES", "departure", (24000.0, 18000.0), 8000.0),
            ("SAKIV", "departure", (18000.0, -22000.0), 8000.0),
        ],
    }


# 3. London Heathrow (EGLL / LHR)
def egll_heathrow():
    ref_lat, ref_lon = 51.4700, -0.4543
    return {
        "id": "egll",
        "icao": "EGLL",
        "name": "London Heathrow Airport (United Kingdom)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 83.0,
        "runways": [
            (("09L", "27R"), (-1950.0, 700.0), (1950.0, 700.0), 50.0),
            (("09R", "27L"), (-1830.0, -700.0), (1830.0, -700.0), 50.0),
        ],
        "taxiways": [
            ("A", [(-1950.0, 850.0), (1950.0, 850.0)], 25.0),
            ("B", [(-1830.0, -850.0), (1830.0, -850.0)], 25.0),
            ("Link-W", [(-1500.0, 700.0), (-1500.0, -700.0)], 30.0),
            ("Link-C", [(0.0, 700.0), (0.0, -700.0)], 30.0),
            ("Link-E", [(1500.0, 700.0), (1500.0, -700.0)], 30.0),
        ],
        "aprons": [
            (
                "Terminal 2 & 3 Central",
                [(-600, -250), (600, -250), (600, 300), (-600, 300), (-600, -250)],
            ),
            (
                "Terminal 5 Concourse",
                [(-1700, -200), (-1200, -200), (-1200, 350), (-1700, 350), (-1700, -200)],
            ),
        ],
        "gates": [
            ("G-T5-A10", (-1550.0, 100.0), 90.0),
            ("G-T5-A18", (-1350.0, 100.0), 270.0),
            ("G-T2-12", (-200.0, 50.0), 0.0),
            ("G-T2-24", (200.0, 50.0), 0.0),
        ],
        "fixes": [
            ("LAM", "arrival", (26000.0, 18000.0), 7000.0),
            ("BIG", "arrival", (18000.0, -22000.0), 6000.0),
            ("OCK", "arrival", (-8000.0, -24000.0), 5000.0),
            ("BNN", "departure", (-14000.0, 26000.0), 8000.0),
            ("CPT", "departure", (-32000.0, 4000.0), 9000.0),
        ],
    }


# 4. San Francisco International (KSFO / SFO)
# 28L/28R: ~280 true (threshold 10 -> threshold 28 is ~280 deg)
# 01L/01R: ~010 true (threshold 01 -> threshold 19 is ~010 deg)
def ksfo_sfo():
    ref_lat, ref_lon = 37.6188, -122.3750

    # 010 deg: sin(10) ~ 0.1736, cos(10) ~ 0.9848
    def pt_on_hdg(center, hdg_deg, dist):
        rad = math.radians(hdg_deg)
        return (center[0] + math.sin(rad) * dist, center[1] + math.cos(rad) * dist)

    c_01l = (-200.0, 0.0)
    r01l_s = pt_on_hdg(c_01l, 10.0, -1150.0)
    r01l_e = pt_on_hdg(c_01l, 10.0, 1150.0)

    c_01r = (50.0, 0.0)
    r01r_s = pt_on_hdg(c_01r, 10.0, -1250.0)
    r01r_e = pt_on_hdg(c_01r, 10.0, 1250.0)

    # 280 deg: threshold 10 is at -x, threshold 28 is at +x
    # heading from 10 to 28 is ~100 deg
    c_28r = (0.0, 300.0)
    r28r_s = pt_on_hdg(c_28r, 100.0, -1750.0)
    r28r_e = pt_on_hdg(c_28r, 100.0, 1750.0)

    c_28l = (0.0, 50.0)
    r28l_s = pt_on_hdg(c_28l, 100.0, -1800.0)
    r28l_e = pt_on_hdg(c_28l, 100.0, 1800.0)

    return {
        "id": "ksfo",
        "icao": "KSFO",
        "name": "San Francisco International Airport (United States)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 13.0,
        "runways": [
            (("10L", "28R"), r28r_s, r28r_e, 60.0),
            (("10R", "28L"), r28l_s, r28l_e, 60.0),
            (("01L", "19R"), r01l_s, r01l_e, 45.0),
            (("01R", "19L"), r01r_s, r01r_e, 45.0),
        ],
        "taxiways": [
            ("A", [(-1700.0, 480.0), (1700.0, -120.0)], 25.0),
            ("B", [(-1700.0, -120.0), (1700.0, -720.0)], 25.0),
            ("T", [(-400.0, -1100.0), (200.0, 1100.0)], 25.0),
        ],
        "aprons": [
            (
                "International Concourse A & G",
                [(-1300, -300), (-600, -300), (-600, 300), (-1300, 300), (-1300, -300)],
            )
        ],
        "gates": [
            ("G-IN-A01", (-1100.0, 50.0), 180.0),
            ("G-IN-A08", (-850.0, 50.0), 180.0),
            ("G-IN-G02", (-1100.0, -150.0), 0.0),
        ],
        "fixes": [
            ("ARCHI", "arrival", (24000.0, -16000.0), 6000.0),
            ("EDDYY", "arrival", (-22000.0, 18000.0), 5000.0),
            ("SFO-VOR", "departure", (-500.0, -500.0), 3000.0),
            ("OFFSHORE", "departure", (20000.0, 22000.0), 8000.0),
        ],
    }


def build_geojson(ap_data):
    ref_lat = ap_data["ref_lat"]
    ref_lon = ap_data["ref_lon"]

    def ll(p):
        lon, lat = geo.unproject(p[0], p[1], ref_lon, ref_lat)
        return [round(lon, 7), round(lat, 7)]

    feats = []
    for des, a, b, w in ap_data["runways"]:
        rid = runway_id(des)
        feats.append(
            {
                "type": "Feature",
                "id": f"RWY-{rid.replace('/', '-')}",
                "geometry": {"type": "LineString", "coordinates": [ll(a), ll(b)]},
                "properties": {"kind": "runway", "designators": list(des), "width_m": w},
            }
        )
    for name, pts, w in ap_data["taxiways"]:
        feats.append(
            {
                "type": "Feature",
                "id": f"TWY-{name}",
                "geometry": {"type": "LineString", "coordinates": [ll(p) for p in pts]},
                "properties": {"kind": "taxiway", "name": name, "width_m": w},
            }
        )
    for name, ring in ap_data["aprons"]:
        feats.append(
            {
                "type": "Feature",
                "id": f"APRON-{name.replace(' ', '-').upper()}",
                "geometry": {"type": "Polygon", "coordinates": [[ll(p) for p in ring]]},
                "properties": {"kind": "apron", "name": name},
            }
        )
    for name, pos, hdg in ap_data["gates"]:
        feats.append(
            {
                "type": "Feature",
                "id": f"GATE-{name}",
                "geometry": {"type": "Point", "coordinates": ll(pos)},
                "properties": {"kind": "gate", "name": name, "heading_deg": hdg},
            }
        )
    for name, role, pos, alt in ap_data["fixes"]:
        feats.append(
            {
                "type": "Feature",
                "id": f"FIX-{name}",
                "geometry": {"type": "Point", "coordinates": ll(pos)},
                "properties": {"kind": "fix", "name": name, "role": role, "altitude_ft": alt},
            }
        )

    return {
        "type": "FeatureCollection",
        "airport": {
            "id": ap_data["id"],
            "icao": ap_data["icao"],
            "name": ap_data["name"],
            "fictional": ap_data["fictional"],
            "reference": {"lat": ref_lat, "lon": ref_lon, "elevation_ft": ap_data["elevation_ft"]},
            "magnetic_variation_deg": 0.0,
            "notes": "Real-world international airport layout.",
        },
        "features": feats,
    }


def main():
    airports = [vidp_delhi(), vabb_mumbai(), egll_heathrow(), ksfo_sfo()]
    out_dir = DEFAULT_AIRPORTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    for ap in airports:
        doc = build_geojson(ap)
        dest = out_dir / f"{ap['id']}.geojson"
        dest.write_text(json.dumps(doc, indent=2))
        print(f"Generated {dest.name}")


if __name__ == "__main__":
    main()
