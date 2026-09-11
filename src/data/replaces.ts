/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT A PROPOSAL STANDS IN PLACE OF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Which existing buildings an approved development is built over, so that
 *   showing the proposal can take them down.
 *
 * WHY IT IS NEEDED
 *   Every one of the 133 approved components sits on ground that is already
 *   built on — that is what redevelopment is. Until now both were drawn, so
 *   the proposal and the building it replaces occupied the same space. It
 *   showed as a flicker, which is the visible half of the problem.
 *
 *   The invisible half is worse. The switch is labelled "Existing" against
 *   "Approved Plan", and what it actually compared was the existing city
 *   against the existing city PLUS the proposal. Nothing was ever replaced.
 *   Both solids also cast shadow, so a podium wider than the tower above it
 *   was darkening a street on behalf of a building that the plan demolishes.
 *
 * HOW A BUILDING IS DECIDED TO BE UNDER A PROPOSAL
 *   Its centre falls inside one of the proposal's footprints. Centres rather
 *   than any overlap, because footprints touch along party walls all down a
 *   block and an overlap test takes the neighbours with it — a bounding-box
 *   version of this counted up to 31 buildings under a single component, and
 *   by centre the same data gives a median of 1 and a maximum of 10.
 *
 * PER BUILDING, NOT PER PART
 *   A building arrives as several roof planes, each with its own footprint.
 *   Tested individually some planes of one building fall inside and some do
 *   not, which takes half a building away and leaves the rest hanging. The
 *   decision is made once for the whole building, from the centre of its
 *   largest part, and then applies to all of its parts.
 */

import type { PolygonEN } from './model';

/** Ray casting. The ring is closed or not; both work. */
export function pointInRing([x, y]: [number, number], ring: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function ringArea(ring: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/** The ring without its repeated closing vertex. */
function openRing(ring: readonly [number, number][]): readonly [number, number][] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = ring.length > 1 && first[0] === last[0] && first[1] === last[1];
  return closed ? ring.slice(0, -1) : ring;
}

/** Area centroid, by the shoelace formula. Not guaranteed to be inside. */
function areaCentroid(ring: readonly [number, number][]): [number, number] {
  const vertices = openRing(ring);
  let twiceArea = 0;
  let east = 0;
  let north = 0;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const [xj, yj] = vertices[j];
    const [xi, yi] = vertices[i];
    const cross = xj * yi - xi * yj;
    twiceArea += cross;
    east += (xj + xi) * cross;
    north += (yj + yi) * cross;
  }

  if (twiceArea === 0) {
    // Degenerate: every vertex collinear. Fall back to the mean, which is at
    // least on the line.
    let mx = 0;
    let my = 0;
    for (const [x, y] of vertices) {
      mx += x;
      my += y;
    }
    return [mx / vertices.length, my / vertices.length];
  }

  return [east / (3 * twiceArea), north / (3 * twiceArea)];
}

/**
 * True when the point is in the solid part of a polygon — inside its outer
 * ring and not inside any of its holes. Even-odd, so nested rings work out.
 */
export function insidePolygon(
  point: [number, number],
  polygon: readonly (readonly [number, number][])[],
): boolean {
  let inside = false;
  for (const ring of polygon) {
    if (ring.length >= 3 && pointInRing(point, ring)) inside = !inside;
  }
  return inside;
}

/** Latitudes worth cutting across, best first. */
function scanlines(
  polygon: readonly (readonly [number, number][])[],
  preferred: number,
): number[] {
  const ys = new Set<number>();
  for (const ring of polygon) for (const [, y] of ring) ys.add(y);
  const sorted = [...ys].sort((a, b) => a - b);

  // Between consecutive vertex latitudes, where a horizontal cut is least
  // likely to graze a vertex and most likely to have width.
  const between = sorted.slice(0, -1).map((y, i) => (y + sorted[i + 1]) / 2);
  return [preferred, ...between];
}

/**
 * A point that really is inside the solid part of a footprint.
 *
 * WHY NEITHER CENTROID WILL DO
 *   Neither the average of the vertices nor the area centroid has to lie
 *   within the shape. A building around a light well or an arcade — the
 *   Hoddle Grid is full of them — puts its centroid in the opening. In the
 *   bundled data ten buildings do exactly that, every one of them landing in
 *   its own courtyard. The consequence is not cosmetic: a proposal occupying
 *   only the courtyard would be judged to stand on the whole building and
 *   would demolish it, shadows included.
 *
 *   The vertex average was worse again, and not even invariant to the shape:
 *   adding collinear vertices along one edge dragged it towards that edge, so
 *   two identical outlines described with different vertex counts disagreed.
 *
 * HOW A POINT INSIDE IS FOUND
 *   Take the area centroid if it is in the solid. Otherwise cut horizontally,
 *   collect where the cut crosses EVERY ring — holes included, so a courtyard
 *   interrupts the span rather than being counted as part of it — and take
 *   the middle of the widest crossing whose midpoint really is inside. The
 *   idea is PostGIS's ST_PointOnSurface.
 *
 *   Several latitudes are tried rather than one. A single cut through the
 *   centroid can miss: it can run along an edge, through a pinch point, or
 *   across a shape whose centroid latitude has no solid at all.
 *
 * WHEN NOTHING IS INSIDE
 *   Degenerate rings exist — three collinear points, a bow-tie that crosses
 *   itself. There is no interior to find, so the centroid is returned and the
 *   caller is told by `representativePointIsInterior` that it is not a point
 *   on the surface. Silently handing back a point outside the building was
 *   how ten of them ended up in their own courtyards.
 */
export function representativePoint(
  polygon: readonly (readonly [number, number][])[],
): [number, number] {
  const outer = polygon[0];
  if (!outer || outer.length < 3) return [NaN, NaN];

  const centroid = areaCentroid(outer);
  if (insidePolygon(centroid, polygon)) return centroid;

  let best: [number, number] | null = null;
  let widest = 0;

  for (const y of scanlines(polygon, centroid[1])) {
    const crossings: number[] = [];
    for (const ring of polygon) {
      if (ring.length < 3) continue;
      const vertices = openRing(ring);
      for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [xi, yi] = vertices[i];
        const [xj, yj] = vertices[j];
        if (yi > y === yj > y) continue;
        crossings.push(xi + ((xj - xi) * (y - yi)) / (yj - yi));
      }
    }

    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const span = crossings[i + 1] - crossings[i];
      if (span <= widest) continue;
      const candidate: [number, number] = [(crossings[i] + crossings[i + 1]) / 2, y];
      // Verified rather than assumed: a tangency can pair two crossings that
      // are not either side of solid ground.
      if (!insidePolygon(candidate, polygon)) continue;
      widest = span;
      best = candidate;
    }
  }

  return best ?? centroid;
}

/** Whether `representativePoint` found real interior, or gave up. */
export function representativePointIsInterior(
  polygon: readonly (readonly [number, number][])[],
): boolean {
  return insidePolygon(representativePoint(polygon), polygon);
}

interface Part {
  parentId: string;
  footprint: PolygonEN[];
}

/**
 * The centre of each building, taken from its largest part.
 *
 * The largest part rather than the average of all of them: a tower with a
 * long low wing averages out to a point in the car park, and the question
 * being asked is which site this building stands on.
 */
export function buildingCentres(parts: readonly Part[]): Map<string, [number, number]> {
  const best = new Map<string, { area: number; centre: [number, number] }>();

  for (const part of parts) {
    for (const polygon of part.footprint) {
      const outer = polygon[0];
      if (!outer || outer.length < 3) continue;
      const area = ringArea(outer);
      const current = best.get(part.parentId);
      // The whole polygon, not just its outer ring: the building's own
      // courtyards have to interrupt the search, or the centre lands in one.
      if (!current || area > current.area) {
        best.set(part.parentId, { area, centre: representativePoint(polygon) });
      }
    }
  }

  return new Map([...best].map(([id, { centre }]) => [id, centre]));
}

/**
 * The buildings standing where this proposal is to be built.
 *
 * Pure, and given plain geometry rather than the model's own types, so the
 * rule can be tested on three squares instead of on the city.
 */
export function buildingsUnder(
  proposal: readonly PolygonEN[],
  centres: ReadonlyMap<string, [number, number]>,
): string[] {
  const under: string[] = [];

  for (const [id, centre] of centres) {
    const covered = proposal.some((polygon) => {
      const [outer, ...holes] = polygon;
      if (!outer || outer.length < 3) return false;
      if (!pointInRing(centre, outer)) return false;
      /*
       * A courtyard is not a demolition. The rings after the first are holes
       * — a light well, an arcade the plan keeps open — and the massing is
       * built with them, so a building standing in one is not standing under
       * the proposal at all.
       */
      return !holes.some((hole) => hole.length >= 3 && pointInRing(centre, hole));
    });
    if (covered) under.push(id);
  }

  return under;
}
