/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE STREET ACTIVITY MAP: WHERE THE CITY IS ON THE SCREEN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The flat map (ActivityMap) is in the city's east/north metres from the
 * scene origin — the same numbers as the buildings, the road surfaces and
 * the counters, so nothing is projected twice. A view is a scale (pixels
 * per metre), the point at the middle of the canvas, and a rotation: zero
 * is north up, and a positive rotation turns the map anticlockwise on the
 * screen.
 *
 * Kept apart from the drawing so the arithmetic can be tested without a
 * canvas: fitting the CBD into the part of the window the column and the
 * time bar leave free, zooming and turning about the pointer, panning, and
 * which glow a tap lands on.
 */
import { glowRadiusAt } from '../scene/activityPalette';

export interface MapView {
  /** Pixels per metre. */
  scale: number;
  /** The east/north point at the middle of the canvas, metres. */
  centre: [number, number];
  /** Radians; 0 is north up, positive turns the map anticlockwise on screen. */
  rotation: number;
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

/** A rotation folded into (-π, π], so "north up" is exactly 0 again after a full turn. */
export function normaliseRotation(r: number): number {
  const t = r % (2 * Math.PI);
  return t > Math.PI ? t - 2 * Math.PI : t <= -Math.PI ? t + 2 * Math.PI : t;
}

/** A world offset (metres) as a screen offset (pixels, y down). */
function worldToOffset(view: MapView, de: number, dn: number): [number, number] {
  const c = Math.cos(view.rotation);
  const s = Math.sin(view.rotation);
  return [(de * c - dn * s) * view.scale, -(de * s + dn * c) * view.scale];
}

/** A screen offset (pixels, y down) as a world offset (metres). */
function offsetToWorld(view: MapView, ox: number, oy: number): [number, number] {
  const c = Math.cos(view.rotation);
  const s = Math.sin(view.rotation);
  const rx = ox / view.scale;
  const ry = -oy / view.scale;
  return [rx * c + ry * s, -rx * s + ry * c];
}

/** A point of the city on the canvas, CSS pixels. */
export function toScreen(view: MapView, width: number, height: number, e: number, n: number): [number, number] {
  const [ox, oy] = worldToOffset(view, e - view.centre[0], n - view.centre[1]);
  return [width / 2 + ox, height / 2 + oy];
}

/** A point of the canvas in the city, metres. */
export function toWorld(view: MapView, width: number, height: number, x: number, y: number): [number, number] {
  const [de, dn] = offsetToWorld(view, x - width / 2, y - height / 2);
  return [view.centre[0] + de, view.centre[1] + dn];
}

/** The centre that puts world point `en` at screen point (x, y) in a view of this scale and rotation. */
function centreFor(
  view: Omit<MapView, 'centre'>,
  width: number,
  height: number,
  en: [number, number],
  x: number,
  y: number,
): [number, number] {
  const [de, dn] = offsetToWorld({ ...view, centre: [0, 0] }, x - width / 2, y - height / 2);
  return [en[0] - de, en[1] - dn];
}

const freeMiddle = (width: number, height: number, insets: Insets): [number, number] => [
  insets.left + Math.max(1, width - insets.left - insets.right) / 2,
  insets.top + Math.max(1, height - insets.top - insets.bottom) / 2,
];

/**
 * The view that shows `bounds` whole, at this rotation, in the part of the
 * canvas the insets leave free — beside the column, above the time bar —
 * and centred there.
 */
export function fitView(bounds: Bounds, width: number, height: number, insets: Insets, rotation = 0): MapView {
  const freeW = Math.max(1, width - insets.left - insets.right);
  const freeH = Math.max(1, height - insets.top - insets.bottom);
  const middle: [number, number] = [(bounds.minE + bounds.maxE) / 2, (bounds.minN + bounds.maxN) / 2];
  // The bounds' corners as they lie on a turned screen, one metre to the pixel.
  const unit: MapView = { scale: 1, centre: middle, rotation };
  const corners = [
    [bounds.minE, bounds.minN],
    [bounds.maxE, bounds.minN],
    [bounds.maxE, bounds.maxN],
    [bounds.minE, bounds.maxN],
  ].map(([e, n]) => worldToOffset(unit, e - middle[0], n - middle[1]));
  const spanX = Math.max(1, Math.max(...corners.map((p) => p[0])) - Math.min(...corners.map((p) => p[0])));
  const spanY = Math.max(1, Math.max(...corners.map((p) => p[1])) - Math.min(...corners.map((p) => p[1])));
  // Not held to the zoom's lower limit: "show all" must show all, however small the free part.
  const scale = Math.min(SCALE_LIMITS.max, freeW / spanX, freeH / spanY);
  const [fx, fy] = freeMiddle(width, height, insets);
  return { scale, rotation, centre: centreFor({ scale, rotation }, width, height, middle, fx, fy) };
}

/**
 * Zoom by `factor` keeping the city point under (x, y) where it is: the
 * pointer, or the middle. A view already below the lower limit (a fit on a
 * very small map) may zoom out no further, but is not pushed back up.
 */
export function zoomAt(view: MapView, width: number, height: number, x: number, y: number, factor: number): MapView {
  const scale = Math.min(SCALE_LIMITS.max, Math.max(Math.min(SCALE_LIMITS.min, view.scale), view.scale * factor));
  const en = toWorld(view, width, height, x, y);
  return { scale, rotation: view.rotation, centre: centreFor({ scale, rotation: view.rotation }, width, height, en, x, y) };
}

/** Turn by `radians` (positive anticlockwise) keeping the city point under (x, y) where it is. */
export function rotateAt(view: MapView, width: number, height: number, x: number, y: number, radians: number): MapView {
  const rotation = normaliseRotation(view.rotation + radians);
  const en = toWorld(view, width, height, x, y);
  return { scale: view.scale, rotation, centre: centreFor({ scale: view.scale, rotation }, width, height, en, x, y) };
}

/** Drag the map by (dx, dy) pixels: the city moves with the pointer, whichever way it is turned. */
export function panBy(view: MapView, dx: number, dy: number): MapView {
  const [de, dn] = offsetToWorld(view, dx, dy);
  return { ...view, centre: [view.centre[0] - de, view.centre[1] - dn] };
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
  const [fx, fy] = freeMiddle(width, height, insets);
  return { scale: s, rotation: view.rotation, centre: centreFor({ scale: s, rotation: view.rotation }, width, height, en, fx, fy) };
}

/**
 * The transform that takes a picture drawn at view `from` (of size
 * `fromSize`) to where it lies at view `to` on a canvas of `toSize`, as the
 * six numbers of canvas setTransform, in CSS pixels. The map's still parts
 * are drawn once into such a picture and moved with this while handled.
 */
export function pictureTransform(
  from: MapView,
  fromSize: [number, number],
  to: MapView,
  toSize: [number, number],
): [number, number, number, number, number, number] {
  const at = (x: number, y: number) => {
    const [e, n] = toWorld(from, fromSize[0], fromSize[1], x, y);
    return toScreen(to, toSize[0], toSize[1], e, n);
  };
  const o = at(0, 0);
  const ax = at(1, 0);
  const ay = at(0, 1);
  return [ax[0] - o[0], ax[1] - o[1], ay[0] - o[0], ay[1] - o[1], o[0], o[1]];
}

/* ── the glows ─────────────────────────────────────────────────────────── */

export interface Glow {
  id: number;
  /** East and north of the scene's origin, metres. */
  en: [number, number];
  /** Movements this hour over the most anywhere on the timeline: 0–1, the place on the colour ramp. */
  t: number;
}

/**
 * How far a glow reaches on the map, metres: by its share of the busiest
 * hour anywhere, but never less than `minPx` on screen, so the whole CBD
 * at a glance still shows every street that has people.
 */
export function glowRadiusM(t: number, scale: number, minPx: number): number {
  return Math.max(glowRadiusAt(t), minPx / scale);
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
    // A glow faded out to nothing (no one there) is not there to tap.
    if (!(g.t > 0)) continue;
    const d = Math.hypot(g.en[0] - e, g.en[1] - n);
    if (d > glowRadiusM(g.t, scale, minPx)) continue;
    const rank = g.t;
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
