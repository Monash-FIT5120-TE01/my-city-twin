/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHICH SIDE OF THE BUILDING, AND HOW FAR UP
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The step between "I live on the twelfth floor, facing the park" and a
 *   point in the scene the sun can be tested against.
 *
 * WHY THE SIDES ARE FOUND RATHER THAN OFFERED
 *   The obvious control is eight compass buttons. It is also wrong: most
 *   buildings do not have eight sides, and offering "north-west" for a tower
 *   with four square faces asks somebody to answer a question about their own
 *   home incorrectly. So the sides come out of the footprint, and the
 *   interface can only offer the ones that exist.
 *
 * WHAT A "FLOOR" IS WORTH HERE
 *   The records give a storey count, not a floor-to-floor height, so the
 *   height of a floor is the building divided by its storeys. That is an
 *   average: a tower with a double-height lobby has every flat above it
 *   placed slightly low. The error is a metre or two in a model whose
 *   footprints are already rounded, and it is stated in the interface rather
 *   than hidden.
 */

import type { Massing } from '../data/model';

const DEG = Math.PI / 180;

/** One side of a building: where it is, which way it looks, how long it is. */
export interface Facade {
  /** Compass bearing the wall FACES, degrees: 0 north, 90 east. */
  bearingDeg: number;
  /** The eight-point name for that bearing, for the interface to show. */
  compass: string;
  /** Middle of the side, east/north metres. */
  midpointEN: [number, number];
  /** Total length of wall facing this way, metres. */
  lengthM: number;
}

const COMPASS = [
  'North',
  'North-east',
  'East',
  'South-east',
  'South',
  'South-west',
  'West',
  'North-west',
] as const;

/** Which of the eight points a bearing belongs to. */
export function compassOf(bearingDeg: number): string {
  const wrapped = ((bearingDeg % 360) + 360) % 360;
  return COMPASS[Math.round(wrapped / 45) % 8];
}

/**
 * Twice the signed area of a ring. Positive means counter-clockwise.
 *
 * Needed only for its SIGN: it says which side of an edge is the inside, and
 * so which way the wall faces. Get it backwards and every window in the city
 * looks into the building it is part of.
 */
function signedArea(ring: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    total += ax * by - bx * ay;
  }
  return total;
}

/**
 * The largest outer ring among the parts that reach a given height.
 *
 * THE HEIGHT FILTER IS NOT A REFINEMENT, IT IS THE CORRECTION.
 *   A tower on a podium is several parts. The largest ring belongs to the
 *   podium, because a podium is wide and a tower is not — so choosing by area
 *   alone put every window, on every floor, on the edge of the podium. For a
 *   flat on the tenth floor that is a point in mid-air beside the building,
 *   and the sunlight measured there is the sunlight of a place nobody lives.
 *
 *   Filtering first by "does this part reach the floor being asked about"
 *   leaves the tower, and the largest ring among what is left is the tower's.
 *
 * It also means the sides on offer CHANGE with the floor, which is correct: a
 * podium may face four ways and the tower above it only two.
 */
function mainOutline(parts: Massing[], atAhdM?: number): [number, number][] | null {
  /*
   * Both ends of the part, not just its roof.
   *
   * Filtering on topAhdM alone let a part that FLOATS — a bridge between two
   * towers, a podium overhang recorded with its own base — describe a floor
   * underneath it, where that part is not. A review found floor 1 taking its
   * outline from a part spanning 30 to 40 metres and placing the window
   * fifteen metres past the end of the building that is actually there.
   */
  if (atAhdM === undefined) {
    return largestRing(parts);
  }

  /*
   * NO FALLBACK. If nothing spans the height asked about, there is no outline
   * there, and returning the building's general shape instead would put a
   * window in thin air between two parts — a review found floor 6 of a
   * building made of a 0-10 m part and a 30-40 m part taking its outline from
   * the upper one and placing a window at 16 m, where nothing stands.
   *
   * An empty answer becomes "no sides at this floor", which is true.
   */
  const reaching = parts.filter(
    (part) => part.topAhdM >= atAhdM && part.baseAhdM <= atAhdM,
  );
  return reaching.length > 0 ? largestRing(reaching) : null;
}

/** The biggest outer ring in a set of parts. */
function largestRing(parts: Massing[]): [number, number][] | null {
  const usable = parts;

  let best: [number, number][] | null = null;
  let bestArea = 0;
  for (const part of usable) {
    for (const polygon of part.footprint) {
      const ring = polygon[0];
      if (!ring || ring.length < 3) continue;
      const area = Math.abs(signedArea(ring));
      if (area > bestArea) {
        bestArea = area;
        best = ring;
      }
    }
  }
  return best;
}

/**
 * Walls shorter than this are not a side of the building, they are a corner
 * cut or a bay window. Offering them as somewhere to live would bury the
 * four real answers in a list of fifteen.
 */
const MIN_SIDE_M = 6;

/**
 * The sides of a building, longest first.
 *
 * Edges are gathered into the eight compass sectors and each sector reported
 * once, because a facade with a kink in it is still one side to the person
 * living behind it. The point returned is the middle of the LONGEST run in
 * that sector rather than the average of the sector: an average can land off
 * the building entirely when a side wraps around a courtyard.
 */
export function facadesOf(parts: Massing[], atAhdM?: number): Facade[] {
  const ring = mainOutline(parts, atAhdM);
  if (!ring) return [];

  const clockwise = signedArea(ring) < 0;

  const sectors = new Map<
    number,
    { lengthM: number; longest: number; midpointEN: [number, number]; bearingDeg: number }
  >();

  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[(i + 1) % ring.length];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) continue;

    /*
     * The outward normal. For a counter-clockwise ring the inside is to the
     * left of travel, so the outside is to the right: (dy, -dx). A clockwise
     * ring is the mirror of that.
     */
    const outE = clockwise ? -dy / length : dy / length;
    const outN = clockwise ? dx / length : -dx / length;

    const bearing = ((Math.atan2(outE, outN) / DEG) % 360 + 360) % 360;
    const sector = Math.round(bearing / 45) % 8;

    const found = sectors.get(sector);
    const midpoint: [number, number] = [(ax + bx) / 2, (ay + by) / 2];
    if (!found) {
      sectors.set(sector, {
        lengthM: length,
        longest: length,
        midpointEN: midpoint,
        bearingDeg: bearing,
      });
    } else {
      found.lengthM += length;
      if (length > found.longest) {
        found.longest = length;
        found.midpointEN = midpoint;
        found.bearingDeg = bearing;
      }
    }
  }

  return [...sectors.entries()]
    .filter(([, side]) => side.lengthM >= MIN_SIDE_M)
    .map(([sector, side]) => ({
      bearingDeg: side.bearingDeg,
      compass: COMPASS[sector],
      midpointEN: side.midpointEN,
      lengthM: side.lengthM,
    }))
    .sort((a, b) => b.lengthM - a.lengthM);
}

/**
 * How high off the ground a floor is, when the records do not say.
 *
 * Only used when the storey count is missing, which it is for most buildings
 * in the extract. Three metres is an ordinary residential floor-to-floor and
 * errs low, which puts a flat slightly deeper into the shade than it is.
 */
export const ASSUMED_FLOOR_M = 3;

/** How far above its own floor a window sits — roughly a sill, not an eye. */
const SILL_M = 1.2;

/** How far out from the wall to stand the measurement. */
const CLEAR_OF_WALL_M = 0.5;

/**
 * A place to measure sunlight from: a point on the outside of a wall, the
 * height it sits at, and the way it looks.
 *
 * It is NOT a window. Nothing in the data says where the windows are, so this
 * is one representative point on the side of a building at the height of a
 * floor — which is what the interface tells the reader it is.
 */
export interface WindowPlace {
  /** Where the measurement is taken, east/north metres. */
  en: [number, number];
  /** Its height above the datum, metres AHD. */
  ahdM: number;
  /** The way it looks, degrees. */
  facingDeg: number;
  /** True when the floor height was assumed rather than taken from a record. */
  floorHeightAssumed: boolean;
}

/**
 * A point just outside a given floor of a given side.
 *
 * Returns null when the floor asked for is not in the building. Clamping
 * silently to the top would answer a question nobody asked: somebody who
 * types 30 into a 17-storey building has made a mistake, and a figure handed
 * back regardless looks like a confirmation of it.
 */
/**
 * How high off the datum a given floor sits.
 *
 * Exported because the SIDES and the POINT must be chosen at the same height
 * — the sides come from the parts that reach it, and picking them at one
 * height and the point at another is how a window ends up on a facade that
 * is not there.
 */
export function floorAhdM(
  parts: Massing[],
  floor: number,
  floorsAboveGround: number | null,
): number | null {
  if (!Number.isInteger(floor) || floor < 1 || parts.length === 0) return null;

  const baseAhdM = Math.min(...parts.map((part) => part.baseAhdM));
  const topAhdM = Math.max(...parts.map((part) => part.topAhdM));

  const known = floorsAboveGround !== null && floorsAboveGround > 0;
  if (known && floor > floorsAboveGround) return null;

  const floorHeightM = known ? (topAhdM - baseAhdM) / floorsAboveGround : ASSUMED_FLOOR_M;
  const ahdM = baseAhdM + floorHeightM * (floor - 1) + SILL_M;
  return ahdM > topAhdM ? null : ahdM;
}

/**
 * A point just outside a given floor of a given side.
 *
 * The three things it needs are the building's parts (for its base, its top
 * and how tall it is), which side was chosen, and which floor. The storey
 * count comes from the building record and may be missing, in which case the
 * height of a floor is assumed and `floorHeightAssumed` says so.
 *
 * Returns null when the floor asked for is not in the building — above the
 * recorded storeys, above the modelled roof, or not a whole number at all.
 * Clamping to the top instead would answer a question nobody asked: somebody
 * who types 30 into a 17-storey building has made a mistake, and a figure
 * handed back regardless looks like a confirmation of it.
 *
 * The point it returns is half a metre off the wall and may still be inside
 * another part of the same building; clearOfBuildings is what deals with
 * that, and the caller is expected to use it.
 */
export function windowPlace(
  parts: Massing[],
  facade: Facade,
  floor: number,
  floorsAboveGround: number | null,
): WindowPlace | null {
  /*
   * Above the roof, or not a floor at all. Reachable without a storey count:
   * three metres a floor is a guess, and on a squat building with a tall
   * ground floor the guess runs out before the storeys do.
   */
  const ahdM = floorAhdM(parts, floor, floorsAboveGround);
  if (ahdM === null) return null;

  const known = floorsAboveGround !== null && floorsAboveGround > 0;

  const [midE, midN] = facade.midpointEN;
  const outE = Math.sin(facade.bearingDeg * DEG);
  const outN = Math.cos(facade.bearingDeg * DEG);

  return {
    en: [midE + outE * CLEAR_OF_WALL_M, midN + outN * CLEAR_OF_WALL_M],
    ahdM,
    facingDeg: facade.bearingDeg,
    floorHeightAssumed: !known,
  };
}

/** Standard even-odd test, on a ring already in scene metres. */
function insideRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is this point inside solid building at this height? */
function insideSolid(
  en: [number, number],
  ahdM: number,
  city: Massing[],
): boolean {
  const [x, y] = en;
  for (const part of city) {
    if (ahdM < part.baseAhdM || ahdM > part.topAhdM) continue;
    for (const polygon of part.footprint) {
      const outer = polygon[0];
      if (!outer || outer.length < 3) continue;
      if (!insideRing(x, y, outer)) continue;

      // A courtyard is a hole in the plan, and standing in one is outdoors.
      let inHole = false;
      for (let h = 1; h < polygon.length; h++) {
        if (insideRing(x, y, polygon[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

/**
 * How finely the walk outward is checked.
 *
 * It is a swept path being approximated by points, so the step is the widest
 * obstruction that can hide between two of them. A review slipped a
 * neighbour 0.2 m thick through a half-metre step; at 0.05 m the only things
 * that fit between samples are thinner than any wall in the data.
 */
const SWEEP_M = 0.05;

/**
 * How far out to look for open air before giving up, metres.
 *
 * DELIBERATELY SHORT. Stepping outward moves the measurement away from the
 * flat it is supposed to describe, and every metre of that is sky the real
 * window does not have. Four metres covers the case this exists for — a
 * point half a metre off one wall landing just inside a part that abuts it —
 * and refuses the case it must not paper over, which is a facade buried
 * deep inside a complex. There, no point on that side is a window, and
 * saying so is better than answering about somewhere else.
 */
const MAX_CLEARANCE_M = 4;

/**
 * ── GETTING THE MEASUREMENT OUT OF THE WALL, WITHOUT GOING THROUGH ANYTHING ─
 *
 * The side of a building is chosen from its largest outline at that height,
 * and a large building is several overlapping parts. So the midpoint of the
 * "east side" can sit INSIDE a wing of the same building that the outline
 * does not describe — half a metre out from one wall and well within another.
 * A viewpoint inside solid geometry sees a sky made of the roof above it, and
 * reports a confident number for a place with no window in it.
 *
 * So the point steps outward. The rule about WHAT it may step through is the
 * whole of the correctness here:
 *
 *   through its OWN building   yes. It is escaping its own geometry, and the
 *                              flat is behind whichever of those walls it
 *                              ends up outside of.
 *   through a NEIGHBOUR        never. A first version allowed it, and a
 *                              review found a point moved from inside a
 *                              neighbour to just beyond it — the obstruction
 *                              north of it went from 87 degrees to nothing,
 *                              and the panel reported the sunlight on the far
 *                              side of a building as the sunlight at
 *                              somebody's window.
 *
 * So a neighbour ends the search immediately. The flat is behind it, and
 * there is no honest measurement to take on this side.
 */
export function clearOfBuildings(
  place: WindowPlace,
  homeParts: Massing[],
  neighbours: Massing[],
): WindowPlace | null {
  const outE = Math.sin(place.facingDeg * DEG);
  const outN = Math.cos(place.facingDeg * DEG);

  /*
   * The walk starts BEHIND the point, at the wall itself.
   *
   * windowPlace has already pushed half a metre out from the facade, and that
   * half metre was never checked — a neighbour occupying it was stepped over
   * before the first test. Starting at -0.5 puts the wall back in the path.
   */
  /*
   * Counted in whole steps rather than accumulated in metres. Adding 0.05
   * repeatedly does not land on zero — it lands a hair below it, the "have I
   * reached the original point yet" test fails, and the answer comes back one
   * step further out than it should. Multiplying an integer does land there.
   */
  const steps = Math.round((CLEAR_OF_WALL_M + MAX_CLEARANCE_M) / SWEEP_M);

  for (let i = 0; i <= steps; i++) {
    const step = i * SWEEP_M - CLEAR_OF_WALL_M;
    const en: [number, number] = [
      place.en[0] + outE * step,
      place.en[1] + outN * step,
    ];

    // Walking into a neighbour is walking behind the thing that shades it.
    if (insideSolid(en, place.ahdM, neighbours)) return null;
    if (step >= -1e-9 && !insideSolid(en, place.ahdM, homeParts)) {
      return { ...place, en: step <= 1e-9 ? place.en : en };
    }
  }
  return null;
}
