/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE FLAT GOES IN A BUILDING, AND WHETHER IT FITS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The flat goes behind one side of a building on one floor: its facade's
 * middle on the middle of the longest wall facing that way, its facade
 * looking out of it, its floor on the floor's level.
 *
 * Whether it fits there is checked by sampling, not by polygon algebra: a
 * grid of points every 0.3 m inside the flat's outline, asked at several
 * heights from floor to ceiling — and at every height where a part of the
 * building starts or stops in between — whether each point is inside the
 * building. A concave outline, a courtyard, a podium giving way to a tower
 * half-way up a storey all answer the same question the same way; that is
 * why it is done like this (ProjectDoc/studio-room/PLAN.md 3.4, review 2 #8).
 *
 * When it does not fit, the answer says why, in the order that makes the
 * message true (RoomProblem). The flat is never shrunk to fit: it is the
 * user's plan, and a smaller one would not be.
 */
import type { Massing } from '../../data/model';
import { facadesOf, floorBaseAhdM, storeyHeightM } from '../facades';
import { groundElevationOf } from '../massing';
import { FACADE_LENGTH, FACADE_MID_Y, FACADE_OUT_X, SLAB_TOP_Z } from './apartmentLayout';

export interface RoomPlacement {
  /** Where the flat's local origin lands, east/north metres. */
  originEN: [number, number];
  /** The flat's turn about the vertical, radians anticlockwise from east: local +x points this way. */
  angle: number;
  /** Floor level, metres AHD. */
  floorAhdM: number;
  /** The compass name of the side. */
  side: string;
}

export type RoomProblem =
  | 'no-such-floor'
  | 'no-such-side'
  | 'wall-too-short'
  | 'ceiling-too-low'
  | 'window-moved'
  | 'next-building-in-the-way'
  | 'above-the-roof'
  | 'building-too-shallow'
  | 'balcony-in-the-way'
  | 'outlook-blocked';

export type RoomFit = { ok: true; placement: RoomPlacement } | { ok: false; problem: RoomProblem };

/** Room for the flat's facade on the wall, beyond its own length (0.2 m each end). */
const WALL_SPARE_M = 0.4;
/** The lowest ceiling the flat can have: floor to floor less the 0.3 m slab. */
const MIN_CEILING_M = 2.6;
const SLAB_M = 0.3;
/** How far the window's measuring point is put out from the wall (facades.ts CLEAR_OF_WALL_M). */
const WINDOW_OUT_M = 0.5;
/** How far the measuring point may have been moved before the flat no longer matches the figure. */
const WINDOW_TOLERANCE_M = 0.1;
/** Sampling: spacing, and how far inside an outline a sample must be. */
const STEP_M = 0.3;
const INSET_M = 0.12;
/** Along the outline's edges, closer: a slot or a corner narrower than the grid is met at the edge it crosses. */
const EDGE_STEP_M = 0.1;
/** Height differences smaller than this are the same height. */
const EPS_M = 0.05;
/** Part boundaries closer together than this are one boundary: a gap thinner than this is not a gap. */
const MERGE_M = 0.01;
/** In front of the balcony: how much of the outlook may be wall before it is no outlook at all. */
const OUTLOOK_BLOCKED_SHARE = 0.25;

/** The flat's outside outline, local metres: the bedroom block runs 0.6 m further north than the rest. */
const OUTLINE: [number, number][] = [[-0.2, -0.2], [7.5, -0.2], [7.5, 7.0], [2.7, 7.0], [2.7, 6.4], [-0.2, 6.4]];
/** The balcony, local: floor slab to the storey above's slab, 1.8 m out. */
const BALCONY = { x0: 7.5, x1: 9.3, y0: 0.2, y1: 3.3 };
/** In front of the balcony: what the living room and the bedroom look out across. */
const OUTLOOK = { x0: 9.5, x1: 13.5, y0: 0.0, y1: 6.8 };

/** Local (x, y) of the flat to east/north. */
export function toEN(p: RoomPlacement, x: number, y: number): [number, number] {
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  return [p.originEN[0] + x * c - y * s, p.originEN[1] + x * s + y * c];
}

function inRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Is (e, n, z) inside any of the parts? The lowest part of a building stands on the ground whatever its base says. */
function insideAny(e: number, n: number, z: number, parts: readonly Massing[]): boolean {
  for (const part of parts) {
    const base = part.sinksToGround ? -Infinity : part.baseAhdM;
    if (z < base || z > part.topAhdM) continue;
    for (const polygon of part.footprint) {
      if (!polygon[0] || polygon[0].length < 3 || !inRing(e, n, polygon[0])) continue;
      let hole = false;
      for (let h = 1; h < polygon.length; h++) {
        if (inRing(e, n, polygon[h])) {
          hole = true;
          break;
        }
      }
      if (!hole) return true;
    }
  }
  return false;
}

/** Sample points (local) inside a polygon, at least INSET_M from its edges. */
function samplesIn(poly: [number, number][]): [number, number][] {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const out: [number, number][] = [];
  for (let x = Math.min(...xs) + INSET_M; x <= Math.max(...xs) - INSET_M + 1e-9; x += STEP_M) {
    for (let y = Math.min(...ys) + INSET_M; y <= Math.max(...ys) - INSET_M + 1e-9; y += STEP_M) {
      const ok = [[0, 0], [INSET_M, 0], [-INSET_M, 0], [0, INSET_M], [0, -INSET_M]].every(([dx, dy]) => inRing(x + dx, y + dy, poly));
      if (ok) out.push([x, y]);
    }
  }
  /*
   * And along every edge, just inside it, every EDGE_STEP_M — corners included. Anything of another
   * building, or any gap in this one, that reaches into the flat crosses its outline, and a slot narrower
   * than the grid is met there (Codex review, 2026-10-17). One that is wholly inside the flat and
   * narrower than STEP_M can still be missed; the massing has none that small that matter.
   */
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    // inward for an anticlockwise outline
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    for (let d = 0; d <= len + 1e-9; d += EDGE_STEP_M) {
      const t = Math.min(d, len) / len;
      const x = x0 + (x1 - x0) * t + nx * INSET_M;
      const y = y0 + (y1 - y0) * t + ny * INSET_M;
      // and as far from every other edge, so the samples next to a corner do not sit on the next edge
      const r = INSET_M * 0.9;
      if ([[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => inRing(x + dx, y + dy, poly))) out.push([x, y]);
    }
  }
  return out;
}

function rect(r: { x0: number; x1: number; y0: number; y1: number }): [number, number][] {
  return [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
}

const FLAT_SAMPLES = samplesIn(OUTLINE);
const BALCONY_SAMPLES = samplesIn(rect(BALCONY));
const OUTLOOK_SAMPLES = samplesIn(rect(OUTLOOK));

/**
 * The heights to test between two levels, lowest first: just inside each end, either side of every part
 * boundary in between, and half-way between each two neighbouring boundaries — so a gap between one part
 * stopping and another starting is sampled however thin it is (down to MERGE_M).
 */
function heights(lo: number, hi: number, parts: readonly Massing[]): number[] {
  const cuts = [lo, hi];
  for (const p of parts) {
    for (const z of [p.baseAhdM, p.topAhdM]) if (z > lo && z < hi) cuts.push(z);
  }
  cuts.sort((a, b) => a - b);
  const levels = cuts.filter((z, i) => i === 0 || z - cuts[i - 1] >= MERGE_M);
  const hs = [lo + EPS_M, hi - EPS_M];
  for (let i = 0; i < levels.length; i++) {
    const z = levels[i];
    if (z > lo + EPS_M && z < hi - EPS_M) hs.push(z - EPS_M, z + EPS_M);
    if (i > 0) hs.push((levels[i - 1] + z) / 2);
  }
  return hs.filter((z) => z > lo && z < hi).sort((a, b) => a - b);
}

/**
 * Where the flat goes behind `side` on `floor`, or why it cannot.
 *
 * @param host       the building's parts
 * @param others     every other building's parts near enough to matter (the caller may pre-filter by distance)
 * @param windowAtEN the sunlight screen's measuring point for this floor and side, after clearOfBuildings;
 *                   when given, the flat is only placed where that point is still just outside this wall
 */
export function fitRoom(
  host: readonly Massing[],
  others: readonly Massing[],
  side: string,
  floor: number,
  floorsAboveGround: number | null,
  windowAtEN: [number, number] | null = null,
  /** The flat ground the city is drawn on: floors are counted from it (facades.ts groundFloorAhdM). */
  groundAhdM?: number,
): RoomFit {
  const parts = host as Massing[];
  const base = floorBaseAhdM(parts, floor, floorsAboveGround, groundAhdM);
  // no such floor: not a storey on record, or above the top of the building as modelled
  if (base === null || base + 1.2 > Math.max(...host.map((p) => p.topAhdM))) return { ok: false, problem: 'no-such-floor' };
  const facade = facadesOf(parts, base + 1.2).find((f) => f.compass.toLowerCase() === side.toLowerCase());
  if (!facade) return { ok: false, problem: 'no-such-side' };
  if (facade.runLengthM < FACADE_LENGTH + WALL_SPARE_M) return { ok: false, problem: 'wall-too-short' };
  const storey = storeyHeightM(parts, floorsAboveGround);
  if (storey - SLAB_M < MIN_CEILING_M) return { ok: false, problem: 'ceiling-too-low' };

  const angle = Math.PI / 2 - (facade.bearingDeg * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const [mx, my] = facade.midpointEN;
  const placement: RoomPlacement = {
    originEN: [mx - (FACADE_OUT_X * c - FACADE_MID_Y * s), my - (FACADE_OUT_X * s + FACADE_MID_Y * c)],
    angle,
    floorAhdM: base,
    side: facade.compass,
  };

  if (windowAtEN) {
    const expect: [number, number] = [mx + WINDOW_OUT_M * c, my + WINDOW_OUT_M * s];
    if (Math.hypot(windowAtEN[0] - expect[0], windowAtEN[1] - expect[1]) > WINDOW_TOLERANCE_M) {
      return { ok: false, problem: 'window-moved' };
    }
  }

  const top = base + SLAB_TOP_Z;
  /*
   * Only the parts that could touch the flat, its balcony or its outlook: their footprint's box against
   * the box round all three. Without this every sample is tested against every building nearby, and one
   * answer took seconds.
   */
  const reach = [...OUTLINE, ...rect(OUTLOOK)].map(([x, y]) => toEN(placement, x, y));
  const box = {
    e0: Math.min(...reach.map((p) => p[0])) - 1, e1: Math.max(...reach.map((p) => p[0])) + 1,
    n0: Math.min(...reach.map((p) => p[1])) - 1, n1: Math.max(...reach.map((p) => p[1])) + 1,
  };
  const near = (p: Massing) =>
    p.footprint.some((poly) => {
      const ring = poly[0];
      if (!ring) return false;
      let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
      for (const [e, n] of ring) {
        if (e < e0) e0 = e;
        if (e > e1) e1 = e;
        if (n < n0) n0 = n;
        if (n > n1) n1 = n;
      }
      return e1 >= box.e0 && e0 <= box.e1 && n1 >= box.n0 && n0 <= box.n1;
    });
  others = others.filter(near);
  const flatAt = FLAT_SAMPLES.map(([x, y]) => toEN(placement, x, y));
  // another building where the flat would be
  for (const z of heights(base, top, others)) {
    if (flatAt.some(([e, n]) => insideAny(e, n, z, others))) return { ok: false, problem: 'next-building-in-the-way' };
  }
  /*
   * The whole flat inside its own building, at every height that matters, lowest first. Where a point is
   * missing already at the floor, the building does not reach that far back; where it is there at the
   * floor and gone higher up, the building stops part-way up the storey.
   */
  const [floorZ, ...upper] = heights(base, top, host);
  if (flatAt.some(([e, n]) => !insideAny(e, n, floorZ, host))) return { ok: false, problem: 'building-too-shallow' };
  for (const z of upper) {
    if (flatAt.some(([e, n]) => !insideAny(e, n, z, host))) return { ok: false, problem: 'above-the-roof' };
  }
  // the balcony: open air, from its slab to the storey above's, clear of this building and every other
  const balconyAt = BALCONY_SAMPLES.map(([x, y]) => toEN(placement, x, y));
  const everything = [...host, ...others];
  for (const z of heights(base - SLAB_M, top, everything)) {
    if (balconyAt.some(([e, n]) => insideAny(e, n, z, everything))) return { ok: false, problem: 'balcony-in-the-way' };
  }
  // something to look at: not a wall a few metres past the balcony
  const outlookAt = OUTLOOK_SAMPLES.map(([x, y]) => toEN(placement, x, y));
  let blocked = 0;
  let total = 0;
  for (const z of [base + 1.0, base + 1.8]) {
    for (const [e, n] of outlookAt) {
      total += 1;
      if (insideAny(e, n, z, everything)) blocked += 1;
    }
  }
  if (blocked / total > OUTLOOK_BLOCKED_SHARE) return { ok: false, problem: 'outlook-blocked' };
  return { ok: true, placement };
}

/** Neighbours whose outline's box is further than this from the building's are not asked about. */
const NEAR_M = 60;

function boxOf(parts: readonly Massing[]) {
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const p of parts) {
    for (const poly of p.footprint) {
      for (const [e, n] of poly[0] ?? []) {
        if (e < e0) e0 = e;
        if (e > e1) e1 = e;
        if (n < n0) n0 = n;
        if (n > n1) n1 = n;
      }
    }
  }
  return { e0, e1, n0, n1 };
}

/**
 * fitRoom for a building in the model by its id: its parts, and every other building's parts near
 * enough to matter. Null when the model has no such building.
 */
export function fitRoomInModel(
  buildings: readonly Massing[],
  buildingId: string,
  side: string,
  floor: number,
  floorsAboveGround: number | null,
  windowAtEN: [number, number] | null = null,
): RoomFit | null {
  const host = buildings.filter((b) => b.parentId === buildingId);
  if (!host.length) return null;
  /*
   * By the boxes round the outlines, not by corners near a point: a long building whose every corner is
   * far away can still run right past the flat (Codex review, 2026-10-17). The flat and its outlook reach
   * at most 14 m out from the wall; fitRoom narrows this down again to what is actually near them.
   */
  const h = boxOf(host);
  const others = buildings.filter((b) => {
    if (b.parentId === buildingId) return false;
    const o = boxOf([b]);
    return o.e1 >= h.e0 - NEAR_M && o.e0 <= h.e1 + NEAR_M && o.n1 >= h.n0 - NEAR_M && o.n0 <= h.n1 + NEAR_M;
  });
  return fitRoom(host, others, side, floor, floorsAboveGround, windowAtEN, groundElevationOf(buildings as Massing[]));
}
