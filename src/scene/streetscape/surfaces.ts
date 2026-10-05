/*
 * ROAD SURFACES — the City of Melbourne "Road segments with surface type" polygons, as slabs.
 *
 * Carriageway, kerb, channel, footway, median, nature strip and tram formation are drawn as their real
 * outlines, raised to their real-world heights (kerb exposed ~150 mm, footway at kerb height). Footway
 * holes are kept: tree pits get planters (street.ts), the rest are filled flush as "cut-out, purpose not
 * recorded".
 *
 * TWO VERSIONS (Streetscape.tsx decides when the near one shows)
 *   near  one mesh per surface type per 200 m cell: top faces, and side walls on kerbs, medians and nature
 *         strips (see WALLED), so the kerb face is there at street level.
 *         No bottom faces: nothing ever sees them.
 *   far   one mesh per material for the whole CBD: top faces only, no kerbs or channels (see NOT_FAR),
 *         pieces under 1 m2 left out, laid 5 mm lower and one step back in depth order. Always drawn, so there is
 *         never a seam where the near cells stop; the near cells win every depth tie over it. As precise as
 *         the near tops, so where there are no ground textures (phones, headsets) the near cells are needed
 *         only for their walls.
 *
 * Near the camera each near slab wears a CC0 texture (ambientCG) laid along the Hoddle Grid; further away the
 * plain colour, which is that texture's mean. Textured materials are made on first use and dropped after
 * 20 s unused — see SurfaceTextures.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  ShapeUtils,
  SRGBColorSpace,
  RepeatWrapping,
  TextureLoader,
  Uint32BufferAttribute,
  Vector2,
  type Material,
  type Texture,
} from 'three';
import { bundled } from '../../data/bundled';
import { MAT, RAISED, SURFACE, onTop, simplifyLine, type XY } from './kit';

export interface SurfacesDoc {
  axes: { ns: XY; ew: XY };
  byType: Record<string, XY[][][]>;
  otherHoles: XY[][];
}

/** [plain material, slab top height m, texture key] per surface type. */
const KIND: Record<string, [Material, number, string | null]> = {
  'Road Carriageway': [MAT.carriageway, 0.02, 'asphalt'],
  'Road Arterial': [MAT.carriageway, 0.02, 'asphalt'],
  'Road Channel': [MAT.channel, 0.03, 'channel'],
  'Road Kerb': [MAT.kerb, 0.15, 'kerb'],
  'Road Footway': [MAT.footway, 0.14, 'pavers'],
  'Road Median': [MAT.median, 0.15, null],
  'Road Nature Strip': [MAT.nature, 0.15, null],
  'Road Tram Formation': [MAT.formation, 0.035, 'formation'],
  cutout: [MAT.cutout, 0.1, null],
};
/*
 * Side walls only where a slab stands above a lower neighbour: kerbs (over the channel and road), medians and
 * nature strips. A footway meets a kerb or a building at the same height, and a cut-out sits lower than the
 * footway round it, so their walls would never be seen.
 */
const WALLED = new Set(['Road Kerb', 'Road Median', 'Road Nature Strip']);
/*
 * Kerbs and channels are strips 0.3-0.5 m wide holding half the outline points of the whole data set. Beyond
 * the near cells they are under a pixel wide, so the far version leaves them out; the near cells carry them.
 */
const NOT_FAR = new Set(['Road Kerb', 'Road Channel']);
const NEAR_CELL_M = 200, FAR_SIMPLIFY_M = 0.05, FAR_MIN_AREA_M2 = 1, FAR_DROP_M = 0.005;

// ── geometry ───────────────────────────────────────────────────────────────
/** Twice the signed area: positive when the ring runs counter-clockwise. */
const area2 = (r: XY[]) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
/** The ring without its closing point, wound counter-clockwise (ccw) or clockwise. */
function openRing(r: XY[], ccw: boolean): XY[] {
  const closed = r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  const o = closed ? r.slice(0, -1) : r.slice();
  return (area2(o) > 0) === ccw ? o : o.reverse();
}
/** An open ring simplified to `eps`: split at the point farthest from the first, so both halves are open. */
function simplify(r: XY[], eps: number): XY[] {
  let k = 0, mx = -1;
  for (let i = 1; i < r.length; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > mx) { mx = d; k = i; } }
  return [...simplifyLine(r.slice(0, k + 1), eps).slice(0, -1), ...simplifyLine([...r.slice(k), r[0]], eps).slice(0, -1)];
}

/** Vertex arrays for one merged mesh, filled polygon by polygon. */
class Acc {
  pos: number[] = []; nrm: number[] = []; uv: number[] = []; idx: number[] = [];
  private v(x: number, y: number, z: number, nx: number, ny: number, u: number, w: number): number {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nx === 0 && ny === 0 ? 1 : 0); this.uv.push(u, w);
    return this.pos.length / 3 - 1;
  }
  /** Top face at height z. Texture coordinates are world metres (x, y), which the textures are scaled for. */
  top(outer: XY[], holes: XY[][], z: number): void {
    const v2 = (r: XY[]) => r.map(([x, y]) => new Vector2(x, y));
    const faces = ShapeUtils.triangulateShape(v2(outer), holes.map(v2));
    const base = this.pos.length / 3, P = this.pos;
    for (const r of [outer, ...holes]) for (const [x, y] of r) this.v(x, y, z, 0, 0, x, y);
    for (const [a, b, c] of faces) {   // every triangle facing up, whatever order the triangulation gave
      const ia = (base + a) * 3, ib = (base + b) * 3, ic = (base + c) * 3;
      const up = (P[ib] - P[ia]) * (P[ic + 1] - P[ia + 1]) - (P[ib + 1] - P[ia + 1]) * (P[ic] - P[ia]) >= 0;
      if (up) this.idx.push(base + a, base + b, base + c); else this.idx.push(base + a, base + c, base + b);
    }
  }
  /** Side walls from the ground up to z, facing out of the solid (outer ring ccw, holes cw). */
  walls(ring: XY[], z: number): void {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      const nx = dy / L, ny = -dx / L;
      const a = this.v(x0, y0, 0, nx, ny, s, 0), b = this.v(x1, y1, 0, nx, ny, s + L, 0);
      const c = this.v(x1, y1, z, nx, ny, s + L, z), d = this.v(x0, y0, z, nx, ny, s, z);
      this.idx.push(a, b, c, a, c, d); s += L;
    }
  }
  geometry(): BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setIndex(new Uint32BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** The far version of a plain material: the same look, two steps back in depth order (see onTop). */
const farMats = new Map<Material, Material>();
function farOf(m: Material): Material {
  let f = farMats.get(m);
  if (!f) { f = m.clone(); f.polygonOffsetUnits = m.polygonOffsetUnits + 2; farMats.set(m, f); }
  return f;
}

export interface Surfaces { root: Group; near: Group; far: Group }

/**
 * @param breathe awaited whenever 40 ms of work has gone by, so the page keeps scrolling while this runs.
 */
export async function buildSurfaces(doc: SurfacesDoc, breathe: () => Promise<void> = async () => undefined): Promise<Surfaces> {
  const root = new Group(); root.name = 'surfaces';
  const near = new Group(); near.name = 'surfaces-near';
  const far = new Group(); far.name = 'surfaces-far';
  root.add(far, near);
  let since = performance.now();
  const tick = async () => { if (performance.now() - since > 40) { await breathe(); since = performance.now(); } };

  const polys: [string, XY[][]][] = [];
  for (const [type, ps] of Object.entries(doc.byType)) if (KIND[type]) for (const p of ps) polys.push([type, p]);
  for (const h of doc.otherHoles) polys.push(['cutout', [h]]);

  const cells = new Map<string, Acc>(), farAcc = new Map<Material, Acc>();
  for (const [type, poly] of polys) {
    const [mat, z] = KIND[type];
    const outer = openRing(poly[0], true); if (outer.length < 3) continue;
    const holes = poly.slice(1).map((h) => openRing(h, false)).filter((h) => h.length >= 3);
    const key = type + '|' + Math.floor(outer[0][0] / NEAR_CELL_M) + ',' + Math.floor(outer[0][1] / NEAR_CELL_M);
    let a = cells.get(key); if (!a) { a = new Acc(); cells.set(key, a); }
    a.top(outer, holes, z);
    if (WALLED.has(type)) for (const r of [outer, ...holes]) a.walls(r, z);
    if (!NOT_FAR.has(type) && Math.abs(area2(outer)) / 2 >= FAR_MIN_AREA_M2) {
      const fo = simplify(outer, FAR_SIMPLIFY_M);
      if (fo.length >= 3) {
        const fh = holes.filter((h) => Math.abs(area2(h)) / 2 >= FAR_MIN_AREA_M2).map((h) => simplify(h, FAR_SIMPLIFY_M)).filter((h) => h.length >= 3);
        let f = farAcc.get(mat); if (!f) { f = new Acc(); farAcc.set(mat, f); }
        f.top(fo, fh, z - FAR_DROP_M);
      }
    }
    await tick();
  }
  for (const [key, acc] of cells) {
    await tick();
    const geo = acc.geometry(); if (!geo) continue;
    const [type] = key.split('|'), kind = KIND[type];
    const mesh = new Mesh(geo, kind[0]);
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.raycast = () => undefined;
    const bs = geo.boundingSphere!;
    mesh.userData = { type, texKey: kind[2], plain: mesh.material, centre: [bs.center.x, bs.center.y], radius: bs.radius, walled: WALLED.has(type), nearOnly: NOT_FAR.has(type) };
    near.add(mesh);
  }
  for (const [mat, acc] of farAcc) {
    const geo = acc.geometry(); if (!geo) continue;
    const mesh = new Mesh(geo, farOf(mat));
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.raycast = () => undefined;
    far.add(mesh);
  }
  return { root, near, far };
}

// ── near-camera textures ───────────────────────────────────────────────────
/*
 * CC0 textures from ambientCG, chosen against street photos of Swanston St x Collins St:
 *   asphalt  Asphalt023S (light, slightly warm worn asphalt)
 *   formation  Concrete034 with a dark joint baked in, one tile = one 3.6 m panel
 *   pavers   PavingStones126A (light grey stone pavers); kerb and channel use it tinted darker
 * Licence and sources: public/textures/streetscape/LICENSE.txt.
 */
const TEX: Record<string, { file: string; metres: number; tint: string; depth: number }> = {
  asphalt: { file: 'asphalt.jpg', metres: 4, tint: '#ffffff', depth: SURFACE },
  formation: { file: 'formation.jpg', metres: 3.6, tint: '#f2e9dc', depth: SURFACE - 2 },
  pavers: { file: 'pavers.jpg', metres: 2.5, tint: '#ffffff', depth: RAISED },
  kerb: { file: 'pavers.jpg', metres: 1.5, tint: '#c4c4c4', depth: RAISED },
  channel: { file: 'pavers.jpg', metres: 1.5, tint: '#b4b4b4', depth: SURFACE },
};

export class SurfaceTextures {
  private cache = new Map<string, { mat: MeshStandardMaterial; tex: Texture; last: number }>();
  private loader = new TextureLoader();
  private gridAngle: number;
  constructor(gridAngle: number) { this.gridAngle = gridAngle; }
  get(key: string): MeshStandardMaterial | null {
    const spec = TEX[key]; if (!spec) return null;
    let e = this.cache.get(key);
    if (!e) {
      const tex = this.loader.load(bundled('textures/streetscape/' + spec.file));
      tex.colorSpace = SRGBColorSpace; tex.wrapS = tex.wrapT = RepeatWrapping; tex.anisotropy = 8;
      tex.repeat.set(1 / spec.metres, 1 / spec.metres); tex.rotation = -this.gridAngle;   // joints run with the streets
      e = { mat: onTop(new MeshStandardMaterial({ map: tex, color: spec.tint, roughness: 0.92 }), spec.depth), tex, last: 0 };
      this.cache.set(key, e);
    }
    e.last = performance.now();
    return e.mat;
  }
  /** Drop materials not used for 20 s; their textures leave the GPU with them. */
  sweep(): void {
    const now = performance.now();
    for (const [k, e] of this.cache) if (now - e.last > 20000) { e.tex.dispose(); e.mat.dispose(); this.cache.delete(k); }
  }
  dispose(): void { for (const e of this.cache.values()) { e.tex.dispose(); e.mat.dispose(); } this.cache.clear(); }
}
