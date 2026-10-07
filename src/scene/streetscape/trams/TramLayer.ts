/*
 * THE TRAMS IN THE SCENE — the simulation (tramSim.ts) drawn, and ridden.
 *
 * DRAWN
 *   Only near the camera (DRAW_M, scaled for phones and headsets): every class's sections are instanced, so
 *   twenty trams cost what one does in draw calls. Each section of an articulated tram is placed on the
 *   track by its own two ends, so the tram bends on a curve.
 *
 * RIDDEN
 *   A tram calling at a stop has its doors open: clicking one boards it. The rider stands in the aisle at that
 *   door and travels with the tram; the interior is drawn and the windows turn clear for that tram only. At a
 *   stop, E or a click steps off on the tram's left, the platform side on Melbourne's left-running track. A
 *   tram that leaves the model sets its rider down beside it.
 */
import { Group, InstancedMesh, Matrix4, Mesh, Quaternion, Vector3, type Material } from 'three';
import type { Phase } from '../signalPlan';
import { disposeKits, kitFor, type TramKit } from './tramModel';
import type { ClassKey } from './tramClasses';
import { TramSim, type DayKey, type Tram, type TramsDoc } from './tramSim';
import { ride } from './ride';

const RAIL_Z = 0.042;
const DRAW_M = 320;
const PER_CLASS = 18;
const EYE_M = 1.7;

interface ClassMeshes { kit: TramKit; meshes: { mesh: InstancedMesh; section: number }[] }

export class TramLayer {
  readonly group = new Group();
  readonly sim: TramSim;
  private classes = new Map<ClassKey, ClassMeshes>();
  private riding: { tram: Tram; door: number; group: Group } | null = null;
  private m = new Matrix4(); private q = new Quaternion(); private v = new Vector3(); private one = new Vector3(1, 1, 1); private z = new Vector3(0, 0, 1);

  constructor(doc: TramsDoc, day: DayKey, time: number, phase: (site: number, t: number) => Phase, before?: { doc: TramsDoc; day: DayKey }) {
    this.group.name = 'trams';
    this.sim = new TramSim(doc, day, time, phase, before);
    this.sim.onLeave = (t) => { if (this.riding?.tram === t) this.stepOff(); };
  }

  private meshesFor(key: ClassKey): ClassMeshes {
    let c = this.classes.get(key);
    if (!c) {
      const kit = kitFor(key), meshes: ClassMeshes['meshes'] = [];
      kit.sections.forEach((sec, i) => { for (const p of sec.outside) {
        const mesh = new InstancedMesh(p.geo, p.mat, PER_CLASS); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = false; mesh.raycast = () => undefined;
        this.group.add(mesh); meshes.push({ mesh, section: i });
      } });
      c = { kit, meshes }; this.classes.set(key, c);
    }
    return c;
  }

  /** The matrix of section `i` of tram `t` (east, north, up). */
  private sectionMatrix(t: Tram, kit: TramKit, i: number, out: Matrix4): Matrix4 {
    const sec = kit.sections[i], centre = t.s - (kit.cls.L / 2 - sec.centre);
    const a = t.path.at(centre - sec.len / 2), b = t.path.at(centre + sec.len / 2);
    this.q.setFromAxisAngle(this.z, Math.atan2(b[1] - a[1], b[0] - a[0]));
    return out.compose(this.v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, RAIL_Z), this.q, this.one);
  }

  /**
   * @param cam the camera (east, north, up) in the streetscape's frame
   * @param reach the device's distance scale (lod.ts)
   */
  update(dt: number, cam: Vector3, reach: number): void {
    this.sim.step(Math.min(dt, 0.25));
    // nearest first, per class, up to PER_CLASS each
    const lim = DRAW_M * reach, near = new Map<ClassKey, Tram[]>();
    for (const t of this.sim.trams) {
      if (t === this.riding?.tram) continue;
      const mid = t.body[t.body.length >> 1];
      if (Math.hypot(mid[0] - cam.x, mid[1] - cam.y, cam.z) > lim + t.L) continue;
      const list = near.get(t.trip.cls) ?? []; list.push(t); near.set(t.trip.cls, list);
    }
    for (const [key, c] of this.classes) if (!near.has(key)) for (const { mesh } of c.meshes) mesh.count = 0;
    for (const [key, list] of near) {
      const c = this.meshesFor(key);
      list.sort((a, b) => Math.hypot(a.body[0][0] - cam.x, a.body[0][1] - cam.y) - Math.hypot(b.body[0][0] - cam.x, b.body[0][1] - cam.y));
      const n = Math.min(PER_CLASS, list.length);
      for (const { mesh, section } of c.meshes) {
        for (let k = 0; k < n; k++) mesh.setMatrixAt(k, this.sectionMatrix(list[k], c.kit, section, this.m));
        mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.follow();
    this.report(cam);
  }

  // ── riding ──────────────────────────────────────────────────────────────
  private doorPoint(t: Tram, door: number, side: number): [number, number, number] {
    const kit = kitFor(t.trip.cls), d = kit.doors[door], s = t.s - (kit.cls.L / 2 - d.x);
    const p = t.path.at(s), dir = t.path.dir(s), off = side * (kit.cls.W / 2 + 0.05);
    return [p[0] - dir[1] * off, p[1] + dir[0] * off, RAIL_Z + kit.cls.floor + 1.0];
  }

  /** A tram at a stop with a door within reach of the camera ray. */
  private doorUnder(cam: Vector3, dir: Vector3): { tram: Tram; door: number } | null {
    let best: { tram: Tram; door: number; d: number } | null = null;
    for (const t of this.sim.trams) {
      if (!t.calling || Math.hypot(t.body[0][0] - cam.x, t.body[0][1] - cam.y) > t.L + 15) continue;
      const kit = kitFor(t.trip.cls);
      kit.doors.forEach((_, i) => { for (const side of [1, -1]) {
        const [x, y, z] = this.doorPoint(t, i, side), rx = x - cam.x, ry = y - cam.y, rz = z - cam.z, along = rx * dir.x + ry * dir.y + rz * dir.z;
        if (along < 0 || along > 12) continue;
        const off = Math.hypot(rx - dir.x * along, ry - dir.y * along, rz - dir.z * along);
        if (off < 1.0 && (!best || along < best.d)) best = { tram: t, door: i, d: along };
      } });
    }
    return best;
  }

  /** A click while walking (cam and dir in the streetscape's frame): board, or step off. */
  click(cam: Vector3, dir: Vector3): boolean {
    if (this.riding) { if (this.riding.tram.calling) { this.stepOff(); return true; } return false; }
    const hit = this.doorUnder(cam, dir); if (!hit) return false;
    this.board(hit.tram, hit.door); return true;
  }
  key(code: string): void { if (code === 'KeyE' && this.riding?.tram.calling) this.stepOff(); }

  private board(t: Tram, door: number): void {
    const kit = kitFor(t.trip.cls), g = new Group(); g.name = 'ridden-tram';
    // see-through windows for this tram only
    const glass = (kit.glass as Material).clone() as Material & { transparent: boolean; opacity: number; depthWrite: boolean };
    glass.transparent = true; glass.opacity = 0.12; glass.depthWrite = false;
    kit.sections.forEach((sec, i) => {
      const sg = new Group(); sg.userData.section = i;
      for (const p of sec.outside) sg.add(new Mesh(p.geo, p.mat === kit.glass ? glass : p.mat));
      for (const p of sec.inside) sg.add(new Mesh(p.geo, p.mat));
      sg.traverse((o) => { (o as Mesh).raycast = () => undefined; });
      g.add(sg);
    });
    this.group.add(g);
    this.riding = { tram: t, door, group: g };
    ride.active = true; this.follow();
  }

  private stepOff(): void {
    const r = this.riding; if (!r) return;
    const [x, y] = this.doorPoint(r.tram, r.door, 1), dir = r.tram.path.dir(r.tram.s);
    ride.stepOff = [x - dir[1] * 1.0, y + dir[0] * 1.0];
    ride.active = false;
    this.group.remove(r.group);
    r.group.traverse((o) => { const m = o as Mesh; if (m.isMesh && (m.material as Material).transparent) (m.material as Material).dispose(); });
    this.riding = null;
  }

  private follow(): void {
    const r = this.riding; if (!r) return;
    const kit = kitFor(r.tram.trip.cls);
    for (const sg of r.group.children) { this.sectionMatrix(r.tram, kit, sg.userData.section as number, this.m); this.m.decompose(sg.position, sg.quaternion, sg.scale); }
    const d = kit.doors[r.door], s = r.tram.s - (kit.cls.L / 2 - d.x), p = r.tram.path.at(s), dir = r.tram.path.dir(s);
    ride.eye = [p[0], p[1], RAIL_Z + kit.cls.floor + EYE_M];
    ride.heading = Math.atan2(dir[1], dir[0]);
  }

  private report(cam: Vector3): void {
    const r = this.riding;
    if (r) {
      // the stop after this one while calling here: "to" is where it goes next
      const t = r.tram, call = t.trip.stops[t.next + (t.calling ? 1 : 0)], name = call ? t.path.stops[call[0]][1] : '';
      ride.setStatus({ riding: true, canBoard: false, canAlight: t.calling, route: t.trip.route, next: name });
      return;
    }
    const canBoard = this.sim.trams.some((t) => t.calling && Math.hypot(t.body[t.body.length >> 1][0] - cam.x, t.body[t.body.length >> 1][1] - cam.y) < t.L / 2 + 8);
    ride.setStatus({ riding: false, canBoard, canAlight: false, route: '', next: '' });
  }

  dispose(): void {
    if (this.riding) this.stepOff();
    ride.reset();
    for (const c of this.classes.values()) for (const { mesh } of c.meshes) mesh.dispose();
    this.classes.clear();
    this.group.clear();
    disposeKits();   // the models too: nothing draws a tram until the next walk
  }
}
