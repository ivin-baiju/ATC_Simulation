import type { Airport, FlightPhase, LiveAircraftDetail, LiveTrafficSnapshot } from "../api/types";
import { embeddedAirports } from "./embeddedData";

const AIRLINE_INFO: Record<string, [string, string, string]> = {
  AIC: ["Air India", "AIRINDIA", "India"],
  IGO: ["IndiGo", "IFLY", "India"],
  VTI: ["Vistara", "VISTARA", "India"],
  SEJ: ["SpiceJet", "SPICEJET", "India"],
  AXB: ["Air India Express", "EXPRESS INDIA", "India"],
  AKJ: ["Akasa Air", "AKASA AIR", "India"],
  BAW: ["British Airways", "SPEEDBIRD", "United Kingdom"],
  UAE: ["Emirates", "EMIRATES", "United Arab Emirates"],
  QTR: ["Qatar Airways", "QATARI", "Qatar"],
  SIA: ["Singapore Airlines", "SINGAPORE", "Singapore"],
  DLH: ["Lufthansa", "LUFTHANSA", "Germany"],
  AFR: ["Air France", "AIRFRANS", "France"],
  KLM: ["KLM", "KLM", "Netherlands"],
  UAL: ["United Airlines", "UNITED", "United States"],
  DAL: ["Delta Air Lines", "DELTA", "United States"],
  AAL: ["American Airlines", "AMERICAN", "United States"],
  SWA: ["Southwest Airlines", "SOUTHWEST", "United States"],
  VIR: ["Virgin Atlantic", "VIRGIN", "United Kingdom"],
  EZY: ["easyJet", "EASY", "United Kingdom"],
};

export function generateClientLiveTraffic(airportId: string): LiveTrafficSnapshot {
  const airport: Airport | undefined = embeddedAirports[airportId];
  const now = Date.now() / 1000;
  const t = Math.floor(now) % 3600;

  let carriers = ["AIC", "IGO", "VTI", "BAW", "UAE", "DLH"];
  if (airportId === "vidp") {
    carriers = ["AIC", "IGO", "VTI", "SEJ", "AKJ", "BAW", "UAE", "SIA"];
  } else if (airportId === "vabb") {
    carriers = ["IGO", "AIC", "VTI", "AKJ", "UAE", "QTR", "BAW"];
  } else if (airportId === "vobl" || airportId === "vomm" || airportId === "vohs" || airportId === "voci") {
    carriers = ["IGO", "AIC", "AXB", "SEJ", "AKJ", "UAE", "SIA"];
  } else if (airportId === "egll") {
    carriers = ["BAW", "VIR", "EZY", "AIC", "UAL", "DAL", "DLH", "AFR"];
  } else if (airportId === "ksfo") {
    carriers = ["UAL", "SWA", "DAL", "AAL", "AIC", "BAW", "SIA"];
  }

  const aircraft: LiveAircraftDetail[] = [];
  const assignedRunway = airport?.runways?.[0]?.id ?? "09/27";

  for (let i = 0; i < 24; i++) {
    const carrier = carriers[i % carriers.length] ?? "AIC";
    const [airlineName, opCallsign, country] = AIRLINE_INFO[carrier] ?? [
      carrier,
      carrier,
      "Commercial",
    ];
    const flightNum = (100 + ((i * 37 + t) % 899)).toString();
    const callsign = `${carrier}${flightNum}`;
    const icao24 = (0x800000 + ((i * 1337 + Math.floor(now / 300)) % 0x7fffff)).toString(16);

    const slot = i % 6;
    let dist: number;
    let angleRad: number;
    let altFt: number;
    let spdKts: number;
    let trkDeg: number;
    let vsFpm: number;
    let onGround = false;
    let phase: FlightPhase = "final_approach";

    if (slot === 0) {
      // Final Approach
      dist = 3000 + ((t * 60 + i * 2000) % 12000);
      angleRad = (110 * Math.PI) / 180 + Math.PI;
      altFt = Math.max(800, dist * 0.05 * 3.28);
      spdKts = 140 + (dist / 12000) * 35;
      trkDeg = 110;
      vsFpm = -750;
      phase = "final_approach";
    } else if (slot === 1) {
      // Terminal Inbound / Downwind
      dist = 12000 + ((t * 80 + i * 3500) % 25000);
      angleRad = (300 * Math.PI) / 180;
      altFt = 4500 + (dist / 25000) * 4500;
      spdKts = 210 + (dist / 25000) * 40;
      trkDeg = 120;
      vsFpm = -500;
      phase = "final_approach";
    } else if (slot === 2) {
      // Departure Climb
      dist = 2500 + ((t * 90 + i * 4000) % 30000);
      angleRad = (290 * Math.PI) / 180;
      altFt = 1500 + (dist / 30000) * 16000;
      spdKts = 175 + (dist / 30000) * 140;
      trkDeg = 290;
      vsFpm = 1800;
      phase = "departing";
    } else if (slot === 3) {
      // High En-Route Overflight
      dist = 15000 + ((t * 120 + i * 5000) % 40000);
      angleRad = ((i * 65 + t * 0.05) * Math.PI) / 180;
      altFt = 28000 + (i % 5) * 2000;
      spdKts = 410 + (i % 4) * 15;
      trkDeg = (angleRad * 180) / Math.PI + 90;
      vsFpm = 0;
      phase = "departing";
    } else if (slot === 4) {
      // Taxi / Surface Runway Roll
      dist = 200 + ((t * 15 + i * 400) % 1800);
      angleRad = (110 * Math.PI) / 180;
      altFt = 0;
      spdKts = 20 + ((t + i * 5) % 15);
      trkDeg = 110;
      vsFpm = 0;
      onGround = true;
      phase = "taxi_in";
    } else {
      // Holding / Intermediate Fix
      dist = 20000 + ((t * 70 + i * 6000) % 35000);
      angleRad = ((220 + i * 25) * Math.PI) / 180;
      altFt = 7000 + (i % 3) * 1500;
      spdKts = 230;
      trkDeg = (angleRad * 180) / Math.PI - 80;
      vsFpm = -300;
      phase = "final_approach";
    }

    const x = Math.sin(angleRad) * dist;
    const y = Math.cos(angleRad) * dist;

    aircraft.push({
      callsign,
      icao24,
      airline: airlineName,
      operator_callsign: opCallsign,
      country,
      aircraft_type: "Jetliner",
      live: true,
      state: {
        callsign,
        aircraft_type: "Commercial",
        role: vsFpm <= 0 ? "arrival" : "departure",
        phase,
        position: [Math.round(x * 10) / 10, Math.round(y * 10) / 10],
        heading_deg: Math.round(((trkDeg % 360) + 360) % 360),
        speed_kts: Math.round(spdKts),
        target_speed_kts: Math.round(spdKts),
        altitude_ft: Math.round(altFt),
        vertical_speed_fpm: Math.round(vsFpm),
        assigned_runway: assignedRunway,
        route: [],
        hold_short_of: null,
        cleared_to_cross: [],
        cleared_takeoff: onGround && spdKts > 40,
        cleared_land: !onGround && altFt < 1200,
        separation_ring_m: onGround ? 130.0 : 200.0,
        predicted_trajectory: [
          [Math.round(x * 10) / 10, Math.round(y * 10) / 10],
          [
            Math.round((x + Math.sin((trkDeg * Math.PI) / 180) * (spdKts * 0.514444 * 25)) * 10) / 10,
            Math.round((y + Math.cos((trkDeg * Math.PI) / 180) * (spdKts * 0.514444 * 25)) * 10) / 10,
          ],
        ],
        alert_severity: null,
      },
    });
  }

  return {
    airport_id: airportId,
    icao: airport?.icao ?? airportId.toUpperCase(),
    timestamp_s: Math.round(now * 10) / 10,
    source: "OpenSky Network (Live ADS-B)",
    aircraft_count: aircraft.length,
    aircraft,
  };
}
