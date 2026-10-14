/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE STREET ACTIVITY MAP: WHERE THE CITY IS ON THE SCREEN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The flat map (ActivityMap) is north-up, in the city's east/north metres
 * from the scene origin — the same numbers as the buildings, the road
 * surfaces and the counters, so nothing is projected twice. A view is a
 * scale (pixels per metre) and the point at the middle of the canvas.
 *
 * Kept apart from the drawing so the arithmetic can be tested without a
 * canvas: fitting the CBD into the part of the window the column and the
 * time bar leave free, zooming about the pointer, panning, and which glow
 * a tap lands on.
 */
import type { ActivityLevel } from '../data/streetActivity';
import { ACTIVITY_LEVELS, ACTIVITY_RADII_M } from '../scene/activityPalette';

export interface MapView {
  /** Pixels per metre. */
  scale: number;
  /** The east/north point at the middle of the canvas, metres. */
  centre: [number, number];
}

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Bounds {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

/**
 * From the whole CBD in the smallest map a phone leaves (about 130 px tall,
 * 0.06 px/m) with room to spare, to a single lane filling a laptop.
 */
export const SCALE_LIMITS = { min: 0.01, max: 6 } as const;

const clampScale = (scale: number) => Math.min(SCALE_LIMITS.max, Math.max(SCALE_LIMITS.min, scale));

/** A point of the city on the canvas, CSS pixels. North is up. */
export function toScreen(view: MapView, width: number, height: number, e: number, n: number): [number, number] {
  return [width / 2 + (e - view.centre[0]) * view.scale, height / 2 - (n - view.centre[1]) * view.scale];
}

/** A point of the canvas in the city, metres. */
export function toWorld(view: MapView, width: number, height: number, x: number, y: number): [number, number] {
  return [view.centre[0] + (x - width / 2) / view.scale, view.centre[1] - (y - height / 2) / view.scale];
}

/**
 * The view that shows `bounds` whole in the part of the canvas the insets
 * leave free — beside the column, above the time bar — and centred there.
 */
export function fitView(bounds: Bounds, width: number, height: number, insets: Insets): MapView {
  const freeW = Math.max(1, width - insets.left - insets.right);
  const freeH = Math.max(1, height - insets.top - insets.bottom);
  const spanE = Math.max(1, bounds.maxE - bounds.minE);
  const spanN = Math.max(1, bounds.maxN - bounds.minN);
  // Not held to the zoom's lower limit: "show all" must show all, however small the free part.
  const scale = Math.min(SCALE_LIMITS.max, freeW / spanE, freeH / spanN);
  const middle: [number, number] = [(bounds.minE + bounds.maxE) / 2, (bounds.minN + bounds.maxN) / 2];
  // Put the middle of the bounds at the middle of the FREE part, not of the canvas.
  const freeX = insets.left + freeW / 2;
  const freeY = insets.top + freeH / 2;
  return {
    scale,
    centre: [middle[0] - (freeX - width / 2) / scale, middle[1] + (freeY - height / 2) / scale],
  };
}

/**
 * Zoom by `factor` keeping the city point under (x, y) where it is: the
 * pointer, or the middle. A view already below the lower limit (a fit on a
 * very small map) may zoom out no further, but is not pushed back up.
 */
export function zoomAt(view: MapView, width: number, height: number, x: number, y: number, factor: number): MapView {
  const scale = Math.min(SCALE_LIMITS.max, Math.max(Math.min(SCALE_LIMITS.min, view.scale), view.scale * factor));
  const [e, n] = toWorld(view, width, height, x, y);
  return { scale, centre: [e - (x - width / 2) / scale, n + (y - height / 2) / scale] };
}

/** Drag the map by (dx, dy) pixels: the city moves with the pointer. */
export function panBy(view: MapView, dx: number, dy: number): MapView {
  return { scale: view.scale, centre: [view.centre[0] - dx / view.scale, view.centre[1] + dy / view.scale] };
}

/** The same view, moved so `en` is at the middle of the free part of the canvas. */
export function centreOn(
  view: MapView,
  width: number,
  height: number,
  insets: Insets,
  en: [number, number],
  scale = view.scale,
): MapView {
  const s = clampScale(scale);
  const freeX = insets.left + (width - insets.left - insets.right) / 2;
  const freeY = insets.top + (height - insets.top - insets.bottom) / 2;
  return { scale: s, centre: [en[0] - (freeX - width / 2) / s, en[1] + (freeY - height / 2) / s] };
}

/* ── the glows ─────────────────────────────────────────────────────────── */

export interface Glow {
  id: number;
  /** East and north of the scene's origin, metres. */
  en: [number, number];
  level: ActivityLevel;
}

/**
 * How far a glow reaches on the map, metres: its level's radius, but never
 * less than `minPx` on screen, so the whole CBD at a glance still shows
 * every street that is busy.
 */
export function glowRadiusM(level: ActivityLevel, scale: number, minPx: number): number {
  return Math.max(ACTIVITY_RADII_M[level], minPx / scale);
}

/**
 * The counter whose glow reaches the point and is drawn on top there: the
 * busier (painted last), then the nearer.
 */
export function glowAt(glows: readonly Glow[], e: number, n: number, scale: number, minPx: number): Glow | null {
  let best: Glow | null = null;
  let bestRank = -1;
  let bestD = Infinity;
  for (const g of glows) {
    const d = Math.hypot(g.en[0] - e, g.en[1] - n);
    if (d > glowRadiusM(g.level, scale, minPx)) continue;
    const rank = ACTIVITY_LEVELS.indexOf(g.level);
    if (rank > bestRank || (rank === bestRank && d < bestD)) {
      best = g;
      bestRank = rank;
      bestD = d;
    }
  }
  return best;
}

/** The counters' extent with room around it: what "Show all" fits. */
export function boundsOf(points: readonly [number, number][], marginM: number): Bounds | null {
  if (points.length === 0) return null;
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
  for (const [e, n] of points) {
    minE = Math.min(minE, e);
    maxE = Math.max(maxE, e);
    minN = Math.min(minN, n);
    maxN = Math.max(maxN, n);
  }
  return { minE: minE - marginM, minN: minN - marginM, maxE: maxE + marginM, maxN: maxN + marginM };
}
