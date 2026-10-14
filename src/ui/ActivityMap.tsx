/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREET ACTIVITY: THE FLAT MAP
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A screen about how busy the streets are needs the streets and nothing
 * standing in front of them, so this screen has its own flat map instead of
 * the 3D city (which sleeps underneath it).
 *
 * WHAT IS ON IT, BOTTOM TO TOP
 *   - the ground of the blocks;
 *   - open space (VPA), green;
 *   - the road surfaces as surveyed (City of Melbourne, the same file the
 *     3D street level is built from): carriageways white, footpaths a shade
 *     darker;
 *   - each building's ground floor, its footprint, with a fine edge;
 *   - the glows, one per counter with a count, on one colour ramp by how
 *     many people (activityPalette: darker and warmer, and wider, the more)
 *     — no dots, no pins; a thin ring round the chosen one;
 *   - the street names, along their streets (fitted, see streets.ts).
 *
 * WHY IT IS DRAWN TWICE (2026-10-15)
 *   The still parts are some 18,000 polygons, and painting them took about
 *   90 ms a frame: dragging ran at eleven frames a second. So they are
 *   painted once into a picture a little larger than the window, and while
 *   the map is handled that picture is only moved, scaled and turned
 *   (pictureTransform) — the glows and the names, a few dozen things, are
 *   drawn fresh on top every frame. A moment after the handling stops, the
 *   picture is painted again at the new view, sharp. Frames are asked for
 *   one at a time, so a burst of pointer events is one redraw, not twenty.
 *   Kerbs and channels, under a pixel wide when the whole CBD is shown,
 *   are left out until the map is near enough to see them.
 *
 * HANDLING
 *   Drag to pan; the wheel or a pinch to zoom about the pointer; drag with
 *   the right button or with Ctrl held, or twist two fingers, to turn it.
 *   In the corner: zoom in and out, turn left and right, north up, and
 *   show all. With the map focused: arrows pan, Shift with left and right
 *   turns, + and − zoom. A tap on a glow chooses its counter; a drag never
 *   does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CityModel } from '../data/model';
import { bundled } from '../data/bundled';
import { fetchJsonWithProgress } from '../data/fetchWithProgress';
import { CROSS_BEARING_DEG, LONG_BEARING_DEG, streetLabelsNear } from '../scene/streets';
import { rampRgb } from '../scene/activityPalette';
import { Icon } from './kit/Icon';
import {
  boundsOf,
  centreOn,
  fitView,
  glowAt,
  glowRadiusM,
  panBy,
  pictureTransform,
  rotateAt,
  toScreen,
  toWorld,
  zoomAt,
  type Glow,
  type Insets,
  type MapView,
} from './activityMapView';

/*
 * The map's own colours: light, told apart by lightness, under the glows'
 * ramp (L* 79 → 46). Lightest is the road, so the streets the glows sit on
 * read first.
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
/** Kerbs and channels only from here: below it they are under a pixel wide. */
const KERBS_FROM_SCALE = 0.7;
/** Buildings' edges only from here. */
const EDGES_FROM_SCALE = 0.45;
/** A press that moves less than this is a tap, not a drag. */
const TAP_PX = 6;
/** The still picture reaches this share of the window beyond each edge, so a pan shows no bare ground. */
const PICTURE_MARGIN = 0.3;
/** How long the map must be still before the picture is painted again. */
const SETTLE_MS = 160;
/** The picture's budget in device pixels (about 48 MB): a 4K window at twice the density would want seven times this. */
const PICTURE_MAX_PIXELS = 12_000_000;
/** While handled, a picture gone soft or wasteful with the zoom is painted again at most this often. */
const REPAINT_EVERY_MS = 250;
/** Zoomed this far from the picture's own scale it looks soft or wastes pixels: paint again (at that same rate). */
const PICTURE_SCALE_RANGE = [0.6, 1.8] as const;
/** One step of the turn buttons and Shift + arrow. */
const TURN_STEP = (15 * Math.PI) / 180;

const ROAD_TYPES = ['Road Carriageway', 'Road Arterial', 'Road Tram Formation'];
const FOOTPATH_TYPES = ['Road Footway', 'Road Median', 'Road Nature Strip'];
const KERB_TYPES = ['Road Kerb', 'Road Channel'];

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
function pathOf(polygons: Iterable<XY[][]>): Path2D | null {
  const path = new Path2D();
  let any = false;
  for (const rings of polygons) {
    rings.forEach((ring, i) => {
      if (ring.length < 3) return;
      any = true;
      const ordered = signedArea(ring) > 0 === (i === 0) ? ring : [...ring].reverse();
      path.moveTo(ordered[0][0], ordered[0][1]);
      for (let k = 1; k < ordered.length; k++) path.lineTo(ordered[k][0], ordered[k][1]);
      path.closePath();
    });
  }
  return any ? path : null;
}

interface Paths {
  buildings: Path2D | null;
  roads: Path2D | null;
  footpaths: Path2D | null;
  kerbs: Path2D | null;
  parks: Path2D | null;
}

/** The world → canvas transform for a view, as setTransform's six numbers, times `k` (device pixels). */
function worldTransform(view: MapView, width: number, height: number, k: number): [number, number, number, number, number, number] {
  const c = Math.cos(view.rotation) * view.scale;
  const s = Math.sin(view.rotation) * view.scale;
  const [cx, cy] = view.centre;
  // x = W/2 + c(e-cx) - s(n-cy);  y = H/2 - s(e-cx) - c(n-cy)
  return [k * c, -k * s, -k * s, -k * c, k * (width / 2 - c * cx + s * cy), k * (height / 2 + s * cx + c * cy)];
}

/** Paint the still parts — ground, parks, roads, buildings — for this view onto `ctx` (already sized). */
function paintStill(ctx: CanvasRenderingContext2D, paths: Paths, view: MapView, width: number, height: number, k: number) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = MAP.ground;
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(...worldTransform(view, width, height, k));
  const fill = (path: Path2D | null, colour: string) => {
    if (!path) return;
    ctx.fillStyle = colour;
    ctx.fill(path, 'nonzero');
  };
  fill(paths.parks, MAP.park);
  fill(paths.footpaths, MAP.footpath);
  if (view.scale >= KERBS_FROM_SCALE) fill(paths.kerbs, MAP.footpath);
  fill(paths.roads, MAP.road);
  fill(paths.buildings, MAP.building);
  if (paths.buildings && view.scale >= EDGES_FROM_SCALE) {
    ctx.strokeStyle = MAP.edge;
    ctx.lineWidth = 0.8 / view.scale;
    ctx.stroke(paths.buildings);
  }
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

/** The still picture: where it was painted from, and its size in CSS pixels. */
interface Picture {
  canvas: HTMLCanvasElement;
  view: MapView;
  size: [number, number];
  paths: Paths;
  /** Device pixels per CSS pixel it was painted at. */
  density: number;
  at: number;
}

/** Whether the zoom has moved so far from the picture's own that it looks soft (in) or wastes pixels (out). */
function pictureOffScale(pic: Picture, view: MapView): boolean {
  const ratio = view.scale / pic.view.scale;
  return ratio < PICTURE_SCALE_RANGE[0] || ratio > PICTURE_SCALE_RANGE[1];
}

/** Whether the window's four corners all fall inside the picture: no bare ground showing. */
function pictureCovers(pic: Picture, view: MapView, width: number, height: number): boolean {
  const [a, b, c, d, e, f] = pictureTransform(view, [width, height], pic.view, pic.size);
  return [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ].every(([x, y]) => {
    const px = a * x + c * y + e;
    const py = b * x + d * y + f;
    return px >= 0 && py >= 0 && px <= pic.size[0] && py <= pic.size[1];
  });
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
  const [layers, setLayers] = useState<{ surfaces: SurfacesDoc | null; openSpace: OpenSpaceDoc | null } | null>(null);
  const [hover, setHover] = useState(false);
  /** Only for the north arrow, which turns with the map; the view itself lives in a ref (no render per frame). */
  const [rotationShown, setRotationShown] = useState(0);
  const [hasView, setHasView] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadLayers().then((l) => alive && setLayers(l));
    return () => {
      alive = false;
    };
  }, []);

  const paths = useMemo<Paths>(() => {
    const byType = layers?.surfaces?.byType ?? {};
    const of = (types: string[]) => pathOf(types.flatMap((t) => byType[t] ?? []));
    return {
      buildings: pathOf(model.buildings.flatMap((b) => b.footprint as XY[][][])),
      roads: of(ROAD_TYPES),
      footpaths: of(FOOTPATH_TYPES),
      kerbs: of(KERB_TYPES),
      parks: pathOf(layers?.openSpace?.features.flatMap((f) => f.polygons) ?? []),
    };
  }, [model, layers]);

  /* ── the view, the picture and the frame loop, outside React's renders ── */
  const viewRef = useRef<MapView | null>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const live = useRef({ paths, glows, selectedId });
  live.current = { paths, glows, selectedId };
  const picture = useRef<Picture | null>(null);
  const frame = useRef(0);
  const settle = useRef(0);
  const fontFamily = useRef('sans-serif');
  const stats = useRef({ frames: 0, pictures: 0 });

  const paintPicture = useCallback(() => {
    const view = viewRef.current;
    const { width, height, dpr } = sizeRef.current;
    if (!view || width === 0) return;
    const w = Math.ceil(width * (1 + 2 * PICTURE_MARGIN));
    const h = Math.ceil(height * (1 + 2 * PICTURE_MARGIN));
    // Within the budget: a very large window gets a slightly softer picture rather than a huge one.
    const density = Math.min(dpr, Math.sqrt(PICTURE_MAX_PIXELS / (w * h)));
    const canvas = picture.current?.canvas ?? document.createElement('canvas');
    if (canvas.width !== Math.round(w * density)) canvas.width = Math.round(w * density);
    if (canvas.height !== Math.round(h * density)) canvas.height = Math.round(h * density);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // The same middle as the window, so the margin is even all round.
    paintStill(ctx, live.current.paths, view, w, h, density);
    picture.current = { canvas, view, size: [w, h], paths: live.current.paths, density, at: performance.now() };
    stats.current.pictures += 1;
  }, []);

  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const view = viewRef.current;
    const { width, height, dpr } = sizeRef.current;
    if (!canvas || !view || width === 0) return;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { paths: p, glows: gs, selectedId: chosenId } = live.current;
    /*
     * Paint it now if there is none yet, if the layers have arrived since, or
     * if it no longer covers the window (a long drag, a big turn) — at once,
     * so no corner ever shows bare ground. Only a picture that still covers
     * but has gone soft or wasteful with the zoom waits, at most
     * REPAINT_EVERY_MS, so a long wheel zoom is not a repaint every frame.
     */
    const pic0 = picture.current;
    const stale =
      !pic0 ||
      pic0.paths !== p ||
      !pictureCovers(pic0, view, width, height) ||
      (pictureOffScale(pic0, view) && performance.now() - pic0.at > REPAINT_EVERY_MS);
    if (stale) paintPicture();
    const pic = picture.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = MAP.ground;
    ctx.fillRect(0, 0, width, height);
    if (pic) {
      const [a, b, c, d, e, f] = pictureTransform(pic.view, pic.size, view, [width, height]);
      ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * e, dpr * f);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pic.canvas, 0, 0, pic.size[0], pic.size[1]);
    }

    // The glows, in pixels, coloured by the count on the ramp; the quieter first so the busier lie on top.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = view.scale;
    const ordered = [...gs].sort((x, y) => x.t - y.t);
    for (const g of ordered) {
      const [x, y] = toScreen(view, width, height, g.en[0], g.en[1]);
      const r = glowRadiusM(g.t, s, MIN_GLOW_PX) * s;
      if (x < -r || y < -r || x > width + r || y > height + r) continue;
      const rgb = rampRgb(g.t).join(',');
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
    const chosen = gs.find((g) => g.id === chosenId);
    if (chosen) {
      const [x, y] = toScreen(view, width, height, chosen.en[0], chosen.en[1]);
      ctx.strokeStyle = MAP.selected;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, glowRadiusM(chosen.t, s, MIN_GLOW_PX) * s * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    }

    // The names, along their streets and turned with the map, never upside down.
    if (s >= NAMES_FROM_SCALE) {
      const [ce, cn] = toWorld(view, width, height, width / 2, height / 2);
      ctx.font = `500 ${s >= 1 ? 12 : 11}px ${fontFamily.current}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (const label of streetLabelsNear(ce, cn, Infinity)) {
        const [x, y] = toScreen(view, width, height, label.east, label.north);
        if (x < 0 || y < 0 || x > width || y > height) continue;
        const bearing = ((label.axis === 'long' ? LONG_BEARING_DEG : CROSS_BEARING_DEG) * Math.PI) / 180;
        // On screen (y down): the street's direction, less the map's own turn.
        let angle = Math.atan2(-Math.cos(bearing), Math.sin(bearing)) - view.rotation;
        angle = Math.atan2(Math.sin(angle), Math.cos(angle));
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
    stats.current.frames += 1;

    // Moved since the picture was painted: paint it again once things are still.
    if (pic && pic.view !== view) {
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => {
        paintPicture();
        if (!frame.current) frame.current = window.requestAnimationFrame(draw);
      }, SETTLE_MS);
    }
  }, [paintPicture]);

  /** Ask for a frame; many asks before it comes are one frame. */
  const redraw = useCallback(() => {
    if (!frame.current) frame.current = window.requestAnimationFrame(draw);
  }, [draw]);

  const setView = useCallback(
    (next: MapView | null | ((v: MapView) => MapView)) => {
      const value = typeof next === 'function' ? (viewRef.current ? next(viewRef.current) : null) : next;
      if (!value) return;
      viewRef.current = value;
      setHasView(true);
      setRotationShown((r) => (Math.abs(r - value.rotation) > 1e-4 ? value.rotation : r));
      redraw();
    },
    [redraw],
  );

  useEffect(
    () => () => {
      window.cancelAnimationFrame(frame.current);
      window.clearTimeout(settle.current);
      // Cleared too: StrictMode unmounts and mounts again, and a stale id would block every later frame.
      frame.current = 0;
    },
    [],
  );

  // New glows, a new choice or new layers: one frame (the picture repaints itself if its paths changed).
  useEffect(() => {
    redraw();
  }, [paths, glows, selectedId, redraw]);

  /* ── size, and the first fit ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fontFamily.current = getComputedStyle(canvas).fontFamily || 'sans-serif';
    const measure = () => {
      const box = canvas.getBoundingClientRect();
      setSize({ width: box.width, height: box.height, dpr: Math.min(2, window.devicePixelRatio || 1) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    /*
     * A window dragged to a screen of another density keeps its size, so the
     * observer says nothing: listen for the density itself, afresh each time.
     */
    let density: MediaQueryList | null = null;
    const watchDensity = () => {
      density?.removeEventListener('change', onDensity);
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      density.addEventListener('change', onDensity);
    };
    const onDensity = () => {
      measure();
      watchDensity();
    };
    watchDensity();
    return () => {
      observer.disconnect();
      density?.removeEventListener('change', onDensity);
    };
  }, []);

  // A new size: the picture is the wrong size now, so paint it again, then draw.
  useEffect(() => {
    if (!viewRef.current || size.width === 0) return;
    paintPicture();
    redraw();
  }, [size, paintPicture, redraw]);

  const fitAll = useCallback(() => {
    const canvas = canvasRef.current;
    const bounds = boundsOf(sensorsEN as [number, number][], 120);
    const { width, height } = sizeRef.current;
    if (!canvas || !bounds || width === 0) return;
    setView(fitView(bounds, width, height, freeInsets(canvas), viewRef.current?.rotation ?? 0));
  }, [sensorsEN, setView]);

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
    const view = viewRef.current;
    if (!focus || !canvas || !view || size.width === 0 || appliedFocus.current === focus.key) return;
    appliedFocus.current = focus.key;
    setView(centreOn(view, size.width, size.height, freeInsets(canvas), focus.en, Math.max(view.scale, 1.2)));
  }, [focus, hasView, size.width, size.height, setView]);

  // For the browser checks in scripts/ (development builds only): the view, where a glow is, how hard it works.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __activityMap?: unknown };
    w.__activityMap = {
      get view() {
        return viewRef.current;
      },
      glowOnScreen: (id: number) => {
        const g = live.current.glows.find((x) => x.id === id);
        const v = viewRef.current;
        return g && v ? toScreen(v, sizeRef.current.width, sizeRef.current.height, g.en[0], g.en[1]) : null;
      },
      get glowIds() {
        return live.current.glows.map((g) => g.id);
      },
      get stats() {
        return { ...stats.current };
      },
    };
    return () => {
      delete w.__activityMap;
    };
  }, []);

  /* ── handling ── */
  type Gesture = 'pan' | 'turn' | 'pinch';
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number; moved: boolean; gesture: Gesture } | null>(null);
  const pinch = useRef<{ d: number; angle: number; mid: [number, number] } | null>(null);

  const local = (event: { clientX: number; clientY: number }) => {
    const box = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };
  const glowUnder = (x: number, y: number) => {
    const view = viewRef.current;
    if (!view) return null;
    const [e, n] = toWorld(view, sizeRef.current.width, sizeRef.current.height, x, y);
    return glowAt(live.current.glows, e, n, view.scale, MIN_GLOW_PX);
  };
  const zoomBy = (factor: number, x = sizeRef.current.width / 2, y = sizeRef.current.height / 2) =>
    setView((v) => zoomAt(v, sizeRef.current.width, sizeRef.current.height, x, y, factor));
  /** Turn about the middle of the free part, so what is being looked at stays put. */
  const turnBy = (radians: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const i = freeInsets(canvas);
    const { width, height } = sizeRef.current;
    const x = i.left + (width - i.left - i.right) / 2;
    const y = i.top + (height - i.top - i.bottom) / 2;
    setView((v) => rotateAt(v, width, height, x, y, radians));
  };
  const twoFingers = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2] as [number, number] };
  };

  return (
    <div className="activity-map">
      <canvas
        ref={canvasRef}
        className={`activity-map__canvas${hover ? ' activity-map__canvas--pointer' : ''}`}
        tabIndex={0}
        role="img"
        aria-label="Map of the CBD's street activity. Drag to move, scroll or pinch to zoom, right-drag or twist to turn; the locations are listed in the column."
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          const p = local(event);
          pointers.current.set(event.pointerId, p);
          event.currentTarget.setPointerCapture(event.pointerId);
          if (pointers.current.size === 1) {
            const gesture: Gesture = event.button === 2 || event.ctrlKey ? 'turn' : 'pan';
            press.current = { ...p, moved: false, gesture };
          } else if (pointers.current.size === 2) {
            pinch.current = twoFingers();
            if (press.current) {
              press.current.moved = true;
              press.current.gesture = 'pinch';
            }
          }
        }}
        onPointerMove={(event) => {
          const p = local(event);
          const before = pointers.current.get(event.pointerId);
          if (!before) {
            const over = glowUnder(p.x, p.y) !== null;
            setHover((h) => (h === over ? h : over));
            return;
          }
          pointers.current.set(event.pointerId, p);
          const { width, height } = sizeRef.current;
          if (pointers.current.size >= 2 && pinch.current) {
            // Two fingers: zoom by their spread, turn by their twist, pan by their middle.
            const now = twoFingers();
            const was = pinch.current;
            setView((v) => {
              let next = panBy(v, now.mid[0] - was.mid[0], now.mid[1] - was.mid[1]);
              next = zoomAt(next, width, height, now.mid[0], now.mid[1], now.d / Math.max(1, was.d));
              // Screen angles run clockwise; the map's rotation anticlockwise.
              return rotateAt(next, width, height, now.mid[0], now.mid[1], -(now.angle - was.angle));
            });
            pinch.current = now;
            return;
          }
          const start = press.current;
          if (start && Math.hypot(p.x - start.x, p.y - start.y) > TAP_PX) start.moved = true;
          if (!start?.moved) return;
          if (start.gesture === 'turn') {
            // Dragging right turns the map clockwise, about where the drag began.
            setView((v) => rotateAt(v, width, height, start.x, start.y, -(p.x - before.x) * 0.006));
          } else {
            setView((v) => panBy(v, p.x - before.x, p.y - before.y));
          }
        }}
        onPointerUp={(event) => {
          const p = local(event);
          pointers.current.delete(event.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          const start = press.current;
          if (pointers.current.size === 0) {
            press.current = null;
            if (start && !start.moved && start.gesture === 'pan') {
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
          if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            event.preventDefault();
            turnBy(event.key === 'ArrowLeft' ? TURN_STEP : -TURN_STEP);
            return;
          }
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          };
          if (moves[event.key]) {
            event.preventDefault();
            const [dx, dy] = moves[event.key];
            setView((v) => panBy(v, dx, dy));
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
        <button type="button" onClick={() => turnBy(TURN_STEP)} aria-label="Turn the map left">
          <Icon name="rotate_left" size={20} />
        </button>
        <button type="button" onClick={() => turnBy(-TURN_STEP)} aria-label="Turn the map right">
          <Icon name="rotate_right" size={20} />
        </button>
        {/* The arrow points to north on the map, so it says which way is up as well as putting it back. */}
        <button
          type="button"
          onClick={() => turnBy(-(viewRef.current?.rotation ?? 0))}
          aria-label={Math.abs(rotationShown) < 1e-4 ? 'North is up' : 'Turn north up'}
          disabled={Math.abs(rotationShown) < 1e-4}
        >
          <span className="activity-mapctl__north" style={{ transform: `rotate(${-rotationShown}rad)` }}>
            <Icon name="navigation" size={20} />
          </span>
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
