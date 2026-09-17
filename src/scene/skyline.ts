/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT A WINDOW CAN SEE OF THE SKY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   One array per viewpoint: for each compass direction, how high the sun has
 *   to be before it clears whatever is in the way. Everything the city puts
 *   between a window and the sky, reduced to 360 numbers.
 *
 * WHY NOT ASK THE BUILDINGS AT EVERY TIME STEP
 *   sunlightAt.ts answers "is this spot in shadow" by testing the sun's ray
 *   against the ONE building being assessed, at every ten-minute step. That
 *   is ~85 tests a day against a handful of shapes, which is nothing.
 *
 *   A window has to be tested against the WHOLE city — about 4,400 footprints
 *   — because what shades somebody's flat is mostly their neighbours, not the
 *   proposal down the road. The same approach would be 85 x 4,400 shape tests
 *   for one answer, and it would repeat all of it for every date.
 *
 *   So the work is turned around. The skyline does not depend on the date or
 *   the time: it is a property of the viewpoint and the buildings. Build it
 *   once, and every time step afterwards is one array lookup. Changing the
 *   date reuses it. Only moving the viewpoint rebuilds it.
 *
 * THE MODEL, AND WHAT IT GETS WRONG
 *   Every building is a vertical prism: its footprint, extruded to its roof.
 *   No setbacks, no spires, no pitched roofs. A tower that steps in as it
 *   rises is treated as its widest part all the way up, so this OVERSTATES
 *   shading slightly. That is the same simplification the rest of the app
 *   makes — see massing.ts — and it is the conservative direction to err in
 *   for a question about losing sunlight.
 */

import type { Massing } from "../data/model";

const DEG = Math.PI / 180;

/**
 * One bucket per degree of compass.
 *
 * A degree is about 9 m at 500 m, which is finer than the footprints are
 * accurate. Closer in, a bucket covers less ground still. The cost of going
 * finer is paid on every lookup, and the accuracy is not there to collect.
 */
export const HORIZON_BUCKETS = 360;

/**
 * The altitude, in degrees, that the sun must exceed in each compass
 * direction to reach the viewpoint. Zero means open sky to the horizon.
 */
export type Skyline = Float32Array;

/** Compass bearing from one point to another: 0 is north, 90 is east. */
function bearingDeg(dEast: number, dNorth: number): number {
  const deg = Math.atan2(dEast, dNorth) / DEG;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * The smaller angle between two bearings, 0 to 180.
 *
 * Needed wherever compass directions are compared, because 359 and 1 are two
 * degrees apart and subtracting them says 358.
 */
export function bearingGap(a: number, b: number): number {
  const gap = Math.abs(((a - b) % 360) + 360) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/**
 * ── WHY THIS INTERSECTS RATHER THAN SAMPLES ──────────────────────────────
 *
 * The first version walked each edge in steps and dropped a sample into
 * whichever bucket it landed in. It leaked. The step was chosen from the
 * distance to the edge's MIDPOINT, and an edge seen end-on has a nearest
 * point far closer than its middle — so the samples spread over more than a
 * degree each and skipped buckets between them. A review ran the function
 * against a wall two metres away and found 88 buckets still reading zero
 * with a solid building across them: not a rounding error, a hole in a wall
 * that the sun came through.
 *
 * So the edge is not sampled at all now. For each compass bucket its arc
 * covers, the edge is CLIPPED to that bucket's one-degree wedge and measured
 * where it comes nearest inside it. Every bucket the edge spans is visited
 * once, by construction, and none can be skipped, because the loop is over
 * the buckets rather than over the wall.
 *
 * It is also cheaper on long walls: a 200 m facade seen from 500 m away
 * covers about twenty buckets and costs twenty intersections, where the
 * sampler took a sample every nine metres whether or not it changed anything.
 */

/** Where a segment is closest to the origin, between two positions along it. */
function nearestBetween(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  fromT: number,
  toT: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;

  // The foot of the perpendicular, as a position along the segment.
  const lengthSq = dx * dx + dy * dy;
  const foot = lengthSq === 0 ? 0 : -(ax * dx + ay * dy) / lengthSq;

  const at = (t: number) => Math.hypot(ax + dx * t, ay + dy * t);

  let nearest = Math.min(at(fromT), at(toT));
  if (foot > fromT && foot < toT) nearest = Math.min(nearest, at(foot));
  return nearest;
}

/**
 * How near a segment comes to the origin within one bucket's wedge of sky.
 *
 * The bucket is a band of directions, not a direction, so the honest answer
 * is the closest the wall comes anywhere inside that band. The segment is
 * clipped to the wedge and measured on what is left; null when it does not
 * enter the wedge at all.
 *
 * Bearing varies monotonically along a segment that does not pass through the
 * origin, so the clip is a single interval and can be found by intersecting
 * the two edges of the wedge.
 */
function nearestWithinWedge(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  fromDeg: number,
  toDeg: number,
): number | null {
  const dx = bx - ax;
  const dy = by - ay;

  /* Where the segment crosses one edge of the wedge, as a position along it. */
  const crossing = (deg: number): number | null => {
    const theta = deg * DEG;
    const dirE = Math.sin(theta);
    const dirN = Math.cos(theta);
    // Solve (A + t*D_edge) x D_ray = 0 for t.
    const denom = dx * dirN - dy * dirE;
    if (Math.abs(denom) < 1e-12) return null;
    const t = (ay * dirE - ax * dirN) / denom;
    // Only the half-line in front of the viewpoint counts.
    const px = ax + dx * t;
    const py = ay + dy * t;
    if (px * dirE + py * dirN <= 0) return null;
    return t;
  };

  const inWedge = (t: number) => {
    const bearing = bearingDeg(ax + dx * t, ay + dy * t);
    let offset = bearing - fromDeg;
    while (offset < 0) offset += 360;
    while (offset >= 360) offset -= 360;
    return offset <= toDeg - fromDeg;
  };

  let lo = 0;
  let hi = 1;
  const edges = [crossing(fromDeg), crossing(toDeg)].filter(
    (t): t is number => t !== null && t > 0 && t < 1,
  );

  if (edges.length > 0) {
    const bounds = [0, ...edges, 1].sort((m, n) => m - n);
    let found = false;
    for (let i = 0; i < bounds.length - 1; i++) {
      const middle = (bounds[i] + bounds[i + 1]) / 2;
      if (inWedge(middle)) {
        lo = bounds[i];
        hi = bounds[i + 1];
        found = true;
        break;
      }
    }
    if (!found) return null;
  } else if (!inWedge(0.5)) {
    return null;
  }

  return nearestBetween(ax, ay, bx, by, lo, hi);
}

/**
 * The skyline a viewpoint sees, given everything that might stand in the way.
 *
 * The viewpoint's OWN building belongs in `occluders` as much as any other.
 * Its far wing shades it, its other tower shades it, and the wall it is
 * mounted on blocks everything behind it — the intersection above gets all
 * three right, including the wall it is half a metre from, because a ray
 * that runs parallel to that wall does not meet it.
 */
export function buildSkyline(
  fromEN: [number, number],
  fromAhdM: number,
  occluders: Massing[],
): Skyline {
  const skyline = new Float32Array(HORIZON_BUCKETS);
  const [fromE, fromN] = fromEN;

  for (const massing of occluders) {
    /*
     * A roof at or below the viewpoint can never block it. The ray to the
     * sun only ever rises, so from the first metre onwards it is already
     * above anything shorter than the viewpoint. This skips most of the city
     * for a window up a tower, which is where the saving is largest.
     */
    const rise = massing.topAhdM - fromAhdM;
    if (rise <= 0) continue;

    /*
     * ── A PART THAT FLOATS IS TREATED AS SOLID TO THE GROUND ─────────────
     *
     * `rise` is measured to the roof and the underside is not consulted. For
     * the overwhelming majority of the extract that is exact, because the
     * part sits on the ground. For the few that do not — a bridge between two
     * towers, an overhang recorded with its own base — it is wrong in a known
     * direction: the sun can pass UNDER such a part at a low enough angle,
     * and here it does not.
     *
     * The reason is that a floating part blocks a BAND of sky, between the
     * angle to its underside and the angle to its roof, and a skyline holds
     * one number per direction. It cannot express a band. Given the choice
     * between overstating shading and letting the sun through the middle of a
     * building, this overstates — the same direction the flat-topped prism
     * model already errs in, and the safe one for a question about LOSING
     * sunlight.
     */

    /*
     * EVERY ring, not just the outer one.
     *
     * A courtyard's walls were skipped as "cannot shade anything outside it",
     * which is true and beside the point: a window can be IN the courtyard,
     * and clearOfBuildings deliberately accepts such a point as open air.
     * Skipping the hole gave those windows a sky with the enclosing walls
     * missing — a review measured 43 degrees where the wall stands at 75.
     *
     * Including the holes costs nothing from outside: the outer ring is
     * always nearer along the same bearing, and the nearer wall already wins
     * the max.
     */
    for (const polygon of massing.footprint) {
      for (const ring of polygon) {
        if (!ring || ring.length < 2) continue;

        for (let i = 0; i < ring.length; i++) {
          const ax = ring[i][0] - fromE;
          const ay = ring[i][1] - fromN;
          const bx = ring[(i + 1) % ring.length][0] - fromE;
          const by = ring[(i + 1) % ring.length][1] - fromN;

          if (ax === bx && ay === by) continue;

          const azA = bearingDeg(ax, ay);
          const azB = bearingDeg(bx, by);

          /*
           * The arc the edge covers, taken the SHORT way round. A segment seen
           * from a point off it never spans more than half the compass, so the
           * short arc is always the one over the wall rather than around the
           * back of the viewer.
           */
          let span = azB - azA;
          if (span > 180) span -= 360;
          if (span < -180) span += 360;

          const from = span >= 0 ? azA : azB;
          const width = Math.abs(span);

          const firstBucket = Math.floor(from);
          const lastBucket = Math.floor(from + width);

          for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
            const wrapped =
              ((bucket % HORIZON_BUCKETS) + HORIZON_BUCKETS) % HORIZON_BUCKETS;

            /*
             * The NEAREST the wall comes anywhere inside this one degree —
             * not where a ray through the middle happens to cross it.
             *
             * Two earlier versions got this wrong in opposite directions. A
             * centre ray misses the wall entirely in the bucket at each end
             * of the arc, leaving occupied buckets reading open sky. Patching
             * that by writing the corner's own distance into its bucket then
             * over-blocked: a corner a metre away lends its 60 degrees to a
             * whole bucket the wall only clips.
             *
             * Clipping the segment to the bucket and taking the closest point
             * on what is left is neither. It is the real answer for the
             * direction band the bucket stands for.
             */
            const distance = nearestWithinWedge(
              ax,
              ay,
              bx,
              by,
              bucket,
              bucket + 1,
            );
            if (distance === null || distance < 0.05) continue;

            const altitude = Math.atan2(rise, distance) / DEG;
            if (altitude > skyline[wrapped]) skyline[wrapped] = altitude;
          }
        }
      }
    }
  }

  return skyline;
}

/**
 * Is the sun in the open, seen from the viewpoint this skyline belongs to?
 *
 * `facingDeg` is the way a window looks. Given one, the half of the sky
 * behind the wall is closed: a flat facade sees a hemisphere and no more, and
 * that is exact rather than modelled. Omit it for a viewpoint in the open,
 * such as a spot on the ground, which sees all round.
 */
export function sunReaches(
  skyline: Skyline,
  sun: { altitudeDeg: number; azimuthDeg: number },
  facingDeg?: number,
): boolean {
  if (sun.altitudeDeg <= 0) return false;
  if (facingDeg !== undefined && bearingGap(sun.azimuthDeg, facingDeg) >= 90)
    return false;

  const bucket =
    Math.floor(((sun.azimuthDeg % 360) + 360) % 360) % HORIZON_BUCKETS;
  return sun.altitudeDeg > skyline[bucket];
}
