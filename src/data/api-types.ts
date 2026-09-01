/*
 * The shapes the staging API actually returns.
 *
 * Source: https://hackmd.io/@pcthanh0802/B1mhvcfufx, verified against live
 * responses on 2026-09-01. Where the document and the server disagreed, the
 * server wins and the difference is noted.
 *
 * Nothing outside src/data should import from this file. The rest of the app
 * uses the parsed types in ./model, so that a change on the backend is
 * absorbed in one place.
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
