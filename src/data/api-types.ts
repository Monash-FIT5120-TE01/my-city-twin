/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE BACKEND ACTUALLY SENDS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   A written-down copy of the staging API's response shapes. Nothing more.
 *   No conversion, no cleaning, no opinions — just what arrives.
 *
 * WHO USES IT
 *   adapter.ts, and nothing else. The rule is that these types stop at the
 *   edge of the data layer. If the backend renames a column or changes a
 *   type, this file changes and one function in adapter.ts changes, and the
 *   3D scene and the interface never find out.
 *
 * THE THING TO NOTICE
 *   Every number arrives as a STRING — "162.4", not 162.4. That is normal
 *   for a Postgres numeric column serialised to JSON, and it is why
 *   `NumericString` appears everywhere below. Parsing happens once, in the
 *   adapter, so no other file ever has to wonder.
 */

/** Every numeric field arrives as a string. Parsed once, in the adapter. */
type NumericString = string;

export interface ApiFeatureCollection<P> {
  type: 'FeatureCollection';
  name: string;
  features: ApiFeature<P>[];
}

export interface ApiFeature<P> {
  type: 'Feature';
  id: string;
  objectId?: string;
  geometry: ApiMultiPolygon | null;
  properties: P;
}

export interface ApiMultiPolygon {
  type: 'MultiPolygon';
  /** [polygon][ring][vertex][lon, lat] */
  coordinates: number[][][][];
}

/** GET /api/building/footprints — one row per roof plane, not per building. */
export interface ApiBuildingPart {
  buildingId: string;
  structureId: string;
  componentCount: number;
  structureMinElevationAhdM: NumericString;
  structureMaxElevationAhdM: NumericString;
  structureHeightM: NumericString;
  footprintType: string;
  /** Server returns capitalised values ("Hip"), the doc lists lowercase. */
  roofType: string;
  footprintMinElevationAhdM: NumericString;
  footprintMaxElevationAhdM: NumericString;
  footprintExtrusionM: NumericString;
  /**
   * The corrected height. footprintExtrusionM is, despite its name,
   * "how far above ground this roof plane sits" — not a height. The backend
   * carrying both columns is what makes the distinction recoverable.
   */
  calculatedExtrusionM: NumericString;
  relativeBaseHeightM: NumericString;
  relativeTopHeightM: NumericString;
  footprintAreaM2: NumericString;
  /**
   * Added by the backend so the whole city can be searched, not just the
   * proposals. It comes from the spatial match between the property register
   * and the building outlines, so it is absent where that match found
   * nothing: 1,328 of 1,548 buildings have one. May include a building name.
   */
  streetAddress?: string | null;
}

export type DevelopmentStatus = 'APPLIED' | 'APPROVED' | 'UNDER CONSTRUCTION';

export interface ApiLandUse {
  unit: string | null;
  quantity: number;
  use_type: string;
}

/** GET /api/development/footprints — one row per massing component. */
export interface ApiDevelopmentPart {
  devId: string;
  devKey: string;
  streetAddress: string;
  longitude: number;
  latitude: number;
  status: DevelopmentStatus;
  modelStatus: DevelopmentStatus;
  shapeType: 'podium' | 'tower' | 'extension';
  baseAhdM: NumericString;
  topAhdM: NumericString;
  approxHeightM: NumericString;
  componentCount: number;
  footprintAreaM2: NumericString;
  landUses: ApiLandUse[];
}

/** GET /api/development/details/:devId */
export interface ApiDevelopmentDetail {
  developmentId: string;
  developmentKey: string;
  streetAddress: string;
  planningApplication: string;
  permitNumber: string;
  latitude: number;
  longitude: number;
  status: DevelopmentStatus;
  modelStatus: DevelopmentStatus;
  floorsAbove: NumericString;
  residentialUnits: NumericString;
  officeFloorAreaM2: NumericString;
  retailFloorAreaM2: NumericString;
  industrialFloorAreaM2: NumericString;
  educationFloorAreaM2: NumericString;
  carSpaces: NumericString;
  bikeSpaces: NumericString;
  landUses: ApiLandUse[];
}

/**
 * GET /api/building/landmarks — the places a visitor steers by.
 *
 * Fifty-one of them (2026-10-12). Flat, not GeoJSON: a name, a point and an
 * address, nothing else — no kind, no height, no description. The point is
 * the place rather than an entrance, and the spelling is the source's own
 * ("Athanaeum Theatre"), which the interface keeps rather than correcting.
 */
export interface ApiLandmark {
  landmark_name: string;
  longitude: NumericString;
  latitude: NumericString;
  address: string;
}

/*
 * ── STREET ACTIVITY ─────────────────────────────────────────────────────
 *
 * The pedestrian counters, from the City of Melbourne's open data by way of
 * the team's backend. Four calls, none with parameters (2026-10-14).
 */

/** GET /api/pedestrian-activities/sensors — 46 counters, every one "A". */
export interface ApiActivitySensor {
  id: number;
  name: string;
  lat: number;
  lon: number;
  status: string;
}

/**
 * One counter's hour, from /recent (the last two hours) or /history (the
 * last twenty-five). The timestamp is the hour's start in UTC.
 */
export interface ApiActivityCount {
  locationId: number;
  timestamp: string;
  /** A string: "10.0". */
  count: NumericString;
}

export type ApiActivityLevel = 'quiet' | 'moderate' | 'busy';

export interface ApiActivityHour {
  /** The hour's start, Melbourne time with its offset: "2026-10-14T07:00:00+11:00". */
  time: string;
  movements_per_hour: number;
  activity: ApiActivityLevel;
  weather: { temperature_2m: number; precipitation: number; wind_speed_10m: number };
}

/**
 * One counter's next twenty-four hours.
 *
 * The thresholds are the counter's own: quiet up to quiet_max, busy from
 * busy_min, moderate between. Every forecast hour on 2026-10-14 obeyed that
 * rule, ends included.
 */
export interface ApiAvailableForecast {
  status: 'available';
  sensor: ApiActivitySensor;
  model: string;
  fallback_reason?: string | null;
  weather_source: string;
  activity_thresholds: { quiet_max: number; busy_min: number };
  warnings: string[];
  hourly: ApiActivityHour[];
}

/** A counter with no trained model: "model_missing", and no thresholds. */
export interface ApiUnavailableForecast {
  status: 'unavailable';
  sensor: ApiActivitySensor;
  code: string;
  reason: string;
  hourly: [];
}

/** GET /api/pedestrian-activities/forecast */
export interface ApiActivityForecast {
  generated_at: string;
  timezone: string;
  forecasts: (ApiAvailableForecast | ApiUnavailableForecast)[];
}
