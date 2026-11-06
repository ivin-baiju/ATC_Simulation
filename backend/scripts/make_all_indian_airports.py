"""Generate realistic accurate GeoJSON airport layouts for major Indian hubs."""

import json
import math

from atc_sim.airport import geo
from atc_sim.airport.loader import DEFAULT_AIRPORTS_DIR, runway_id


def pt_on_hdg(center, hdg_deg, dist):
    rad = math.radians(hdg_deg)
    return (center[0] + math.sin(rad) * dist, center[1] + math.cos(rad) * dist)


# 1. Delhi Indira Gandhi International Airport (VIDP / DEL)
def vidp_delhi():
    ref_lat, ref_lon = 28.5665, 77.1031
    c_11r = (0.0, -500.0)
    c_11l = (0.0, 900.0)
    c_10 = (0.0, -1800.0)
    return {
        "id": "vidp",
        "icao": "VIDP",
        "name": "Delhi Indira Gandhi International (DEL, India)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 777.0,
        "runways": [
            (
                ("11R", "29L"),
                pt_on_hdg(c_11r, 110.0, -2200.0),
                pt_on_hdg(c_11r, 110.0, 2200.0),
                60.0,
            ),
            (
                ("11L", "29R"),
                pt_on_hdg(c_11l, 110.0, -1900.0),
                pt_on_hdg(c_11l, 110.0, 1900.0),
                45.0,
            ),
            (("10", "28"), pt_on_hdg(c_10, 100.0, -1900.0), pt_on_hdg(c_10, 100.0, 1900.0), 45.0),
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
    return {
        "id": "vabb",
        "icao": "VABB",
        "name": "Mumbai Chhatrapati Shivaji Maharaj (BOM, India)",
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
            ("G-T1-02", (-1200.0, -450.0), 0.0),
        ],
        "fixes": [
            ("BBB", "arrival", (-22000.0, -16000.0), 5000.0),
            ("EPKOS", "arrival", (-25000.0, 12000.0), 6000.0),
            ("MABES", "departure", (24000.0, 18000.0), 8000.0),
        ],
    }


# 3. Bengaluru Kempegowda International Airport (VOBL / BLR)
# Coordinates: 13.1986° N, 77.7066° E, elevation 3000 ft
# Dual parallel runways 09L/27R and 09R/27L (4000m x 45m)
def vobl_bengaluru():
    ref_lat, ref_lon = 13.1986, 77.7066
    return {
        "id": "vobl",
        "icao": "VOBL",
        "name": "Bengaluru Kempegowda International (BLR, India)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 3000.0,
        "runways": [
            (("09L", "27R"), (-2000.0, 850.0), (2000.0, 850.0), 45.0),
            (("09R", "27L"), (-2000.0, -850.0), (2000.0, -850.0), 45.0),
        ],
        "taxiways": [
            ("Alpha", [(-2000.0, 1020.0), (2000.0, 1020.0)], 25.0),
            ("Bravo", [(-2000.0, -1020.0), (2000.0, -1020.0)], 25.0),
            ("Center-Link", [(0.0, 850.0), (0.0, -850.0)], 30.0),
        ],
        "aprons": [
            (
                "Terminal 1 & 2 Central Apron",
                [(-800, -350), (800, -350), (800, 350), (-800, 350), (-800, -350)],
            ),
        ],
        "gates": [
            ("G-T1-14", (-400.0, 150.0), 180.0),
            ("G-T2-01", (400.0, 150.0), 180.0),
        ],
        "fixes": [
            ("GUNIM", "arrival", (-26000.0, 15000.0), 7000.0),
            ("TELNO", "arrival", (-18000.0, -22000.0), 6500.0),
            ("OPAMO", "departure", (24000.0, -18000.0), 8000.0),
            ("BIA", "departure", (18000.0, 24000.0), 8500.0),
        ],
    }


# 4. Chennai International Airport (VOMM / MAA)
# Coordinates: 12.9941° N, 80.1709° E, elevation 52 ft
# Primary 07/25 (3658m) & secondary 12/30 (2045m)
def vomm_chennai():
    ref_lat, ref_lon = 12.9941, 80.1709
    # 07/25 heading ~070 deg
    return {
        "id": "vomm",
        "icao": "VOMM",
        "name": "Chennai International Airport (MAA, India)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 52.0,
        "runways": [
            (
                ("07", "25"),
                pt_on_hdg((0.0, 0.0), 70.0, -1820.0),
                pt_on_hdg((0.0, 0.0), 70.0, 1820.0),
                45.0,
            ),
            (
                ("12", "30"),
                pt_on_hdg((-200.0, -100.0), 120.0, -1020.0),
                pt_on_hdg((-200.0, -100.0), 120.0, 1020.0),
                45.0,
            ),
        ],
        "taxiways": [
            ("A", [(-1600.0, 280.0), (1600.0, 280.0)], 25.0),
            ("B", [(-1600.0, -280.0), (1600.0, -280.0)], 25.0),
        ],
        "aprons": [
            (
                "Main Passenger Terminal",
                [(-600, 300), (600, 300), (600, 750), (-600, 750), (-600, 300)],
            ),
        ],
        "gates": [
            ("G-MAA-05", (-250.0, 500.0), 180.0),
            ("G-MAA-12", (250.0, 500.0), 180.0),
        ],
        "fixes": [
            ("IDASO", "arrival", (-25000.0, 14000.0), 6000.0),
            ("MMV", "arrival", (22000.0, -16000.0), 5000.0),
            ("DOPID", "departure", (20000.0, 22000.0), 7000.0),
        ],
    }


# 5. Hyderabad Rajiv Gandhi International (VOHS / HYD)
# Coordinates: 17.2403° N, 78.4294° E, elevation 2024 ft
# Runway 09R/27L: 4260m x 60m (~090/270)
def vohs_hyderabad():
    ref_lat, ref_lon = 17.2403, 78.4294
    return {
        "id": "vohs",
        "icao": "VOHS",
        "name": "Hyderabad Rajiv Gandhi International (HYD, India)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 2024.0,
        "runways": [
            (("09R", "27L"), (-2130.0, -400.0), (2130.0, -400.0), 60.0),
            (("09L", "27R"), (-1800.0, 800.0), (1800.0, 800.0), 45.0),
        ],
        "taxiways": [
            ("Alpha", [(-2130.0, -220.0), (2130.0, -220.0)], 25.0),
            ("Bravo", [(-1800.0, 620.0), (1800.0, 620.0)], 25.0),
            ("Cross-1", [(0.0, 800.0), (0.0, -400.0)], 30.0),
        ],
        "aprons": [
            (
                "Passenger Concourse",
                [(-700, -100), (700, -100), (700, 450), (-700, 450), (-700, -100)],
            ),
        ],
        "gates": [
            ("G-HYD-21", (-300.0, 200.0), 180.0),
            ("G-HYD-28", (300.0, 200.0), 180.0),
        ],
        "fixes": [
            ("GOLKI", "arrival", (-25000.0, -18000.0), 6500.0),
            ("NNP", "arrival", (-22000.0, 16000.0), 6000.0),
            ("TEXAN", "departure", (24000.0, 18000.0), 8000.0),
        ],
    }


# 6. Kochi Cochin International Airport (VOCI / COK)
# Coordinates: 10.1556° N, 76.3912° E, elevation 30 ft
# Runway 09/27: 3400m x 45m (~090/270)
def voci_kochi():
    ref_lat, ref_lon = 10.1556, 76.3912
    return {
        "id": "voci",
        "icao": "VOCI",
        "name": "Cochin International Airport (COK, Kerala, India)",
        "fictional": False,
        "ref_lat": ref_lat,
        "ref_lon": ref_lon,
        "elevation_ft": 30.0,
        "runways": [
            (("09", "27"), (-1700.0, 0.0), (1700.0, 0.0), 45.0),
        ],
        "taxiways": [
            ("A", [(-1700.0, 180.0), (1700.0, 180.0)], 25.0),
            ("A1", [(-1200.0, 180.0), (-1200.0, 0.0)], 25.0),
            ("A2", [(-300.0, 180.0), (-300.0, 0.0)], 25.0),
            ("A3", [(800.0, 180.0), (800.0, 0.0)], 25.0),
            ("A4", [(1700.0, 180.0), (1700.0, 0.0)], 25.0),
        ],
        "aprons": [
            (
                "T3 International & Domestic",
                [(-800, 250), (800, 250), (800, 650), (-800, 650), (-800, 250)],
            ),
        ],
        "gates": [
            ("G-COK-01", (-500.0, 400.0), 180.0),
            ("G-COK-06", (0.0, 400.0), 180.0),
            ("G-COK-11", (500.0, 400.0), 180.0),
        ],
        "fixes": [
            ("CIA", "arrival", (-20000.0, -12000.0), 5000.0),
            ("NOKID", "arrival", (-18000.0, 18000.0), 5500.0),
            ("LATUM", "departure", (22000.0, 14000.0), 7000.0),
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
            "notes": "Real-world accurate layout.",
        },
        "features": feats,
    }


def main():
    airports = [
        vidp_delhi(),
        vabb_mumbai(),
        vobl_bengaluru(),
        vomm_chennai(),
        vohs_hyderabad(),
        voci_kochi(),
    ]
    out_dir = DEFAULT_AIRPORTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    for ap in airports:
        doc = build_geojson(ap)
        dest = out_dir / f"{ap['id']}.geojson"
        dest.write_text(json.dumps(doc, indent=2))
        print(f"Generated {dest.name}")


if __name__ == "__main__":
    main()
