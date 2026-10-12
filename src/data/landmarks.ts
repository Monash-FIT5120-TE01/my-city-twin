/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PLACES ANYBODY WOULD STEER BY, PUT ONTO THE BUILDINGS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The landmarks as the rest of the app sees them: the API's rows turned
 *   into scene coordinates and, where the point lands inside a building,
 *   tied to that building. Nothing here draws anything — LandmarkTags does
 *   that, and the search reads the same list.
 *
 * WHY TIE THEM TO BUILDINGS
 *   The API sends a point and a name. On its own that is a pin; a pin on a
 *   building the model already knows is the building's name, which is what
 *   a reader standing in the street actually wants — "that is the Town
 *   Hall", and then everything the model can say about the Town Hall. The
 *   tie is geometric: the point falls inside the building's footprint. A
 *   point that falls in no footprint (a square, a park, the river bank) is a
 *   landmark with no building, and the tag stands on the ground instead.
 *
 * WHAT IS DELIBERATELY NOT DONE
 *   Nothing is corrected. The names keep the source's spelling, and a point
 *   that lands outside the model (one of the fifty-one, in Docklands) is
 *   kept, marked `inModel: false`, rather than dropped: the search still
 *   finds it and the map still marks it, on the ground beyond the last
 *   building, where it is.
 */

import { insidePolygon } from './replaces';
import { projectLonLat } from './project';
import { LOCAL_ORIGIN_WGS84 } from '../scene/frame';
import type { ApiLandmark } from './api-types';
import type { BuildingMassing, CityModel } from './model';

export interface Landmark {
  /** The source's own spelling. */
  name: string;
  address: string;
  /** Metres east and north of the scene origin. */
  en: [number, number];
  /** The building whose footprint holds the point, or null: a square, a park, outside the model. */
  buildingId: string | null;
  /** The top of that building, metres AHD — where a tag stands. Null without a building. */
  topAhdM: number | null;
  /** Inside the extent of the building model. Outside it there is no building to tie to. */
  inModel: boolean;
}

const [ORIGIN_E, ORIGIN_N] = projectLonLat(LOCAL_ORIGIN_WGS84.lon, LOCAL_ORIGIN_WGS84.lat);

/** One row's point in scene metres, the way the adapter does it for every building. */
export function landmarkEN(row: Pick<ApiLandmark, 'longitude' | 'latitude'>): [number, number] {
  const [e, n] = projectLonLat(Number(row.longitude), Number(row.latitude));
  return [e - ORIGIN_E, n - ORIGIN_N];
}

/**
 * The API's rows, placed in the scene and tied to buildings.
 *
 * WHICH BUILDING, WHEN SEVERAL CLAIM THE POINT
 *   A building arrives as one row per roof plane, and a point under a tower
 *   is inside every plane stacked above it — all the same building, so that
 *   is no contest. Footprints of DIFFERENT buildings can overlap too (a
 *   podium drawn under a neighbour's cantilever), and then the ground-level
 *   plane wins: it is the one a person at the point would be standing in.
 *
 * WHERE THE TAG STANDS
 *   On the top of the whole building, not of the plane that happened to
 *   hold the point: a tag on a two-storey podium with a forty-storey tower
 *   behind it would be drawn inside the tower.
 */
export function placeLandmarks(
  rows: readonly ApiLandmark[],
  model: Pick<CityModel, 'buildings' | 'extent'>,
): Landmark[] {
  const tops = buildingTops(model.buildings);
  const seen = new Set<string>();
  const out: Landmark[] = [];

  for (const row of rows) {
    const name = row.landmark_name.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const en = landmarkEN(row);
    if (!Number.isFinite(en[0]) || !Number.isFinite(en[1])) continue;

    const { minE, minN, maxE, maxN } = model.extent;
    const inModel = en[0] >= minE && en[0] <= maxE && en[1] >= minN && en[1] <= maxN;

    const building = inModel ? buildingAt(en, model.buildings) : null;
    out.push({
      name,
      address: row.address.trim(),
      en,
      buildingId: building,
      topAhdM: building ? (tops.get(building) ?? null) : null,
      inModel,
    });
  }

  return out;
}

/** The highest point of each building, over all its planes. */
function buildingTops(parts: readonly BuildingMassing[]): Map<string, number> {
  const tops = new Map<string, number>();
  for (const part of parts) {
    const top = tops.get(part.parentId);
    if (top === undefined || part.topAhdM > top) tops.set(part.parentId, part.topAhdM);
  }
  return tops;
}

/**
 * How far outside a footprint a point may fall and still be that building.
 *
 * The points are the source's, rounded, and a church's point can land two
 * metres beyond its own wall (St Francis: 2 m; Collins Street Baptist: 4 m).
 * That is a rounding error, not a different place. Anything further is left
 * on the ground on purpose: the booth in the Bourke Street Mall is 10 m from
 * the nearest shop and is not that shop, the underground stations are 10 to
 * 40 m from whatever stands over them, and the point for the State Library
 * is on its lawn, 22 m out — a tag on the lawn in front of the library is
 * the honest place for it.
 */
const NEAR_WALL_M = 6;

/**
 * The building whose footprint holds the point; ground-level planes first.
 * Failing that, the building whose wall is within NEAR_WALL_M of it.
 */
function buildingAt(point: [number, number], parts: readonly BuildingMassing[]): string | null {
  let found: BuildingMassing | null = null;
  for (const part of parts) {
    if (!part.footprint.some((polygon) => insidePolygon(point, polygon))) continue;
    if (!found || (part.sinksToGround && !found.sinksToGround)) found = part;
  }
  if (found) return found.parentId;

  // Every ring, not only the outer one: a point in a courtyard is outside
  // the solid part and inside the outer ring, and its nearest wall is the
  // courtyard's.
  let nearest = NEAR_WALL_M;
  for (const part of parts) {
    for (const polygon of part.footprint) {
      for (const ring of polygon) {
        const d = distanceToRing(point, ring);
        if (d < nearest) {
          nearest = d;
          found = part;
        }
      }
    }
  }
  return found?.parentId ?? null;
}

/** Shortest distance from the point to any edge of the ring. */
function distanceToRing([x, y]: [number, number], ring: readonly [number, number][]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // Where along the edge the point projects, clamped to the edge itself.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}
