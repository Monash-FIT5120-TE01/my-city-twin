/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREETSCAPE KIT — shared shapes, materials and batching
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Everything in streetscape/ is built INSIDE <WorldFrame>: x east, y north, z up, metres from the scene
 * origin, z = 0 at the ground plane (the Streetscape group is lifted to the ground's AHD). Nothing here
 * converts frames — see frame.ts.
 *
 * WHY BATCHING
 *   The CBD has thousands of small street objects (signal parts, seats, rails, planters). One mesh each
 *   would be tens of thousands of draw calls. Each piece is instead baked into its place and merged with
 *   everything else of the same material in the same 100 m cell. A cell is one draw call per material,
 *   and whole cells are hidden when the camera is far away (see Streetscape.tsx).
 *
 * WHY NO SHADOWS
 *   Nothing in the streetscape casts a shadow. The sunlight figures are computed from the buildings only
 *   (trees and street furniture are not in them), so the picture must not show shade the numbers do not
 *   count. Surfaces receive the building shadows.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type XY = [number, number];

// ── unit shapes (scaled by the placement matrix) ───────────────────────────
/** 1 x 1 x 1 box centred on the origin. */
/**
 * Marks a geometry made once and used by every build (unit shapes, lamp heads). Disposal skips it: the
 * streetscape can be built again after an unmount, and three would only upload it again anyway.
 */
export function shared<G extends BufferGeometry>(g: G): G { g.userData.shared = true; return g; }
export const UNIT_BOX = shared(new BoxGeometry(1, 1, 1));
/*
 * SIGNS: TEXT THAT READS THE RIGHT WAY ROUND
 *   BoxGeometry lays its UVs out for a y-up world. With z up, as here, a texture on the +y side comes out
 *   upside down and on the x ends it lies on its side. A sign box re-lays them: the two faces across `axis`
 *   carry the picture, each reading left to right and upright from outside; the other four faces take the
 *   picture's left edge colour, so no text smears along the rim.
 */
function signBox(axis: 'x' | 'y'): BoxGeometry {
  const g = new BoxGeometry(1, 1, 1);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = n.getX(i), ny = n.getY(i);
    // the viewer's right on a face with outward normal n and z up is z × n
    if (axis === 'y' && Math.abs(ny) > 0.5) uv.setXY(i, ny > 0 ? 0.5 - x : 0.5 + x, z + 0.5);
    else if (axis === 'x' && Math.abs(nx) > 0.5) uv.setXY(i, nx > 0 ? 0.5 + y : 0.5 - y, z + 0.5);
    else uv.setXY(i, 0.002, 0.5);
  }
  return shared(g);
}
/** A sign read from its +y and -y sides (length along x). */
export const SIGN_Y = signBox('y');
/** A sign read from its +x and -x sides (width along y). */
export const SIGN_X = signBox('x');
/** Cylinder of radius 1 and height 1 along +z, base at z = 0. */
export const UNIT_CYL = (() => { const g = new CylinderGeometry(1, 1, 1, 10, 1); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return shared(g); })();
/** Same, 6 sides, for thin rods and posts seen from a distance. */
export const UNIT_ROD = (() => { const g = new CylinderGeometry(1, 1, 1, 6, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return shared(g); })();

const _q = new Quaternion(), _p = new Vector3(), _s = new Vector3(), _z = new Vector3(0, 0, 1);
/** A placement: position, turned `yaw` radians about +z (0 = local +x points east), scaled. */
export function at(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1): Matrix4 {
  _q.setFromAxisAngle(_z, yaw);
  return new Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
/** A box from its centre-bottom, with sizes along its own x (length), y (width) and z (height). */
export function boxAt(x: number, y: number, z0: number, yaw: number, len: number, wid: number, h: number): Matrix4 {
  return at(x, y, z0 + h / 2, yaw, len, wid, h);
}
/** A rod (UNIT_ROD / UNIT_CYL) from point a to point b. */
export function rodBetween(a: Vector3, b: Vector3, r: number): Matrix4 {
  const d = b.clone().sub(a), L = d.length();
  const q = new Quaternion().setFromUnitVectors(_z, d.normalize());
  return new Matrix4().compose(a.clone(), q, new Vector3(r, r, L));
}

// ── materials ──────────────────────────────────────────────────────────────
/*
 * DEPTH ORDER ON THE GROUND
 *   The road slabs are 2-15 cm above the ground plane that carries the Mapbox image, and the paint, pit
 *   lids and tactile pads are a few millimetres above the slabs. With the camera's near plane at 5 m and the
 *   city seen from a kilometre up, that is far below what the depth buffer can tell apart, so the map and
 *   the slabs took turns to win and the ground shimmered. polygonOffset settles each tie in a fixed order,
 *   deeper than the existing layers (inferred roads -4, open space -8):
 *     SURFACE  -12  carriageway, channel, tram formation
 *     RAISED   -16  footway, kerb, median, nature strip, cut-outs, platforms
 *     FLAT_TOP -24  paint, pit lids, tactile pads, platform strips, rails
 */
export const SURFACE = -12, RAISED = -16, FLAT_TOP = -24;
/** Win depth ties against the layers below by `units` (see DEPTH ORDER ON THE GROUND). */
export function onTop<M extends Material>(m: M, units: number): M { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = units; return m; }

const std = (color: string, o: Partial<{ roughness: number; metalness: number }> = {}) =>
  new MeshStandardMaterial({ color, roughness: o.roughness ?? 0.85, metalness: o.metalness ?? 0 });
/*
 * Colours. Lightness matters more than hue here (the street is mostly greys): kerbs just below the footway,
 * the footway well above the carriageway, steel light. Ground textures replace the plain colour near the
 * camera; the plain colour is each texture's mean, so the swap does not jump in brightness.
 */
export const MAT = {
  carriageway: onTop(std('#7a7971', { roughness: 0.95 }), SURFACE),
  formation: onTop(std('#b8b8b8', { roughness: 0.9 }), SURFACE - 2),   // lies over the carriageway in places
  footway: onTop(std('#a09b8e', { roughness: 0.9 }), RAISED),
  kerb: onTop(std('#7b7870', { roughness: 0.9 }), RAISED),
  channel: onTop(std('#73706a', { roughness: 0.9 }), SURFACE),
  median: onTop(std('#9aa392'), RAISED),
  nature: onTop(std('#86a36b'), RAISED),
  cutout: onTop(std('#8a8984', { roughness: 0.95 }), RAISED),
  steel: std('#c9cdd0', { roughness: 0.35, metalness: 0.25 }),   // satin stainless; high metalness reads black without an env map
  silver: std('#c7cacd', { roughness: 0.35, metalness: 0.3 }),   // Kings Street light (Dulux Silver Glow Pearl)
  galv: std('#9a9fa3', { roughness: 0.45, metalness: 0.3 }),
  signal: std('#16181a', { roughness: 0.55 }),
  visor: (() => { const m = std('#111213', { roughness: 0.95 }); m.side = DoubleSide; return m; })(),   // thin shell: both faces
  paint: onTop(std('#e9e9e4', { roughness: 0.8 }), FLAT_TOP),
  yellow: onTop(std('#e2c23c', { roughness: 0.8 }), FLAT_TOP),
  green: std('#78be20'),                                         // PTV Tram Green
  white: std('#ffffff'),
  frame: std('#3d4044', { roughness: 0.5, metalness: 0.2 }),
  darkGrey: std('#2f3337', { roughness: 0.5 }),
  rail: onTop(std('#b8bcc0', { roughness: 0.35, metalness: 0.5 }), FLAT_TOP),
  groove: onTop(std('#2f2e2b', { roughness: 1 }), FLAT_TOP),
  wire: std('#1c1c1c', { roughness: 0.6 }),
  trunk: std('#6b5a48'),
  soil: std('#3d332a', { roughness: 1 }),
  planterKerb: std('#7b7870', { roughness: 0.9 }),
  lum: (() => { const m = std('#e9ecef'); m.emissive.set('#fff4d6'); m.emissiveIntensity = 0.6; return m; })(),
};

/** A small canvas texture, sRGB. */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

// ── building in slices ─────────────────────────────────────────────────────
/*
 * The streetscape is built on the main thread after the city is up. A builder that ran for half a second
 * froze the page that long (and, in a headset, dropped 36 frames and lost button presses). Builders call
 * slice() inside their loops; once SLICE_MS of work has gone by it hands the thread back for a moment.
 */
const SLICE_MS = 12;
let slicer: (() => Promise<void>) | null = null, sliceFrom = 0;
/** Set while a build runs (Streetscape.tsx); null afterwards, when slice() costs nothing. */
export function setSlicer(yieldNow: (() => Promise<void>) | null): void { slicer = yieldNow; sliceFrom = performance.now(); }
export async function slice(): Promise<void> {
  if (!slicer || performance.now() - sliceFrom < SLICE_MS) return;
  await slicer(); sliceFrom = performance.now();
}

// ── batching by material and cell ──────────────────────────────────────────
/** A placed copy, indexed (shared vertices stay shared: un-indexing made every box 36 vertices, not 24). */
function bake(geo: BufferGeometry, m: Matrix4): BufferGeometry {
  const g = geo.clone().applyMatrix4(m);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) { const n = g.attributes.position.count, ix = new Uint32Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new BufferAttribute(ix, 1)); }
  g.clearGroups();
  return g;
}

/** A shared shape repeated at least this often in one cell and material is drawn instanced, not copied. */
const INSTANCE_MIN = 4;

export const CELL_M = 200;
/** Cells for poles and wires, seen from further: bigger cells, fewer draw calls. */
export const TALL_CELL_M = 400;

/**
 * Collects placed pieces; build() returns one Group per 100 m cell holding one merged mesh per material, plus
 * one instanced mesh per shared shape and material repeated at least INSTANCE_MIN times in the cell.
 * Each cell group carries its centre (east, north) and bounding radius in userData for the distance check.
 */
interface Cell { baked: Map<Material, BufferGeometry[]>; placed: Map<BufferGeometry, Map<Material, Matrix4[]>> }
export class Batch {
  private cells = new Map<string, Cell>();
  private cell: number;
  constructor(cellM = CELL_M) { this.cell = cellM; }
  /** `where` picks the cell when the matrix has no translation (geometry already in place). */
  add(geo: BufferGeometry, mat: Material, m: Matrix4, where?: XY): void {
    const x = where ? where[0] : m.elements[12], y = where ? where[1] : m.elements[13];
    const key = Math.floor(x / this.cell) + ',' + Math.floor(y / this.cell);
    let cell = this.cells.get(key); if (!cell) { cell = { baked: new Map(), placed: new Map() }; this.cells.set(key, cell); }
    if (geo.userData.shared) {   // decided at build(): instanced if repeated enough, else copied in
      let byMat = cell.placed.get(geo); if (!byMat) { byMat = new Map(); cell.placed.set(geo, byMat); }
      let ms = byMat.get(mat); if (!ms) { ms = []; byMat.set(mat, ms); } ms.push(m.clone());
      return;
    }
    let list = cell.baked.get(mat); if (!list) { list = []; cell.baked.set(mat, list); }
    list.push(bake(geo, m));
  }
  async build(name: string): Promise<Group> {
    const root = new Group(); root.name = name;
    for (const [key, cell] of this.cells) {
      await slice();
      const [i, j] = key.split(',').map(Number);
      const g = new Group(); g.userData.centre = [(i + 0.5) * this.cell, (j + 0.5) * this.cell];
      g.userData.radius = Math.hypot(this.cell / 2, this.cell / 2, 5);   // to the corners, and 10 m up
      for (const [geo, byMat] of cell.placed) for (const [mat, ms] of byMat) {
        if (ms.length < INSTANCE_MIN) {
          let list = cell.baked.get(mat); if (!list) { list = []; cell.baked.set(mat, list); }
          for (const m of ms) list.push(bake(geo, m));
          continue;
        }
        const im = new InstancedMesh(geo, mat, ms.length); ms.forEach((m, k) => im.setMatrixAt(k, m));
        im.computeBoundingSphere(); im.receiveShadow = true; im.castShadow = false; im.raycast = () => undefined;
        g.add(im);
      }
      for (const [mat, geos] of cell.baked) {
        const merged = mergeGeometries(geos, false); if (!merged) continue;
        const mesh = new Mesh(merged, mat); mesh.receiveShadow = true; mesh.castShadow = false;
        mesh.raycast = () => undefined;   // never in the way of picking buildings or the ground
        g.add(mesh);
        for (const geo of geos) geo.dispose();
      }
      root.add(g);
    }
    this.cells.clear();
    return root;
  }
}

/** Turn off picking and shadow casting for everything under `root`. */
export function quiet<T extends { traverse: (f: (o: unknown) => void) => void }>(root: T): T {
  root.traverse((o) => { const m = o as Mesh; if (m.isMesh) { m.raycast = () => undefined; m.castShadow = false; } });
  return root;
}

// ── 2D helpers on [east, north] rings ─────────────────────────────────────
/** Douglas-Peucker on an open polyline: the points that move it by more than `eps` metres. */
export function simplifyLine(r: XY[], eps: number): XY[] {
  if (r.length < 3) return r;
  const a = r[0], b = r[r.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  let mx = -1, ix = 0;
  for (let i = 1; i < r.length - 1; i++) {
    const d = L > 1e-9 ? Math.abs((r[i][0] - a[0]) * dy - (r[i][1] - a[1]) * dx) / L : Math.hypot(r[i][0] - a[0], r[i][1] - a[1]);
    if (d > mx) { mx = d; ix = i; }
  }
  return mx > eps ? [...simplifyLine(r.slice(0, ix + 1), eps).slice(0, -1), ...simplifyLine(r.slice(ix), eps)] : [a, b];
}
export function inRing(p: XY, r: XY[]): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/** Inset a closed ring by d (mitred). */
export function ringInset(r: XY[], d: number): XY[] {
  const pts = r.slice(0, -1), n = pts.length; let A = 0;
  for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
  const sg = A > 0 ? 1 : -1;
  const nrm = (a: XY, b: XY): XY => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [(-dy / L) * sg, (dx / L) * sg]; };
  const out: XY[] = pts.map((q, k) => {
    const n1 = nrm(pts[(k - 1 + n) % n], q), n2 = nrm(q, pts[(k + 1) % n]);
    let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const sc = d / Math.max(0.35, mx * n1[0] + my * n1[1]);
    return [q[0] + mx * sc, q[1] + my * sc];
  });
  out.push(out[0]); return out;
}
