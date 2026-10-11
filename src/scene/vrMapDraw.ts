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

export interface MapArt {
  buildings: Path2D;
  /** Approved developments, other than the one being looked at. */
  developments: Path2D;
  /** The one being looked at, if any. */
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

/** Whether a footprint starts within `radiusM` of a point — near enough to draw. */
function startsNear(polygons: PolygonEN[], [e, n]: [number, number], radiusM: number): boolean {
  const first = polygons[0]?.[0]?.[0];
  return first !== undefined && Math.hypot(first[0] - e, first[1] - n) <= radiusM;
}

/**
 * The city as paths, once. With `near`, only what stands within that reach
 * of a point — the small map shows a few hundred metres, and filling every
 * one of the city's 4,445 footprints for it, several times a second while the
 * reader turned, cost the headset a frame each time.
 *
 * Without the place being looked at: that is `withSubject`'s, so choosing a
 * place does not build the whole city again. It did, and building these
 * paths is most of a second even on a desktop (2026-10-09) — the freeze
 * after choosing a place in the headset. Every development is in
 * `developments`, the chosen one included; its own colour is filled over it.
 */
export function makeMapArt(
  buildings: { footprint: PolygonEN[] }[],
  developments: { key: string; footprints: PolygonEN[] }[],
  near?: { centre: [number, number]; radiusM: number },
): MapArt {
  const art: MapArt = { buildings: new Path2D(), developments: new Path2D(), subject: null };
  const keep = (polygons: PolygonEN[]) => !near || startsNear(polygons, near.centre, near.radiusM);
  for (const building of buildings) if (keep(building.footprint)) addPolygons(art.buildings, building.footprint);
  for (const development of developments) if (keep(development.footprints)) addPolygons(art.developments, development.footprints);
  return art;
}

/** The same paths with the place being looked at on top: one footprint's worth of work. */
export function withSubject(
  art: MapArt,
  developments: { key: string; footprints: PolygonEN[] }[],
  subjectKey: string | null,
): MapArt {
  const chosen = subjectKey === null ? undefined : developments.find((development) => development.key === subjectKey);
  if (!chosen) return { ...art, subject: null };
  const subject = new Path2D();
  addPolygons(subject, chosen.footprints);
  return { ...art, subject };
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
}

const COLOURS = {
  ground: '#eef0ec',
  building: '#d6d9d2',
  development: '#b9dccd',
  subject: '#14624a',
  you: '#1a73e8',
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
  ctx.fillStyle = COLOURS.building;
  ctx.fill(art.buildings);
  ctx.fillStyle = COLOURS.development;
  ctx.fill(art.developments);
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
