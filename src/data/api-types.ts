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
