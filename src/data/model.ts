/*
 * What the rest of the application sees.
 *
 * Coordinates are already projected into the local east/north/up metric frame
 * (see scene/frame.ts) and every number is a number. Components below this
 * layer never touch latitude, longitude, or a numeric string.
 */

/** A ring of [east, north] pairs, metres from the local origin. */
export type Ring = [number, number][];

/** Outer ring first, then holes — courtyards must stay open. */
export type PolygonEN = Ring[];

export interface Massing {
  /** Stable key for React and for picking. */
  id: string;
  /** The thing this part belongs to: a building, or a development. */
  parentId: string;
  footprint: PolygonEN[];
  /** Metres AHD. The building's feet sit here, so terrain is already in. */
  baseAhdM: number;
  /** Metres AHD. */
  topAhdM: number;
  /** topAhdM - baseAhdM. Never negative; see adapter. */
  heightM: number;
  /** Largest footprint area among this part's polygons, m². For labelling. */
  areaM2: number;
  /**
   * True for the lowest part of its parent. Only these are sunk to the ground
   * plane; upper parts keep their own recorded base so the massing does not
   * gain a column of mass that is not there.
   */
  sinksToGround: boolean;
}

export interface BuildingMassing extends Massing {
  structureId: string;
  roofType: string;
  /**
   * False when the source row could not be trusted for 3D. Rendered in a
   * muted colour rather than dropped: a building removed from the scene
   * casts no shadow, and a missing shadow reads as "sunlit".
   */
  readyFor3d: boolean;
}

export type DevelopmentStatus = 'APPLIED' | 'APPROVED' | 'UNDER CONSTRUCTION';

export interface LandUse {
  useType: string;
  quantity: number;
  unit: string | null;
}

export interface DevelopmentMassing extends Massing {
  devKey: string;
  streetAddress: string;
  status: DevelopmentStatus;
  shapeType: 'podium' | 'tower' | 'extension';
  /** Centroid of the whole development, for the map pin. */
  anchorEN: [number, number];
  landUses: LandUse[];
}

/** A development as the project list and detail panel see it. */
export interface Development {
  devId: string;
  devKey: string;
  streetAddress: string;
  status: DevelopmentStatus;
  anchorEN: [number, number];
  /** Tallest component. This is the "162 m" on the Figma card. */
  maxHeightM: number;
  /** Highest point above the datum, for framing the camera. */
  topAhdM: number;
  parts: DevelopmentMassing[];
  landUses: LandUse[];
}

export interface CityModel {
  buildings: BuildingMassing[];
  developments: Development[];
  /** Bounds of everything, metres east/north. Used to frame the scene. */
  extent: { minE: number; minN: number; maxE: number; maxN: number };
  /** Where the data came from, for the provenance line in the UI. */
  source: 'live' | 'snapshot';
}
