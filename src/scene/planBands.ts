/*
 * ─────────────────────────────────────────────────────────────────────────
 * A PLAN'S BAND, KEPT OFF EVERY BUILDING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The pieces of a future plan's band (ui/planPlaces) that lie on open
 *   ground: each band is cut into cells about 2 m along and at most 2 m
 *   across, a cell is kept only if nine points over it (corners, edge
 *   middles, middle) are all outside every footprint, and the kept cells
 *   of each row are joined into one rectangle. PlanHighlight draws what
 *   comes back.
 *
 * WHY
 *   The bands are drawn from centrelines at a street's width, and a street's
 *   width is not where the buildings stop: measured across their whole
 *   width, 7–17% of the bands lay inside a footprint (review, 2026-10-29).
 *   Under a building the band is hidden, but it is still paint on a
 *   building, which the page says it never does. Cut out, it cannot be.
 *
 * WHAT IT IS NOT
 *   Exact to the centimetre: a cell is dropped when any of its nine points
 *   is in a building, so the band stops up to 2 m short of a wall rather
 *   than over it. Short of is the side to err on. A corner of a building
 *   thinner than half a cell could still slip between the points; the
 *   tests check every band against the real footprints at 1 m.
 */

import type { PolygonEN, Ring } from '../data/model';

type EN = [number, number];

/** One straight piece of a band and how wide it is. */
export interface BandSegment {
  from: EN;
  to: EN;
  widthM: number;
}

/** A rectangle on open ground, by its four corners in order. */
export type Quad = [EN, EN, EN, EN];

/** A cell's size, along and at most across: how far short of a wall the band can stop. */
const CELL_M = 2;
/** The bucket a footprint is filed under, by its box: a few buildings to a bucket in the CBD. */
const BUCKET_M = 40;

/** Footprints, bucketed so a point is tested only against the buildings near it. */
export interface Obstacles {
  inside: (e: number, n: number) => boolean;
}

export function obstaclesOf(footprints: readonly PolygonEN[]): Obstacles {
  const rings: { ring: Ring; box: [number, number, number, number] }[] = [];
  const buckets = new Map<string, number[]>();
  for (const polygon of footprints) {
    // the outer ring only: a courtyard counts as building, which errs on the right side
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;
    let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    for (const [e, n] of ring) {
      minE = Math.min(minE, e);
      minN = Math.min(minN, n);
      maxE = Math.max(maxE, e);
      maxN = Math.max(maxN, n);
    }
    const index = rings.push({ ring, box: [minE, minN, maxE, maxN] }) - 1;
    for (let i = Math.floor(minE / BUCKET_M); i <= Math.floor(maxE / BUCKET_M); i++) {
      for (let j = Math.floor(minN / BUCKET_M); j <= Math.floor(maxN / BUCKET_M); j++) {
        const key = `${i},${j}`;
        const list = buckets.get(key);
        if (list) list.push(index);
        else buckets.set(key, [index]);
      }
    }
  }
  return {
    inside: (e, n) => {
      const list = buckets.get(`${Math.floor(e / BUCKET_M)},${Math.floor(n / BUCKET_M)}`);
      if (!list) return false;
      for (const index of list) {
        const { ring, box } = rings[index];
        if (e < box[0] || e > box[2] || n < box[1] || n > box[3]) continue;
        let within = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [ei, ni] = ring[i];
          const [ej, nj] = ring[j];
          if (ni > n !== nj > n && e < ((ej - ei) * (n - ni)) / (nj - ni) + ei) within = !within;
        }
        if (within) return true;
      }
      return false;
    },
  };
}

/** The open-ground rectangles of a set of band segments. */
export function openQuads(segments: readonly BandSegment[], obstacles: Obstacles): Quad[] {
  const quads: Quad[] = [];
  for (const { from, to, widthM } of segments) {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (length < 0.01 || widthM <= 0) continue;
    const along: EN = [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
    const across: EN = [-along[1], along[0]];
    const at = (t: number, s: number): EN => [
      from[0] + along[0] * t + across[0] * s,
      from[1] + along[1] * t + across[1] * s,
    ];
    const open = (t: number, s: number) => {
      const [e, n] = at(t, s);
      return !obstacles.inside(e, n);
    };

    const rows = Math.max(1, Math.ceil(widthM / CELL_M));
    const rowM = widthM / rows;
    const steps = Math.max(1, Math.ceil(length / CELL_M));
    const stepM = length / steps;

    for (let r = 0; r < rows; r++) {
      const s0 = -widthM / 2 + r * rowM;
      const s1 = s0 + rowM;
      let runStart: number | null = null;
      for (let k = 0; k <= steps; k++) {
        const t0 = k * stepM;
        // corners, edge middles and middle: a building's thin corner can poke between four corners alone
        let kept = k < steps;
        for (let i = 0; kept && i <= 2; i++) {
          for (let j = 0; kept && j <= 2; j++) kept = open(t0 + (stepM * i) / 2, s0 + (rowM * j) / 2);
        }
        if (kept && runStart === null) runStart = t0;
        if (!kept && runStart !== null) {
          quads.push([at(runStart, s0), at(t0, s0), at(t0, s1), at(runStart, s1)]);
          runStart = null;
        }
      }
    }
  }
  return quads;
}
