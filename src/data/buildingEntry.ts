/*
 * ─────────────────────────────────────────────────────────────────────────
 * ONE EXISTING BUILDING, AS THE SCREENS USE IT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The source sends one row per roof plane; the screens want one building —
 *   its address, its centre, its top and its height. `summariseBuilding`
 *   makes that from the parts, and the adapter uses it for every building
 *   with an address (the search list).
 *
 * WHY A BUILDING WITHOUT AN ADDRESS GETS ONE TOO
 *   220 of the 1,548 buildings could not be matched to the property
 *   register, so they are not in the search list. Searching cannot reach
 *   them, but a double click on the map can, and a building that does
 *   nothing when it is asked for looks broken. `buildingEntry` finds the
 *   search entry when there is one and otherwise summarises the parts under
 *   a plain label that says the address is missing rather than inventing one.
 */

import type { BuildingMassing, CityModel, SearchableBuilding } from './model';
import { centroidOf } from './project';

/** The label of a building the property register has no address for. */
export const UNADDRESSED = 'Building without a recorded address';

/** One building from its parts: its centre, its true top and its height. */
export function summariseBuilding(
  buildingId: string,
  address: string,
  parts: BuildingMassing[],
): SearchableBuilding {
  const topAhdM = Math.max(...parts.map((part) => part.topAhdM));
  const baseAhdM = Math.min(...parts.map((part) => part.baseAhdM));
  return {
    buildingId,
    streetAddress: address,
    anchorEN: centroidOf(parts.flatMap((part) => part.footprint)),
    topAhdM,
    heightM: topAhdM - baseAhdM,
  };
}

/**
 * The building with this id: its search entry, or — for one with no address
 * — a summary of its parts under UNADDRESSED. Null when no part has the id.
 */
export function buildingEntry(
  model: Pick<CityModel, 'buildings' | 'searchable'>,
  buildingId: string,
): SearchableBuilding | null {
  const listed = model.searchable.find((b) => b.buildingId === buildingId);
  if (listed) return listed;
  const parts = model.buildings.filter((part) => part.parentId === buildingId);
  if (parts.length === 0) return null;
  return summariseBuilding(buildingId, UNADDRESSED, parts);
}
