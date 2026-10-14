/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREET ACTIVITY: THE FLAT MAP
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A screen about how busy the streets are needs the streets and nothing
 * standing in front of them, so this screen has its own map, flat and
 * north-up, instead of the 3D city (which sleeps underneath it).
 *
 * WHAT IS ON IT, BOTTOM TO TOP
 *   - the ground of the blocks;
 *   - open space (VPA), green;
 *   - the road surfaces as surveyed (City of Melbourne, the same file the
 *     3D street level is built from): carriageways white, footpaths a shade
 *     darker;
 *   - each building's ground floor, its footprint, with a fine edge;
 *   - the glows, one per counter with a level, deeper and wider the busier
 *     (activityPalette) — no dots, no pins;
 *   - the street names, along their streets (fitted, see streets.ts).
 *
 * All of it is in the city's east/north metres, drawn through one view
 * (activityMapView.ts); the paths are built once and the canvas redrawn
 * only when something changes.
 *
 * HANDLING
 *   Drag to pan, the wheel or a pinch to zoom about the pointer, + / − and
 *   "show all" in the corner, arrow keys and + / − with the map focused. A
 *   tap on a glow chooses its counter; a drag never does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CityModel } from '../data/model';
import { bundled } from '../data/bundled';
import { fetchJsonWithProgress } from '../data/fetchWithProgress';
import { CROSS_BEARING_DEG, LONG_BEARING_DEG, streetLabelsNear } from '../scene/streets';
import { ACTIVITY_COLOURS, ACTIVITY_LEVELS } from '../scene/activityPalette';
import { Icon } from './kit/Icon';
import {
  boundsOf,
  centreOn,
  fitView,
  glowAt,
  glowRadiusM,
  panBy,
  toScreen,
  toWorld,
  zoomAt,
  type Glow,
  type Insets,
  type MapView,
} from './activityMapView';

/*
 * The map's own colours: light, told apart by lightness, under the glows'
 * three reds (L* 74 / 54 / 34). Lightest is the road, so the streets the
 * glows sit on read first.
 *
 *   road        #ffffff  L* 100
 *   footpath    #f4f4ef  L* 96
 *   ground      #e9ebe4  L* 93
 *   building    #d7dbd0  L* 87   edge #b9bfb2 (L* 77)
 *   open space  #cfe0c6  L* 87   (also a hue, but only ever a park)
 *   names       #5a6169  on a white halo
 */
const MAP = {
  road: '#ffffff',
  footpath: '#f4f4ef',
  ground: '#e9ebe4',
  building: '#d7dbd0',
  edge: '#b9bfb2',
  park: '#cfe0c6',
  name: '#5a6169',
  halo: 'rgba(255,255,255,0.9)',
  selected: '#16181a',
} as const;

/** A glow is never smaller than this on screen, so the whole CBD at once still shows it. */
const MIN_GLOW_PX = 9;
/** Names only once the streets are wide enough to carry them. */
const NAMES_FROM_SCALE = 0.32;
/** A press that moves less than this is a tap, not a drag. */
const TAP_PX = 6;

const ROAD_TYPES = ['Road Carriageway', 'Road Arterial', 'Road Tram Formation', 'Road Channel'];
const FOOTPATH_TYPES = ['Road Footway', 'Road Kerb', 'Road Median', 'Road Nature Strip'];

type XY = [number, number];
interface SurfacesDoc { byType: Record<string, XY[][][]> }
interface OpenSpaceDoc { features: { polygons: XY[][][] }[] }

/** Fetched once for the page's life: three and a half megabytes are not fetched twice. */
let layersOnce: Promise<{ surfaces: SurfacesDoc | null; openSpace: OpenSpaceDoc | null }> | null = null;
function loadLayers() {
  layersOnce ??= Promise.all([
    fetchJsonWithProgress<SurfacesDoc>(bundled('data/streetscape/surfaces.json'), () => {}).catch(() => null),
    fetchJsonWithProgress<OpenSpaceDoc>(bundled('data/open-space.json'), () => {}).catch(() => null),
  ]).then(([surfaces, openSpace]) => ({ surfaces, openSpace }));
  return layersOnce;
}

/** Twice the signed area of a ring: positive anticlockwise (east/north). */
function signedArea(ring: XY[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

/**
 * Polygons (outer ring, then holes) into one path, in metres, for a
 * `nonzero` fill: every outer ring turned anticlockwise and every hole
 * clockwise. With `evenodd` instead, two polygons that overlap — two parts
 * of one building on the same footprint, two survey pieces of one road —
 * cancel where they meet and leave a gap.
 */
function pathOf(polygons: Iterable<XY[][]>): Path2D {
  const path = new Path2D();
  for (const rings of polygons) {
    rings.forEach((ring, i) => {
      if (ring.length < 3) return;
      const wantCcw = i === 0;
      const ordered = signedArea(ring) > 0 === wantCcw ? ring : [...ring].reverse();
      path.moveTo(ordered[0][0], ordered[0][1]);
      for (let k = 1; k < ordered.length; k++) path.lineTo(ordered[k][0], ordered[k][1]);
      path.closePath();
    });
  }
  return path;
}

interface Paths {
  buildings: Path2D;
  roads: Path2D | null;
  footpaths: Path2D | null;
  parks: Path2D | null;
}

/**
 * The part of the canvas the header, the column and the time bar leave
 * free, measured from where they are rather than assumed from the width:
 * the column is at the left on a wide screen and on a phone held sideways,
 * and at the foot on a phone upright, with the bar above it under the header.
 */
function freeInsets(canvas: HTMLCanvasElement): Insets {
  const box = canvas.getBoundingClientRect();
  const insets = { left: 0, right: 0, top: 0, bottom: 0 };
  const header = document.querySelector('header')?.getBoundingClientRect();
  if (header) insets.top = Math.max(0, header.bottom - box.top);
  const sheet = document.querySelector('.activity-sheet')?.getBoundingClientRect();
  const bar = document.querySelector('.activity-timebar__dock')?.getBoundingClientRect();
  if (sheet) {
    const atLeft = sheet.left <= box.left + 1 && sheet.right < box.left + box.width * 0.6 && sheet.height > box.height * 0.5;
    if (atLeft) insets.left = Math.max(0, sheet.right - box.left);
    else insets.bottom = Math.max(insets.bottom, box.bottom - sheet.top);
  }
  if (bar) {
    const below = bar.top > box.top + box.height / 2;
    if (below) insets.bottom = Math.max(insets.bottom, box.bottom - bar.top);
    else insets.top = Math.max(insets.top, bar.bottom - box.top);
  }
  // The map's credit lies over its lower edge, wherever the rest is.
  const credit = document.querySelector('.activity-credit')?.getBoundingClientRect();
  if (credit && credit.top > box.top + box.height / 2) insets.bottom = Math.max(insets.bottom, box.bottom - credit.top);
  const pad = 16;
  return { left: insets.left + pad, right: insets.right + pad, top: insets.top + pad, bottom: insets.bottom + pad };
}

export function ActivityMap({
  model,
  glows,
  sensorsEN,
  selectedId,
  focus,
  onPick,
}: {
  model: CityModel;
  /** One per counter with a level at the hour on the map. */
  glows: readonly Glow[];
  /** Every counter's place, for "show all". */
  sensorsEN: readonly [number, number][];
  selectedId: number | null;
  /** Bring this point to the middle (a search pick); `key` changes to ask again for the same point. */
  focus: { en: [number, number]; key: number } | null;
  onPick: (sensorId: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, dpr: 1 });
  const [view, setView] = useState<MapView | null>(null);
  const [layers, setLayers] = useState<{ surfaces: SurfacesDoc | null; openSpace: OpenSpaceDoc | null } | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadLayers().then((l) => alive && setLayers(l));
    return () => {
      alive = false;
    };
  }, []);

  const paths = useMemo<Paths>(() => {
    const buildings = pathOf(model.buildings.flatMap((b) => b.footprint as XY[][][]));
    const byType = layers?.surfaces?.byType ?? {};
    const of = (types: string[]) => {
      const polys = types.flatMap((t) => byType[t] ?? []);
      return polys.length ? pathOf(polys) : null;
    };
    const parks = layers?.openSpace?.features.flatMap((f) => f.polygons) ?? [];
    return { buildings, roads: of(ROAD_TYPES), footpaths: of(FOOTPATH_TYPES), parks: parks.length ? pathOf(parks) : null };
  }, [model, layers]);

  /* ── size, and the first fit ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const box = canvas.getBoundingClientRect();
      setSize({ width: box.width, height: box.height, dpr: Math.min(2, window.devicePixelRatio || 1) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const fitAll = useCallback(() => {
    const canvas = canvasRef.current;
    const bounds = boundsOf(sensorsEN as [number, number][], 120);
    if (!canvas || !bounds || size.width === 0) return;
    setView(fitView(bounds, size.width, size.height, freeInsets(canvas)));
  }, [sensorsEN, size.width, size.height]);

  /*
   * Fitted once the canvas has a size; after that the reader's view stands.
   * A frame later, so the column and the bar have their sizes too — and
   * marked done only when it has happened, so a resize that cancels the
   * frame asks again rather than leaving the map with no view at all.
   */
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || size.width === 0 || sensorsEN.length === 0) return;
    const id = window.requestAnimationFrame(() => {
      fitAll();
      fitted.current = true;
    });
    return () => window.cancelAnimationFrame(id);
  }, [size.width, sensorsEN.length, fitAll]);

  /*
   * A search pick: to the middle, close enough to read the street. Each
   * pick once — kept until there is a view to move, never repeated by a
   * resize after the reader has panned away.
   */
  const appliedFocus = useRef<number | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!focus || !canvas || !view || size.width === 0 || appliedFocus.current === focus.key) return;
    appliedFocus.current = focus.key;
    setView(centreOn(view, size.width, size.height, freeInsets(canvas), focus.en, Math.max(view.scale, 1.2)));
  }, [focus, view, size.width, size.height]);

  /* ── drawing ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view || size.width === 0) return;
    const { width, height, dpr } = size;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = MAP.ground;
    ctx.fillRect(0, 0, width, height);

    // Metres to pixels, north up: one transform for every path.
    const s = view.scale;
    const toPx = () =>
      ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * (width / 2 - view.centre[0] * s), dpr * (height / 2 + view.centre[1] * s));
    toPx();
    if (paths.parks) {
      ctx.fillStyle = MAP.park;
      ctx.fill(paths.parks, 'nonzero');
    }
    if (paths.footpaths) {
      ctx.fillStyle = MAP.footpath;
      ctx.fill(paths.footpaths, 'nonzero');
    }
    if (paths.roads) {
      ctx.fillStyle = MAP.road;
      ctx.fill(paths.roads, 'nonzero');
    }
    ctx.fillStyle = MAP.building;
    ctx.fill(paths.buildings, 'nonzero');
    ctx.strokeStyle = MAP.edge;
    ctx.lineWidth = 0.8 / s;
    ctx.stroke(paths.buildings);

    // The glows, in pixels; quiet first so the busier lie on top.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ordered = [...glows].sort((a, b) => ACTIVITY_LEVELS.indexOf(a.level) - ACTIVITY_LEVELS.indexOf(b.level));
    for (const g of ordered) {
      const [x, y] = toScreen(view, width, height, g.en[0], g.en[1]);
      const r = glowRadiusM(g.level, s, MIN_GLOW_PX) * s;
      if (x < -r || y < -r || x > width + r || y > height + r) continue;
      const hex = ACTIVITY_COLOURS[g.level];
      const v = Number.parseInt(hex.slice(1), 16);
      const rgb = `${(v >> 16) & 255},${(v >> 8) & 255},${v & 255}`;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${rgb},0.95)`);
      gradient.addColorStop(0.5, `rgba(${rgb},0.8)`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The chosen counter: a thin dark ring round its glow (not a dot; the glow is still the mark).
    const chosen = glows.find((g) => g.id === selectedId);
    if (chosen) {
      const [x, y] = toScreen(view, width, height, chosen.en[0], chosen.en[1]);
      ctx.strokeStyle = MAP.selected;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, glowRadiusM(chosen.level, s, MIN_GLOW_PX) * s * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The names, along their streets, once there is room for them.
    if (s >= NAMES_FROM_SCALE) {
      const [ce, cn] = toWorld(view, width, height, width / 2, height / 2);
      ctx.font = `500 ${s >= 1 ? 12 : 11}px ${getComputedStyle(canvas).fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const label of streetLabelsNear(ce, cn, Infinity)) {
        const [x, y] = toScreen(view, width, height, label.east, label.north);
        if (x < 0 || y < 0 || x > width || y > height) continue;
        // The street's bearing on screen (y runs down); flipped so no name reads upside down.
        const bearing = ((label.axis === 'long' ? LONG_BEARING_DEG : CROSS_BEARING_DEG) * Math.PI) / 180;
        let angle = Math.atan2(-Math.cos(bearing), Math.sin(bearing));
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.strokeStyle = MAP.halo;
        ctx.lineWidth = 3;
        ctx.strokeText(label.name, 0, 0);
        ctx.fillStyle = MAP.name;
        ctx.fillText(label.name, 0, 0);
        ctx.restore();
      }
    }
  }, [view, size, paths, glows, selectedId]);

  // For the browser checks in scripts/ (development builds only): where a counter's glow is on screen.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __activityMap?: unknown };
    w.__activityMap = {
      view,
      glowOnScreen: (id: number) => {
        const g = glows.find((x) => x.id === id);
        return g && view ? toScreen(view, size.width, size.height, g.en[0], g.en[1]) : null;
      },
      glowIds: glows.map((g) => g.id),
    };
    return () => {
      delete w.__activityMap;
    };
  }, [view, glows, size]);

  /* ── handling ── */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinch = useRef<number | null>(null);

  const local = (event: { clientX: number; clientY: number }) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const glowUnder = (x: number, y: number) => {
    if (!view) return null;
    const [e, n] = toWorld(view, size.width, size.height, x, y);
    return glowAt(glows, e, n, view.scale, MIN_GLOW_PX);
  };
  const zoomBy = (factor: number, x = size.width / 2, y = size.height / 2) =>
    setView((v) => (v ? zoomAt(v, size.width, size.height, x, y, factor) : v));

  return (
    <div className="activity-map">
      <canvas
        ref={canvasRef}
        className={`activity-map__canvas${hover ? ' activity-map__canvas--pointer' : ''}`}
        tabIndex={0}
        role="img"
        aria-label="Map of the CBD's street activity. Drag to move, scroll or pinch to zoom; the locations are listed in the column."
        onPointerDown={(event) => {
          const p = local(event);
          pointers.current.set(event.pointerId, p);
          event.currentTarget.setPointerCapture(event.pointerId);
          if (pointers.current.size === 1) press.current = { ...p, moved: false };
          else {
            const [a, b] = [...pointers.current.values()];
            pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
            if (press.current) press.current.moved = true;
          }
        }}
        onPointerMove={(event) => {
          const p = local(event);
          const before = pointers.current.get(event.pointerId);
          if (!before) {
            setHover(glowUnder(p.x, p.y) !== null);
            return;
          }
          pointers.current.set(event.pointerId, p);
          if (pointers.current.size >= 2 && pinch.current) {
            const [a, b] = [...pointers.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            zoomBy(d / pinch.current, (a.x + b.x) / 2, (a.y + b.y) / 2);
            pinch.current = d;
            return;
          }
          const start = press.current;
          if (start && Math.hypot(p.x - start.x, p.y - start.y) > TAP_PX) start.moved = true;
          if (start?.moved) setView((v) => (v ? panBy(v, p.x - before.x, p.y - before.y) : v));
        }}
        onPointerUp={(event) => {
          const p = local(event);
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          const start = press.current;
          if (pointers.current.size === 0) {
            press.current = null;
            if (start && !start.moved) {
              const hit = glowUnder(p.x, p.y);
              if (hit) onPick(hit.id);
            }
          }
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          pinch.current = null;
          press.current = null;
        }}
        onPointerLeave={() => setHover(false)}
        onWheel={(event) => {
          const p = local(event);
          zoomBy(Math.exp(-event.deltaY * 0.0015), p.x, p.y);
        }}
        onDoubleClick={(event) => {
          const p = local(event);
          zoomBy(2, p.x, p.y);
        }}
        onKeyDown={(event) => {
          const step = 60;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          if (moves[event.key]) {
            event.preventDefault();
            const [dx, dy] = moves[event.key];
            setView((v) => (v ? panBy(v, dx, dy) : v));
          } else if (event.key === '+' || event.key === '=') zoomBy(1.4);
          else if (event.key === '-') zoomBy(1 / 1.4);
        }}
      />
      <div className="activity-mapctl" role="group" aria-label="Map view">
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in">
          <Icon name="add" size={20} />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
          <Icon name="remove" size={20} />
        </button>
        <button type="button" onClick={fitAll} aria-label="Show all counting locations">
          <Icon name="center_focus_strong" size={20} />
        </button>
      </div>
      {/* Short, as the design has it, so it stays one line on a phone; the sources in full are in "About the data". */}
      <p className="attribution activity-credit">City of Melbourne / VPA · CC BY 4.0</p>
    </div>
  );
}
