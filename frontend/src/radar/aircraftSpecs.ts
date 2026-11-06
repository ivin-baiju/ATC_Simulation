/**
 * Comprehensive real-world aircraft specifications, airframe geometries,
 * and airline liveries matching FlightRadar24 real-world data.
 */

export interface AirlineLivery {
  name: string;
  iata: string;
  callsignTelephony: string;
  country: string;
  primaryColor: number; // Hex color for Three.js
  accentColor: number;
  secondaryColor?: number;
  tailStyle: "stripes" | "solid" | "sun" | "star" | "flag" | "artisan";
}

export interface AircraftSpecs {
  model: string;
  manufacturer: string;
  category: "Narrow-body Jet" | "Wide-body Jet" | "Regional Turboprop" | "Super Heavy Jet";
  geometryType: "A320" | "B737" | "B787" | "A350" | "B777" | "ATR72" | "A380";
  wingspanM: number;
  lengthM: number;
  heightM: number;
  maxTakeoffWeightKg: number;
  cruiseSpeedKts: number;
  maxRangeKm: number;
  typicalSeating: string;
  engines: string;
  thrustPerEngineKn: number;
  serviceCeilingFt: number;
}

export interface FlightRouteDetails {
  flightNumber: string;
  airline: string;
  origin: { iata: string; city: string; country: string };
  destination: { iata: string; city: string; country: string };
  registration: string;
  squawk: string;
  verticalSpeedFpm: number;
  scheduledDep: string;
  estimatedArr: string;
  progressPercent: number;
}

export const AIRLINE_LIVERIES: Record<string, AirlineLivery> = {
  IGO: {
    name: "IndiGo",
    iata: "6E",
    callsignTelephony: "IFLY",
    country: "India",
    primaryColor: 0x002060, // IndiGo Navy
    accentColor: 0x0055ff,
    secondaryColor: 0xffffff,
    tailStyle: "stripes",
  },
  AIC: {
    name: "Air India",
    iata: "AI",
    callsignTelephony: "AIRINDIA",
    country: "India",
    primaryColor: 0xb8001f, // Deep Maharaja Red
    accentColor: 0xd4af37, // Golden Vista
    secondaryColor: 0xffffff,
    tailStyle: "star",
  },
  AXB: {
    name: "Air India Express",
    iata: "IX",
    callsignTelephony: "EXPRESS INDIA",
    country: "India",
    primaryColor: 0xe05a1b, // Express Mandarin Orange
    accentColor: 0x0a8b88, // Turquoise accent
    secondaryColor: 0xffffff,
    tailStyle: "artisan",
  },
  SEJ: {
    name: "SpiceJet",
    iata: "SG",
    callsignTelephony: "SPICEJET",
    country: "India",
    primaryColor: 0xd21f26, // Chilli Red
    accentColor: 0xf5a623, // Sun Yellow
    secondaryColor: 0xffffff,
    tailStyle: "sun",
  },
  VTI: {
    name: "Vistara",
    iata: "UK",
    callsignTelephony: "VISTARA",
    country: "India",
    primaryColor: 0x49163c, // Royal Aubergine
    accentColor: 0xc5a059, // Gold Crest
    secondaryColor: 0xffffff,
    tailStyle: "star",
  },
  AKJ: {
    name: "Akasa Air",
    iata: "QP",
    callsignTelephony: "AKASA AIR",
    country: "India",
    primaryColor: 0xff6e14, // Sunrise Orange
    accentColor: 0x4b1b6d, // Passionate Purple
    secondaryColor: 0xffffff,
    tailStyle: "solid",
  },
  BAW: {
    name: "British Airways",
    iata: "BA",
    callsignTelephony: "SPEEDBIRD",
    country: "United Kingdom",
    primaryColor: 0x075aaa, // Royal Blue
    accentColor: 0xeb2226, // Speedmarque Red
    secondaryColor: 0xffffff,
    tailStyle: "flag",
  },
  UAE: {
    name: "Emirates",
    iata: "EK",
    callsignTelephony: "EMIRATES",
    country: "United Arab Emirates",
    primaryColor: 0xd71921, // Red
    accentColor: 0x007a3d, // Green
    secondaryColor: 0xd4af37, // Gold
    tailStyle: "flag",
  },
  ETD: {
    name: "Etihad Airways",
    iata: "EY",
    callsignTelephony: "ETIHAD",
    country: "United Arab Emirates",
    primaryColor: 0xc29b38, // Facets of Abu Dhabi Gold
    accentColor: 0x6e5229,
    secondaryColor: 0xffffff,
    tailStyle: "artisan",
  },
  QTR: {
    name: "Qatar Airways",
    iata: "QR",
    callsignTelephony: "QATARI",
    country: "Qatar",
    primaryColor: 0x5c0632, // Oryx Burgundy
    accentColor: 0x8a1538,
    secondaryColor: 0xffffff,
    tailStyle: "solid",
  },
  SIA: {
    name: "Singapore Airlines",
    iata: "SQ",
    callsignTelephony: "SINGAPORE",
    country: "Singapore",
    primaryColor: 0x00205b, // Midnight Blue
    accentColor: 0xf5a800, // Golden Kris Bird
    secondaryColor: 0xffffff,
    tailStyle: "star",
  },
  DLH: {
    name: "Lufthansa",
    iata: "LH",
    callsignTelephony: "LUFTHANSA",
    country: "Germany",
    primaryColor: 0x05164d, // Deep Blue
    accentColor: 0xffa300, // Crane Yellow
    secondaryColor: 0xffffff,
    tailStyle: "sun",
  },
  EZY: {
    name: "easyJet",
    iata: "U2",
    callsignTelephony: "EASY",
    country: "United Kingdom",
    primaryColor: 0xff6600, // easyJet Orange
    accentColor: 0xffffff,
    secondaryColor: 0x000000,
    tailStyle: "solid",
  },
  DAL: {
    name: "Delta Air Lines",
    iata: "DL",
    callsignTelephony: "DELTA",
    country: "United States",
    primaryColor: 0x002244, // Navy
    accentColor: 0xc41230, // Red Widget
    secondaryColor: 0xffffff,
    tailStyle: "solid",
  },
  UAL: {
    name: "United Airlines",
    iata: "UA",
    callsignTelephony: "UNITED",
    country: "United States",
    primaryColor: 0x005da4, // Blue
    accentColor: 0x6bc4e8,
    secondaryColor: 0xffffff,
    tailStyle: "stripes",
  },
  SWA: {
    name: "Southwest Airlines",
    iata: "WN",
    callsignTelephony: "SOUTHWEST",
    country: "United States",
    primaryColor: 0x11295b, // Blue
    accentColor: 0xf9b612, // Warm Yellow
    secondaryColor: 0xd12640, // Heart Red
    tailStyle: "stripes",
  },
};

export const AIRCRAFT_DATABASE: Record<string, AircraftSpecs> = {
  A320: {
    model: "Airbus A320neo",
    manufacturer: "Airbus",
    category: "Narrow-body Jet",
    geometryType: "A320",
    wingspanM: 35.8,
    lengthM: 37.57,
    heightM: 11.76,
    maxTakeoffWeightKg: 79000,
    cruiseSpeedKts: 450,
    maxRangeKm: 6300,
    typicalSeating: "150–186 passengers (Single Class)",
    engines: "2x CFM LEAP-1A / PW1100G-JM",
    thrustPerEngineKn: 120.6,
    serviceCeilingFt: 39800,
  },
  A321: {
    model: "Airbus A321neo",
    manufacturer: "Airbus",
    category: "Narrow-body Jet",
    geometryType: "A320",
    wingspanM: 35.8,
    lengthM: 44.51,
    heightM: 11.76,
    maxTakeoffWeightKg: 97000,
    cruiseSpeedKts: 454,
    maxRangeKm: 7400,
    typicalSeating: "180–240 passengers",
    engines: "2x CFM LEAP-1A32 Turbofans",
    thrustPerEngineKn: 143.0,
    serviceCeilingFt: 39800,
  },
  B738: {
    model: "Boeing 737-800",
    manufacturer: "The Boeing Company",
    category: "Narrow-body Jet",
    geometryType: "B737",
    wingspanM: 35.79,
    lengthM: 39.5,
    heightM: 12.5,
    maxTakeoffWeightKg: 79010,
    cruiseSpeedKts: 453,
    maxRangeKm: 5436,
    typicalSeating: "162–189 passengers",
    engines: "2x CFM56-7B27 Turbofans",
    thrustPerEngineKn: 121.4,
    serviceCeilingFt: 41000,
  },
  B739: {
    model: "Boeing 737-900ER",
    manufacturer: "The Boeing Company",
    category: "Narrow-body Jet",
    geometryType: "B737",
    wingspanM: 35.79,
    lengthM: 42.11,
    heightM: 12.5,
    maxTakeoffWeightKg: 85139,
    cruiseSpeedKts: 453,
    maxRangeKm: 5925,
    typicalSeating: "178–220 passengers",
    engines: "2x CFM56-7B26 Turbofans",
    thrustPerEngineKn: 121.4,
    serviceCeilingFt: 41000,
  },
  B789: {
    model: "Boeing 787-9 Dreamliner",
    manufacturer: "The Boeing Company",
    category: "Wide-body Jet",
    geometryType: "B787",
    wingspanM: 60.17,
    lengthM: 62.81,
    heightM: 17.02,
    maxTakeoffWeightKg: 254000,
    cruiseSpeedKts: 488,
    maxRangeKm: 14140,
    typicalSeating: "290–310 passengers (3-Class)",
    engines: "2x General Electric GEnx-1B",
    thrustPerEngineKn: 320.0,
    serviceCeilingFt: 43000,
  },
  A350: {
    model: "Airbus A350-900 XWB",
    manufacturer: "Airbus",
    category: "Wide-body Jet",
    geometryType: "A350",
    wingspanM: 64.75,
    lengthM: 66.8,
    heightM: 17.05,
    maxTakeoffWeightKg: 280000,
    cruiseSpeedKts: 488,
    maxRangeKm: 15372,
    typicalSeating: "300–350 passengers (3-Class)",
    engines: "2x Rolls-Royce Trent XWB-84",
    thrustPerEngineKn: 374.5,
    serviceCeilingFt: 43100,
  },
  B77W: {
    model: "Boeing 777-300ER",
    manufacturer: "The Boeing Company",
    category: "Wide-body Jet",
    geometryType: "B777",
    wingspanM: 64.8,
    lengthM: 73.86,
    heightM: 18.5,
    maxTakeoffWeightKg: 351534,
    cruiseSpeedKts: 482,
    maxRangeKm: 13649,
    typicalSeating: "350–396 passengers",
    engines: "2x General Electric GE90-115B",
    thrustPerEngineKn: 512.0,
    serviceCeilingFt: 43100,
  },
  ATR72: {
    model: "ATR 72-600",
    manufacturer: "Avions de Transport Régional",
    category: "Regional Turboprop",
    geometryType: "ATR72",
    wingspanM: 27.05,
    lengthM: 27.17,
    heightM: 7.65,
    maxTakeoffWeightKg: 23000,
    cruiseSpeedKts: 275,
    maxRangeKm: 1528,
    typicalSeating: "70–78 passengers",
    engines: "2x Pratt & Whitney Canada PW127M",
    thrustPerEngineKn: 32.0,
    serviceCeilingFt: 25000,
  },
  A380: {
    model: "Airbus A380-800 Superjumbo",
    manufacturer: "Airbus",
    category: "Super Heavy Jet",
    geometryType: "A380",
    wingspanM: 79.75,
    lengthM: 72.72,
    heightM: 24.09,
    maxTakeoffWeightKg: 575000,
    cruiseSpeedKts: 490,
    maxRangeKm: 14800,
    typicalSeating: "469–555 passengers (Double-Deck)",
    engines: "4x Engine Alliance GP7270 / RR Trent 900",
    thrustPerEngineKn: 348.0,
    serviceCeilingFt: 43000,
  },
};

export function lookupAircraftSpecs(typeOrCallsign: string): AircraftSpecs {
  const norm = typeOrCallsign.trim().toUpperCase();
  if (AIRCRAFT_DATABASE[norm]) {
    return AIRCRAFT_DATABASE[norm]!;
  }

  // Common airline fleet mappings
  if (norm.startsWith("AIC")) {
    if (norm.includes("777") || norm.endsWith("W")) return AIRCRAFT_DATABASE["B77W"]!;
    if (norm.includes("350")) return AIRCRAFT_DATABASE["A350"]!;
    return AIRCRAFT_DATABASE["B789"]!;
  }
  if (norm.startsWith("BAW")) {
    return AIRCRAFT_DATABASE["A350"]!;
  }
  if (norm.startsWith("UAE")) {
    return AIRCRAFT_DATABASE["B77W"]!;
  }
  if (norm.startsWith("IGO")) {
    if (norm.endsWith("R") || norm.endsWith("P")) return AIRCRAFT_DATABASE["ATR72"]!;
    return AIRCRAFT_DATABASE["A320"]!;
  }
  if (norm.startsWith("AXB") || norm.startsWith("SEJ") || norm.startsWith("AKJ")) {
    return AIRCRAFT_DATABASE["B738"]!;
  }
  if (norm.startsWith("VTI") || norm.startsWith("EZY")) {
    return AIRCRAFT_DATABASE["A320"]!;
  }
  if (norm.startsWith("SWA") || norm.startsWith("DAL")) {
    return AIRCRAFT_DATABASE["B738"]!;
  }
  return AIRCRAFT_DATABASE["A320"]!;
}

export function lookupAirlineLivery(callsign: string): AirlineLivery {
  const prefix = callsign.trim().slice(0, 3).toUpperCase();
  if (AIRLINE_LIVERIES[prefix]) {
    return AIRLINE_LIVERIES[prefix]!;
  }
  return {
    name: "Commercial Carrier",
    iata: prefix.slice(0, 2),
    callsignTelephony: prefix,
    country: "International",
    primaryColor: 0x167d8d, // Default Teal
    accentColor: 0x071b2b, // Ink
    secondaryColor: 0xffffff,
    tailStyle: "solid",
  };
}

/**
 * Generate real-world flight route data like FlightRadar24
 */
const INDIAN_DESTINATIONS = [
  { iata: "BOM", city: "Mumbai", country: "India" },
  { iata: "DEL", city: "New Delhi", country: "India" },
  { iata: "BLR", city: "Bengaluru", country: "India" },
  { iata: "MAA", city: "Chennai", country: "India" },
  { iata: "HYD", city: "Hyderabad", country: "India" },
  { iata: "COK", city: "Kochi", country: "India" },
  { iata: "CCU", city: "Kolkata", country: "India" },
  { iata: "GOI", city: "Goa (Dabolim)", country: "India" },
  { iata: "AMD", city: "Ahmedabad", country: "India" },
  { iata: "DXB", city: "Dubai", country: "UAE" },
  { iata: "SIN", city: "Singapore", country: "Singapore" },
  { iata: "LHR", city: "London Heathrow", country: "United Kingdom" },
];

export function lookupFlightRoute(
  callsign: string,
  currentAirportIcao = "VIDP",
  _speedKts = 250,
  altitudeFt = 12000,
): FlightRouteDetails {
  const livery = lookupAirlineLivery(callsign);
  const numPart = callsign.replace(/[A-Z]/g, "") || "412";
  const flightNumber = `${livery.iata} ${numPart}`;

  // Deterministic seed from callsign
  let hash = 0;
  for (let i = 0; i < callsign.length; i++) {
    hash = (hash * 31 + callsign.charCodeAt(i)) & 0xfffffff;
  }

  const isArrival = hash % 2 === 0;
  const currentCity =
    currentAirportIcao === "VIDP"
      ? { iata: "DEL", city: "New Delhi", country: "India" }
      : currentAirportIcao === "VABB"
      ? { iata: "BOM", city: "Mumbai", country: "India" }
      : currentAirportIcao === "VOBL"
      ? { iata: "BLR", city: "Bengaluru", country: "India" }
      : currentAirportIcao === "VOMM"
      ? { iata: "MAA", city: "Chennai", country: "India" }
      : currentAirportIcao === "VOHS"
      ? { iata: "HYD", city: "Hyderabad", country: "India" }
      : currentAirportIcao === "VOCI"
      ? { iata: "COK", city: "Kochi", country: "India" }
      : currentAirportIcao === "EGLL"
      ? { iata: "LHR", city: "London", country: "United Kingdom" }
      : { iata: "SFO", city: "San Francisco", country: "United States" };

  const destIndex = (hash >> 3) % INDIAN_DESTINATIONS.length;
  let otherCity = INDIAN_DESTINATIONS[destIndex]!;
  if (otherCity.iata === currentCity.iata) {
    otherCity = INDIAN_DESTINATIONS[(destIndex + 1) % INDIAN_DESTINATIONS.length]!;
  }

  const origin = isArrival ? otherCity : currentCity;
  const destination = isArrival ? currentCity : otherCity;

  // Realistic aircraft registration
  const regLetters = String.fromCharCode(65 + (hash % 26)) + String.fromCharCode(65 + ((hash >> 5) % 26)) + String.fromCharCode(65 + ((hash >> 10) % 26));
  const registration = livery.country === "India" ? `VT-${regLetters}` : livery.country === "United Kingdom" ? `G-${regLetters}` : `N${hash % 900 + 100}AA`;

  // Squawk code (4 octal digits)
  const squawk = `${(hash % 7) + 1}${((hash >> 3) % 7) + 1}${((hash >> 6) % 7) + 1}${((hash >> 9) % 7) + 1}`;

  // Vertical rate
  const vsVal = altitudeFt > 18000 ? 0 : isArrival ? -(Math.abs(hash % 12) * 100 + 600) : (Math.abs(hash % 15) * 100 + 800);

  // Time schedules
  const depHour = ((hash >> 2) % 18) + 5;
  const depMin = (hash >> 4) % 60;
  const flightDurationMin = (hash % 90) + 75;
  const arrTotalMin = depHour * 60 + depMin + flightDurationMin;
  const arrHour = Math.floor(arrTotalMin / 60) % 24;
  const arrMin = arrTotalMin % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const progressPercent = Math.min(95, Math.max(10, (hash % 80) + 15));

  return {
    flightNumber,
    airline: livery.name,
    origin,
    destination,
    registration,
    squawk,
    verticalSpeedFpm: vsVal,
    scheduledDep: `${pad(depHour)}:${pad(depMin)} IST`,
    estimatedArr: `${pad(arrHour)}:${pad(arrMin)} IST`,
    progressPercent,
  };
}
