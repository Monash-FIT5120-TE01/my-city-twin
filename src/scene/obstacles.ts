/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE WALKER CANNOT WALK THROUGH
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   A lookup for "is this spot inside a building". Used only by the street
 *   view; nothing else in the app cares.
 *
 * WHY IT IS A GRID
 *   There are 4,443 footprint rings. Testing all of them every frame is
 *   thousands of point-in-polygon tests sixty times a second, for a question
 *   whose answer depends on the handful of buildings within a few metres.
 *   Bucketing them once by a coarse grid turns that into two or three tests.
 *
 *   The cell size is the trade: too fine and the index is mostly empty cells,
 *   too coarse and every lookup returns half a block. Fifty metres is about
 *   one Hoddle Grid frontage, which puts a small number of buildings in each.
 *
 * WHAT COUNTS AS A BUILDING HERE
 *   Only the parts that exist at the height being walked at. A roof plane
 *   starting forty metres up is not something a person on the pavement can
 *   walk into, and treating it as one would wall off arcades and undercrofts
 *   that are genuinely open at street level.
 *
 *   Courtyards count as open, because the renderer leaves them open. And the
 *   caller is expected to hand in the city as DRAWN — with the buildings a
 *   shown proposal replaces already taken out, and the proposal itself put
 *   in. Indexing the stored model instead gave invisible walls where a
 *   building had been demolished and let the walker through the tower
 *   standing in its place.
 *
 * WHAT IT IS NOT
 *   Ground with no building on it is not a footpath, not public, and not
 *   necessarily anywhere a person could stand. The model knows where
 *   buildings are and nothing else about the surface between them.
 */

import type { PolygonEN } from '../data/model';

const CELL_M = 50;

interface Obstacle {
  /** Outer ring first, then any courtyards. */
  rings: readonly (readonly (readonly [number, number])[])[];
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

/**
 * How much room the walker takes up, metres.
 *
 * Zero let the eye reach a wall exactly — and with a near plane of 0.3 m the
 * wall in front of you then vanishes through it while the collision test
 * still says you are outside. Standing a shoulder's width off is both more
 * honest and what stops that.
 */
const BODY_RADIUS_M = 0.35;

export interface ObstacleIndex {
  readonly cells: ReadonlyMap<string, readonly Obstacle[]>;
  readonly count: number;
}

const key = (e: number, n: number) => `${Math.floor(e / CELL_M)},${Math.floor(n / CELL_M)}`;

interface Part {
  footprint: PolygonEN[];
  baseAhdM: number;
  topAhdM: number;
  /** True for the lowest part of its building — the one sunk to the ground. */
  sinksToGround: boolean;
}

/**
 * Index the parts a walker at `heightAhdM` could run into.
 *
 * Built once when the street view opens, from the model that is already in
 * memory — no extra data and nothing fetched.
 */
export function indexObstacles(parts: readonly Part[], heightAhdM: number): ObstacleIndex {
  const cells = new Map<string, Obstacle[]>();
  let count = 0;

  for (const part of parts) {
    /*
     * Standing height has to be inside the part's vertical span — EXCEPT for
     * the lowest part of a building, which the renderer sinks to the ground
     * whatever its recorded base says. 7.2% of buildings record a base above
     * the ground plane; they are drawn standing on it, and a walker has to
     * meet the building that is actually there rather than the one the
     * column of numbers describes.
     */
    const reachesTheGround = part.sinksToGround;
    if (!reachesTheGround && (part.baseAhdM > heightAhdM || part.topAhdM < heightAhdM)) continue;
    if (reachesTheGround && part.topAhdM < heightAhdM) continue;

    for (const polygon of part.footprint) {
      const outer = polygon[0];
      if (!outer || outer.length < 3) continue;
      // Courtyards are kept. The renderer leaves the hole open, and treating
      // it as solid walls off ground that is visibly empty.
      const rings = polygon.filter((ring) => ring.length >= 3);
      const ring = outer;

      let minE = Infinity;
      let minN = Infinity;
      let maxE = -Infinity;
      let maxN = -Infinity;
      for (const [e, n] of ring) {
        if (e < minE) minE = e;
        if (n < minN) minN = n;
        if (e > maxE) maxE = e;
        if (n > maxN) maxN = n;
      }

      const obstacle: Obstacle = { rings, minE, minN, maxE, maxN };
      count++;

      for (let e = Math.floor(minE / CELL_M); e <= Math.floor(maxE / CELL_M); e++) {
        for (let n = Math.floor(minN / CELL_M); n <= Math.floor(maxN / CELL_M); n++) {
          const id = `${e},${n}`;
          const bucket = cells.get(id);
          if (bucket) bucket.push(obstacle);
          else cells.set(id, [obstacle]);
        }
      }
    }
  }

  return { cells, count };
}

/** Ray casting, the same rule replaces.ts uses. */
function inRing(e: number, n: number, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ei, ni] = ring[i];
    const [ej, nj] = ring[j];
    if (ni > n !== nj > n && e < ((ej - ei) * (n - ni)) / (nj - ni) + ei) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether a walker standing here would be inside a building. */
export function blocked(index: ObstacleIndex, east: number, north: number): boolean {
  const bucket = index.cells.get(key(east, north));
  if (!bucket) return false;

  for (const obstacle of bucket) {
    // The bounding box first: it rejects most candidates for four comparisons
    // rather than a walk around the whole ring.
    if (east < obstacle.minE || east > obstacle.maxE) continue;
    if (north < obstacle.minN || north > obstacle.maxN) continue;

    // Even-odd across every ring, so a courtyard reads as open.
    let inside = false;
    for (const ring of obstacle.rings) {
      if (inRing(east, north, ring)) inside = !inside;
    }
    if (inside) return true;
  }

  return false;
}

/**
 * Whether the walker, who is not a point, can stand here.
 *
 * Four points around the body rather than one. A single point lets you press
 * your eye against a wall, and past a certain closeness the wall crosses the
 * near plane and disappears while the test still says you are in the clear.
 */
function occupied(index: ObstacleIndex, east: number, north: number): boolean {
  return (
    blocked(index, east, north) ||
    blocked(index, east + BODY_RADIUS_M, north) ||
    blocked(index, east - BODY_RADIUS_M, north) ||
    blocked(index, east, north + BODY_RADIUS_M) ||
    blocked(index, east, north - BODY_RADIUS_M)
  );
}

/**
 * Walks a segment in pieces small enough not to step over anything.
 *
 * Testing only the two ends misses a wall thinner than the step. A run at
 * 5.5 m/s with a 0.1 s frame cap moves 0.55 m, which is wider than plenty of
 * real party walls — and grazing the corner of a large building qualifies
 * too, however big the building is.
 */
function reachable(
  index: ObstacleIndex,
  fromE: number,
  fromN: number,
  toE: number,
  toN: number,
): boolean {
  const span = Math.hypot(toE - fromE, toN - fromN);
  const steps = Math.max(1, Math.ceil(span / (BODY_RADIUS_M / 2)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (occupied(index, fromE + (toE - fromE) * t, fromN + (toN - fromN) * t)) return false;
  }
  return true;
}

/**
 * Where the walker actually ends up, given where they tried to go.
 *
 * Each axis is tried on its own after the diagonal fails, which is what makes
 * a wall something you slide along rather than something you stick to. Facing
 * a wall at an angle and pressing forward should take you along it; refusing
 * the whole move stops you dead and reads as a bug.
 */
export function slide(
  index: ObstacleIndex,
  fromE: number,
  fromN: number,
  toE: number,
  toN: number,
): [number, number] {
  if (reachable(index, fromE, fromN, toE, toN)) return [toE, toN];
  if (reachable(index, fromE, fromN, toE, fromN)) return [toE, fromN];
  if (reachable(index, fromE, fromN, fromE, toN)) return [fromE, toN];
  return [fromE, fromN];
}

/**
 * The nearest spot outside a building, for putting a walker down.
 *
 * WHY IT IS NEEDED
 *   The street view starts wherever the reader was looking — the measured
 *   spot if there is one, and otherwise the building the screen is about.
 *   That second case puts the camera INSIDE it, and now that walls are solid
 *   they cannot get out either: the view opens on the inside of a wall with
 *   no way to recover except leaving.
 *
 * HOW IT SEARCHES
 *   Rings outward, two metres at a time, taking the first free point it
 *   meets. Nearest rather than prettiest: whatever the reader asked to look
 *   at, standing just outside it is the closest honest answer to "here".
 *
 *   The search gives up rather than wandering. If nothing within the limit is
 *   clear — the middle of a very large block — it returns null, and the
 *   caller decides. Walking a person 300 m from the place they asked about
 *   would be worse than not moving them.
 *
 * WHAT IT DOES NOT CLAIM
 *   Free ground is ground with no building modelled on it. It is not a
 *   footpath, not public, and not necessarily somewhere a person could
 *   stand. The model knows where buildings are and nothing else.
 */
export function nearestFree(
  index: ObstacleIndex,
  east: number,
  north: number,
  maxRadiusM = 120,
): [number, number] | null {
  if (!occupied(index, east, north)) return [east, north];

  for (let radius = 2; radius <= maxRadiusM; radius += 2) {
    // More samples further out, so the spacing between tried points stays
    // roughly constant instead of thinning as the ring grows.
    const samples = Math.max(8, Math.round((Math.PI * radius) / 1.5));
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const e = east + Math.cos(angle) * radius;
      const n = north + Math.sin(angle) * radius;
      if (!occupied(index, e, n)) return [e, n];
    }
  }

  /*
   * Null, not the point that was asked for.
   *
   * Returning the blocked point looked harmless and was not: nobody checked,
   * so the walker was placed inside the building anyway and could not move
   * in any direction. A caller that cannot be told the search failed cannot
   * do anything sensible about it.
   */
  return null;
}
