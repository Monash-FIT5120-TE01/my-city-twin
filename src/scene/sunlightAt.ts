/*
 * ─────────────────────────────────────────────────────────────────────────
 * "HOW MUCH SUN DOES THIS TOWER TAKE FROM HERE?"
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The measurement behind the number on the Sunlight screen. Click a spot
 *   on the ground and this walks the whole day in ten-minute steps, asking
 *   at each one whether the proposal is standing between that spot and the
 *   sun, and adds up the minutes where it is.
 *
 * WHY THE NUMBER IS A DIFFERENCE, NOT A TOTAL
 *   It answers "what does this development change", not "how sunny is this
 *   spot". The second question needs every surrounding building and the real
 *   slope of the ground to be right, and neither is. The first only needs
 *   the proposal itself, which is modelled exactly. It is also the question
 *   the planning argument is actually about.
 *
 *   The consequence, stated on the card too: a spot already sitting in some
 *   existing building's shadow will still be reported as losing sun here.
 *
 * THE GEOMETRY, IN PLAIN TERMS
 *   Stand at the spot and look towards the sun. Walk up that line of sight.
 *   Every metre you rise, you also move a fixed distance horizontally
 *   towards the sun — 1/tan(altitude) of it. So the line of sight, seen
 *   from above, is just a straight line running towards the sun.
 *
 *   A building is a footprint with a bottom and a top. The line of sight
 *   passes through it exactly when the piece of that straight line between
 *   the building's bottom height and its top height crosses the footprint.
 *
 *   That makes the test a flat one: does this segment cross this polygon?
 *   No stepping along the ray, no approximation — it is exact, and it is
 *   why the whole day costs almost nothing to compute.
 *
 *              sun
 *               ╲
 *                ╲          ← line of sight, rising towards the sun
 *         ┌────┐  ╲
 *         │    │   ╲
 *         │    │    ╲
 *      ───┴────┴─────●───    ← the spot being measured
 *          building
 *
 * THE TEST THAT MATTERS MOST
 *   In sunlightAt.test.ts: a spot NORTH of the tower loses nothing, in any
 *   season. In Melbourne the sun never passes south of overhead, so it can
 *   never throw a shadow northwards. If that test ever passes minutes, the
 *   hemisphere has been flipped somewhere.
 */

import type { Development, PolygonEN, Ring } from '../data/model';
import { civilToInstant, solarPosition, type SimulationDate } from './solar';
import { SITE } from './frame';

const DEG = Math.PI / 180;

/** Sampling interval. Ten minutes matches the time slider's own step. */
export const STEP_MINUTES = 10;

/*
 * Wide enough to contain the whole civil day at this latitude in any season —
 * Melbourne's longest day runs from about 05:55 to 20:42 in daylight saving,
 * which the old 06:00-to-20:00 window cut at both ends. The altitude check
 * inside the loop is what actually bounds the day; this only has to be wider
 * than sunrise and sunset can ever be.
 */
const DAY_START_MIN = 3 * 60;
const DAY_END_MIN = 22 * 60;

export interface SunlightAtPoint {
  /** Minutes of direct sun with the proposal absent. */
  withoutProposalMin: number;
  /** Minutes of direct sun once it is built. */
  withProposalMin: number;
  /** The difference — what the development takes away. */
  lostMin: number;
  /**
   * First SAMPLE at which the shadow was found, or null if it never was.
   * The true arrival is within one step before it, and an episode shorter
   * than a step can be missed entirely — hence "from about" in the interface.
   */
  firstShadowLabel: string | null;
  /** Last sample at which it was still there. Same caveat. */
  lastShadowLabel: string | null;
  /** The sampling step, so the interface can say what the figure is worth. */
  stepMinutes: number;
}

/** Standard even-odd test. */
function pointInRing(x: number, y: number, ring: Ring): boolean {
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

function pointInPolygon(x: number, y: number, polygon: PolygonEN): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !pointInRing(x, y, outer)) return false;
  // A courtyard is not part of the building, so a ray through it is not blocked.
  return !holes.some((hole) => pointInRing(x, y, hole));
}

function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segmentCrossesPolygon(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  polygon: PolygonEN,
): boolean {
  if (pointInPolygon(ax, ay, polygon) || pointInPolygon(bx, by, polygon)) return true;
  for (const ring of polygon) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      if (segmentsCross(ax, ay, bx, by, ring[j][0], ring[j][1], ring[i][0], ring[i][1])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Is the sun, seen from this point, behind the proposal?
 *
 * Walking up the ray towards the sun traces a straight horizontal line: at
 * height z the ray sits `(z - receptorZ) / tan(altitude)` further towards the
 * sun's bearing. So the ray passes through a part exactly when the segment it
 * traces between that part's underside and its roof crosses the footprint —
 * an exact test, and cheaper than marching along the ray.
 */
export function blockedByDevelopment(
  receptorEN: [number, number],
  receptorAhdM: number,
  sun: { altitudeDeg: number; azimuthDeg: number },
  development: Development,
): boolean {
  if (sun.altitudeDeg <= 0) return false;

  const cot = 1 / Math.tan(sun.altitudeDeg * DEG);
  // Towards the sun, not away from it: the ray climbs in the sun's direction.
  const towardsE = Math.sin(sun.azimuthDeg * DEG);
  const towardsN = Math.cos(sun.azimuthDeg * DEG);

  for (const part of development.parts) {
    const low = Math.max(part.baseAhdM, receptorAhdM);
    const high = part.topAhdM;
    if (high <= low) continue;

    const aScale = (low - receptorAhdM) * cot;
    const bScale = (high - receptorAhdM) * cot;
    const ax = receptorEN[0] + towardsE * aScale;
    const ay = receptorEN[1] + towardsN * aScale;
    const bx = receptorEN[0] + towardsE * bScale;
    const by = receptorEN[1] + towardsN * bScale;

    for (const polygon of part.footprint) {
      if (segmentCrossesPolygon(ax, ay, bx, by, polygon)) return true;
    }
  }

  return false;
}

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Walks the day in ten-minute steps and counts what the proposal costs. */
export function sunlightAtPoint(
  receptorEN: [number, number],
  receptorAhdM: number,
  development: Development,
  date: SimulationDate,
): SunlightAtPoint {
  let withoutProposalMin = 0;
  let withProposalMin = 0;
  let firstShadow: number | null = null;
  let lastShadow: number | null = null;

  /*
   * Each sample stands for the step that FOLLOWS it, so the end of the range
   * is excluded. Counting both ends credited 85 samples of ten minutes to a
   * 840-minute window and reported 850.
   */
  for (let minutes = DAY_START_MIN; minutes < DAY_END_MIN; minutes += STEP_MINUTES) {
    const sun = solarPosition(
      civilToInstant(
        SITE.timeZone,
        date.year,
        date.month,
        date.day,
        Math.floor(minutes / 60),
        minutes % 60,
      ),
      { lat: SITE.lat, lon: SITE.lon, elevationM: SITE.elevationM },
    );

    if (sun.altitudeDeg <= 0) continue;
    withoutProposalMin += STEP_MINUTES;

    if (blockedByDevelopment(receptorEN, receptorAhdM, sun, development)) {
      if (firstShadow === null) firstShadow = minutes;
      lastShadow = minutes;
    } else {
      withProposalMin += STEP_MINUTES;
    }
  }

  return {
    withoutProposalMin,
    withProposalMin,
    lostMin: withoutProposalMin - withProposalMin,
    firstShadowLabel: firstShadow === null ? null : clock(firstShadow),
    lastShadowLabel: lastShadow === null ? null : clock(lastShadow),
    stepMinutes: STEP_MINUTES,
  };
}
