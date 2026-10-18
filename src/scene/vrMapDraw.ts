/*
 * ─────────────────────────────────────────────────────────────────────────
 * DRAWING THE CITY AS A MAP, FOR THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY IT EXISTS
 *   Standing in the street in a headset, nobody can tell where they are: the
 *   sky is the same everywhere, and the street names are on signs too small
 *   to read. A map beside them, with their own position on it and the places
 *   they would steer by, answers that.
 *
 * HOW
 *   Onto a 2D canvas, which becomes a texture on the panel. A canvas because
 *   it can write any text in any font — the panel's own font is ASCII only
 *   and laid out by a UI engine that would have to place each label — and
 *   because a city of footprints is one filled path, which a canvas fills in
 *   a few milliseconds.
 *
 *   The footprints are turned into paths ONCE, in metres (MapArt). Each draw
 *   only sets where the view is and fills them, so a redraw costs the same
 *   at any zoom.
 *
 * THE VIEW
 *   Centre, scale and turn. North-up for the map beside the window, where the
 *   names have to stay where they were; heading-up for the small map that
 *   rides low while walking, where "ahead" matters more than "north". Labels
 *   are always drawn upright, whichever way the map is turned.
 */

import type { PolygonEN } from '../data/model';
import type { Landmark } from './vrLandmarks';

/** One square of the city, as two paths in metres: what stands, and what is approved. */
export interface MapLayer {
  buildings: Path2D;
  developments: Path2D;
}

/** What one picture fills: the squares it reaches, and the place being looked at over them. */
export interface MapArt {
  layers: MapLayer[];
  /** The one being looked at, if any — filled last, over its own square's developments. */
  subject: Path2D | null;
}

function addPolygons(path: Path2D, polygons: PolygonEN[]) {
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach(([e, n], index) => (index === 0 ? path.moveTo(e, n) : path.lineTo(e, n)));
      path.closePath();
    }
  }
}

/*
 * ── THE CITY IN SQUARES, BUILT A LITTLE AT A TIME ───────────────────────
 *
 * Turning the city's 4,445 footprints into paths takes most of a second even
 * on a desktop, and the page draws nothing while it does. On the headset
 * that was the freeze after choosing a place, after the tutorial and on
 * opening the menu again (2026-10-14, the ?vrdebug log): the map rebuilt its
 * paths whenever its card was made afresh or its centre moved far.
 *
 * So the paths are made once per city and kept, in squares of TILE_M, and
 * made a few milliseconds per frame (`step`) rather than all at once. A
 * picture of part of the city takes the squares it reaches; the whole city
 * takes them all. Nothing is ever rebuilt.
 *
 * A footprint goes in the square its first corner falls in, so a building
 * can reach past its square's edge by its own size: `artNear` reaches one
 * square further than asked for that.
 */
export const TILE_M = 250;

export interface CityTiles {
  /** By square, "column,row". */
  tiles: Map<string, MapLayer & { centre: [number, number] }>;
  /** True once every footprint is in. */
  done: () => boolean;
  /** Adds footprints for up to `budgetMs`; returns whether all are in. */
  step: (budgetMs: number) => boolean;
}

export function startCityTiles(
  buildings: { footprint: PolygonEN[] }[],
  developments: { footprints: PolygonEN[] }[],
): CityTiles {
  const tiles: CityTiles['tiles'] = new Map();
  const squareOf = (polygons: PolygonEN[]) => {
    const first = polygons[0]?.[0]?.[0];
    if (!first) return null;
    const column = Math.floor(first[0] / TILE_M);
    const row = Math.floor(first[1] / TILE_M);
    const key = `${column},${row}`;
    let tile = tiles.get(key);
    if (!tile) {
      tile = { buildings: new Path2D(), developments: new Path2D(), centre: [(column + 0.5) * TILE_M, (row + 0.5) * TILE_M] };
      tiles.set(key, tile);
    }
    return tile;
  };
  let nextBuilding = 0;
  let nextDevelopment = 0;
  const done = () => nextBuilding >= buildings.length && nextDevelopment >= developments.length;
  const step = (budgetMs: number) => {
    const until = performance.now() + budgetMs;
    // The clock is read every few footprints, not after each: reading it costs too.
    while (!done() && performance.now() < until) {
      for (let i = 0; i < 40 && !done(); i++) {
        if (nextBuilding < buildings.length) {
          const polygons = buildings[nextBuilding++].footprint;
          const tile = squareOf(polygons);
          if (tile) addPolygons(tile.buildings, polygons);
        } else {
          const polygons = developments[nextDevelopment++].footprints;
          const tile = squareOf(polygons);
          if (tile) addPolygons(tile.developments, polygons);
        }
      }
    }
    return done();
  };
  return { tiles, done, step };
}

/** The squares within `radiusM` of a point (and one square more), or every square with no point. */
export function artNear(city: CityTiles, centre: [number, number] | null, radiusM: number, subject: Path2D | null): MapArt {
  const reach = radiusM + TILE_M * 1.5;
  const layers: MapLayer[] = [];
  for (const tile of city.tiles.values()) {
    if (!centre || Math.hypot(tile.centre[0] - centre[0], tile.centre[1] - centre[1]) <= reach) layers.push(tile);
  }
  return { layers, subject };
}

/** The place being looked at, as a path of its own: one footprint's worth of work. */
export function subjectPath(developments: { key: string; footprints: PolygonEN[] }[], subjectKey: string | null): Path2D | null {
  const chosen = subjectKey === null ? undefined : developments.find((development) => development.key === subjectKey);
  if (!chosen) return null;
  const path = new Path2D();
  addPolygons(path, chosen.footprints);
  return path;
}

export interface MapView {
  /** Pixels. */
  width: number;
  height: number;
  /** The east/north at the middle of the picture. */
  centreEN: [number, number];
  /** Metres one pixel covers. */
  metresPerPx: number;
  /** Turn the map so this compass heading (radians, clockwise from north) points up; 0 is north-up. */
  upHeadingRad: number;
}

export interface MapMarks {
  you: { en: [number, number]; headingRad: number } | null;
  landmarks: Landmark[];
  /** Label sizes in pixels. */
  labelPx: number;
  /** A pin on the place chosen — its shape, not only its colour, says which mark it is. */
  pin?: [number, number] | null;
  /** A spot pressed on the map: a ring on it, and a dashed circle as far as the list around it reaches. */
  spot?: { en: [number, number]; radiusM: number } | null;
}

const COLOURS = {
  ground: '#eef0ec',
  building: '#d6d9d2',
  development: '#b9dccd',
  subject: '#14624a',
  you: '#1a73e8',
  spot: '#e89a21',
  landmark: '#8a5e0c',
  ink: '#16181a',
};

/** Where an east/north lands in the picture. Exported for the tests. */
export function toPixel(view: MapView, [e, n]: [number, number]): [number, number] {
  const dx = (e - view.centreEN[0]) / view.metresPerPx;
  const dy = (n - view.centreEN[1]) / view.metresPerPx;
  // Turned so the heading points up: rotate by -heading (clockwise-positive on screen).
  const c = Math.cos(-view.upHeadingRad);
  const s = Math.sin(-view.upHeadingRad);
  // Screen y runs down, north runs up.
  const x = dx * c + dy * s;
  const y = dx * s - dy * c;
  return [view.width / 2 + x, view.height / 2 + y];
}

export function drawMap(ctx: CanvasRenderingContext2D, art: MapArt, view: MapView, marks: MapMarks) {
  drawBase(ctx, art, view);
  drawMarks(ctx, view, marks);
}

/** The ground and the footprints: what stays put while the reader looks around. */
export function drawBase(ctx: CanvasRenderingContext2D, art: MapArt, view: MapView) {
  const { width, height } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLOURS.ground;
  ctx.fillRect(0, 0, width, height);

  // The footprints, in metres, under one transform.
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-view.upHeadingRad);
  ctx.scale(1 / view.metresPerPx, -1 / view.metresPerPx);
  ctx.translate(-view.centreEN[0], -view.centreEN[1]);
  // All the buildings before any development, so a development is never under the next square's buildings.
  ctx.fillStyle = COLOURS.building;
  for (const layer of art.layers) ctx.fill(layer.buildings);
  ctx.fillStyle = COLOURS.development;
  for (const layer of art.layers) ctx.fill(layer.developments);
  if (art.subject) {
    ctx.fillStyle = COLOURS.subject;
    ctx.fill(art.subject);
  }
  ctx.restore();
}

/** Landmarks, the pin and the reader, over a base already drawn. */
export function drawMarks(ctx: CanvasRenderingContext2D, view: MapView, marks: MapMarks) {
  const { width, height } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Landmarks: a dot and an upright name with a white halo, so it reads on anything.
  const px = marks.labelPx;
  ctx.font = `700 ${px}px system-ui, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const landmark of marks.landmarks) {
    const [x, y] = toPixel(view, landmark.en);
    if (x < -200 || y < -50 || x > width + 50 || y > height + 50) continue;
    ctx.beginPath();
    ctx.arc(x, y, px * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = COLOURS.landmark;
    ctx.fill();
    ctx.lineWidth = px * 0.14;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    // Labels to the right, unless that runs off the picture.
    const textWidth = ctx.measureText(landmark.name).width;
    const left = x + px * 0.6 + textWidth > width - 6;
    const tx = left ? x - px * 0.6 - textWidth : x + px * 0.6;
    ctx.lineWidth = px * 0.3;
    ctx.strokeText(landmark.name, tx, y);
    ctx.fillStyle = COLOURS.ink;
    ctx.fillText(landmark.name, tx, y);
  }

  // A spot pressed on the map: what the list beside it is about. A ring, not a pin, so the two never read alike.
  if (marks.spot) {
    const [x, y] = toPixel(view, marks.spot.en);
    ctx.beginPath();
    ctx.arc(x, y, marks.spot.radiusM / view.metresPerPx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(232, 154, 33, 0.10)';
    ctx.fill();
    ctx.setLineDash([px * 0.45, px * 0.35]);
    ctx.lineWidth = px * 0.12;
    ctx.strokeStyle = COLOURS.landmark;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, px * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = px * 0.32;
    ctx.strokeStyle = COLOURS.spot;
    ctx.stroke();
  }

  // The place chosen: a pin standing on it.
  if (marks.pin) {
    const [x, y] = toPixel(view, marks.pin);
    const h = px * 1.9;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-h * 0.1, -h * 0.25, -h * 0.42, -h * 0.45, -h * 0.42, -h * 0.68);
    ctx.arc(0, -h * 0.68, h * 0.42, Math.PI, 0);
    ctx.bezierCurveTo(h * 0.42, -h * 0.45, h * 0.1, -h * 0.25, 0, 0);
    ctx.closePath();
    ctx.fillStyle = COLOURS.subject;
    ctx.fill();
    ctx.lineWidth = px * 0.14;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -h * 0.68, h * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  // You: a dot with the way you are facing as a soft fan, and an arrow.
  if (marks.you) {
    const [x, y] = toPixel(view, marks.you.en);
    const facing = marks.you.headingRad - view.upHeadingRad;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facing);
    const reach = px * 4.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fillStyle = 'rgba(26, 115, 232, 0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, px * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, px * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = COLOURS.you;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -px * 0.45);
    ctx.lineTo(px * 0.3, px * 0.28);
    ctx.lineTo(0, px * 0.12);
    ctx.lineTo(-px * 0.3, px * 0.28);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }
}
