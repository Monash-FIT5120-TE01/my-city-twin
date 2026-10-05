/*
 * LEVEL OF DETAIL — which parts of the streetscape are drawn, from where the camera is.
 *
 * HOW FAR IS "NEAR"
 *   Straight-line distance from the camera to the nearest point of a part's bounding sphere, in metres.
 *   Height counts: from 1 km up the street furniture below is 1 km away, however close it is on the map.
 *   (The earlier rule measured along the ground and added 0.6 x the height, which drew more the higher the
 *   camera went.)
 *
 * NO FLICKER AT THE EDGE
 *   A part appears inside its distance and goes only once it is 10 % beyond it, so a camera resting on the
 *   boundary does not switch it every check.
 *
 * DEVICES
 *   Distances are given for a desktop and scaled by the device's `reach` (see DEVICE): phones and a headset
 *   in VR draw the same city out to 60 % of the distance. The scale can change while running (entering VR).
 */
import { InstancedBufferAttribute, InstancedMesh, type BufferGeometry, type Color, type Material, type Matrix4, type Object3D, type Vector3 } from 'three';

/** Drawing distances on a desktop, metres. */
export const DIST = {
  /** Paint, pit lids, tactile pads: a few millimetres proud, invisible beyond this. */
  tiny: 100,
  /** Seats, bins, signal heads, lamp heads, platform fittings, planters. */
  small: 220,
  /** Poles, overhead wires, shelters. */
  tall: 600,
  /** The detailed road slabs (kerb faces, textures); the plain far slabs are always drawn. */
  slabs: 300,
  /** Ground textures on the slabs. */
  textures: 60,
  /** Full leaf-card crowns; further out a tree has a five-card crown. */
  crowns: 150,
} as const;

export type Device = 'desktop' | 'mobile' | 'xr';
export interface DeviceSettings {
  /** Multiplies every distance in DIST. */
  reach: number;
  /** Ground textures near the camera. */
  textures: boolean;
}
export const DEVICE: Record<Device, DeviceSettings> = {
  desktop: { reach: 1, textures: true },
  mobile: { reach: 0.6, textures: false },
  xr: { reach: 0.6, textures: false },
};

/** A phone or tablet (touch first, or says so), or the Quest's own browser even outside VR. */
export function detectDevice(): Device {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/OculusBrowser|Quest|Pico/i.test(ua)) return 'xr';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (coarse && navigator.maxTouchPoints > 0)) return 'mobile';
  return 'desktop';
}

interface Entry { obj: Object3D; x: number; y: number; z: number; r: number; within: number }

/*
 * REPEATED SMALL THINGS: ONE INSTANCED MESH, REPACKED
 *   Trees, planter posts and plants, pit lids, tactile pads, bay lines and road paint are thousands of copies
 *   spread over the whole CBD. One instanced mesh each keeps them to one draw call, but then all of them are
 *   drawn from anywhere. So each item (a tree, a planter, a pit) has a position, and the mesh holds only the
 *   instances of the items in range. It is repacked only when an item enters or leaves the range, not every
 *   check, so a camera at rest costs nothing.
 */

/** Positions of the items (trees, planters, pits) that one or more Compact meshes draw. */
export class ItemSet {
  readonly x: Float32Array; readonly y: Float32Array; readonly flags: Uint8Array;
  constructor(points: ArrayLike<number>[]) {
    const n = points.length; this.x = new Float32Array(n); this.y = new Float32Array(n); this.flags = new Uint8Array(n);
    points.forEach((p, i) => { this.x[i] = p[0]; this.y[i] = p[1]; });
  }
  /** In range: within `lim` of the camera, with the same 10 % allowance as LodSet. True if any item changed. */
  update(cam: Vector3, lim: number): boolean {
    let changed = false; const z2 = cam.z * cam.z;
    for (let i = 0; i < this.x.length; i++) {
      const dx = this.x[i] - cam.x, dy = this.y[i] - cam.y, d2 = dx * dx + dy * dy + z2;
      const l = this.flags[i] ? lim * 1.1 : lim, on = d2 < l * l ? 1 : 0;
      if (on !== this.flags[i]) { this.flags[i] = on; changed = true; }
    }
    return changed;
  }
}

/** Collects the instances of one Compact, item by item (items in ascending order). */
export class CompactBuilder {
  private mats: number[] = []; private cols: number[] = []; private starts: number[] = [0]; private item = 0;
  private geo: BufferGeometry; private mat: Material; private items: number; private coloured: boolean;
  constructor(geo: BufferGeometry, mat: Material, items: number, coloured = false) { this.geo = geo; this.mat = mat; this.items = items; this.coloured = coloured; }
  push(item: number, m: Matrix4, c?: Color): void {
    while (this.item < item) { this.starts.push(this.mats.length / 16); this.item++; }
    this.mats.push(...m.elements); if (this.coloured) this.cols.push(c ? c.r : 1, c ? c.g : 1, c ? c.b : 1);
  }
  build(name: string): Compact {
    while (this.item < this.items) { this.starts.push(this.mats.length / 16); this.item++; }
    return new Compact(name, this.geo, this.mat, new Uint32Array(this.starts), new Float32Array(this.mats), this.coloured ? new Float32Array(this.cols) : null);
  }
}

/** An instanced mesh holding only the instances of the items in range (or out of range, for `invert`). */
export class Compact {
  readonly mesh: InstancedMesh;
  private starts: Uint32Array; private all: Float32Array; private cols: Float32Array | null;
  constructor(name: string, geo: BufferGeometry, mat: Material, starts: Uint32Array, all: Float32Array, cols: Float32Array | null) {
    this.starts = starts; this.all = all; this.cols = cols;
    this.mesh = new InstancedMesh(geo, mat, Math.max(1, all.length / 16)); this.mesh.name = name;
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.castShadow = false; this.mesh.raycast = () => undefined;
    this.mesh.frustumCulled = true;
    if (cols) this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(cols.length), 3);
  }
  apply(flags: Uint8Array, invert: boolean): void {
    const dst = this.mesh.instanceMatrix.array as Float32Array, cdst = this.mesh.instanceColor?.array as Float32Array | undefined;
    let n = 0;
    for (let i = 0; i < flags.length; i++) {
      if (!flags[i] === !invert) continue;
      const a = this.starts[i], b = this.starts[i + 1]; if (b === a) continue;
      dst.set(this.all.subarray(a * 16, b * 16), n * 16);
      if (cdst && this.cols) cdst.set(this.cols.subarray(a * 3, b * 3), n * 3);
      n += b - a;
    }
    this.mesh.count = n; this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (n) this.mesh.computeBoundingSphere();
  }
}

/** A set of items, how far they are drawn, and the meshes drawing them (`invert`: drawn when out of range). */
export interface CompactGroup { items: ItemSet; within: number; parts: [Compact, boolean][] }

/** One instance per item: `place(i)` gives item i's matrix. */
export function compactEach(name: string, geo: BufferGeometry, mat: Material, points: ArrayLike<number>[], place: (i: number) => Matrix4, within: number): CompactGroup {
  const b = new CompactBuilder(geo, mat, points.length);
  for (let i = 0; i < points.length; i++) b.push(i, place(i));
  return { items: new ItemSet(points), within, parts: [[b.build(name), false]] };
}

/** Parts switched on and off by distance. */
export class LodSet {
  private entries: Entry[] = [];
  /** `within` is a DIST value; (x, y, z) and r the part's bounding sphere in the streetscape's frame. */
  add(obj: Object3D, x: number, y: number, z: number, r: number, within: number): void {
    this.entries.push({ obj, x, y, z, r, within });
    obj.visible = false;
  }
  private groups: CompactGroup[] = [];
  addGroup(g: CompactGroup): void { this.groups.push(g); for (const [c, inv] of g.parts) c.apply(g.items.flags, inv); }
  /** @param cam the camera in the streetscape's frame (east, north, up). */
  update(cam: Vector3, reach: number): void {
    for (const g of this.groups) if (g.items.update(cam, g.within * reach)) for (const [c, inv] of g.parts) c.apply(g.items.flags, inv);
    for (const e of this.entries) {
      const d = Math.hypot(e.x - cam.x, e.y - cam.y, e.z - cam.z) - e.r, lim = e.within * reach;
      e.obj.visible = e.obj.visible ? d < lim * 1.1 : d < lim;
    }
  }
  get size(): number { return this.entries.length; }
}
