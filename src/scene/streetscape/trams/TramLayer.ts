/*
 * THE TRAMS IN THE SCENE — the simulation (tramSim.ts) drawn, and ridden.
 *
 * DRAWN
 *   Only near the camera (DRAW_M, scaled for phones and headsets): every class's sections are instanced, so
 *   twenty trams cost what one does in draw calls. Each section of an articulated tram is placed on the
 *   track by its own two ends, so the tram bends on a curve.
 *
 * RIDDEN
 *   A tram calling at a stop has its doors open: a door under the centre of the view lights up and asks to be
 *   boarded, and a click boards it. The rider stands inside that door and travels with the tram; the interior
 *   is drawn and the windows turn clear for that tram only. Inside, the walking keys move the rider about the
 *   saloon (kept off the walls, the cabs and the seats), and a seat under the view lights up the same way: a
 *   click sits on it, a walking key stands up again (seats on a desktop only: a phone's tap and a headset's laser
 *   take doors, as neither can walk inside). At a stop, a door under the view offers the way off, and
 *   E or a click on it steps off on the tram's left, the platform side on Melbourne's left-running track. A
 *   tram that leaves the model sets its rider down beside it; when the layer goes (a new day or time), the rider
 *   stays where they were.
 *
 * SOLID
 *   Every section near the walker is handed to the street view as a box (ride.blockers), which keeps the
 *   walker out of it as it does out of walls: a tram that comes at someone standing on the track pushes them
 *   aside rather than passing through them.
 */
import { BoxGeometry, CanvasTexture, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type Material } from 'three';
import type { Phase } from '../signalPlan';
import { disposeKits, kitFor, type TramKit } from './tramModel';
import type { ClassKey } from './tramClasses';
import { TramSim, type DayKey, type Tram, type TramsDoc } from './tramSim';
import { ride } from './ride';

const RAIL_Z = 0.042;
const DRAW_M = 320;
const PER_CLASS = 18;
const EYE_M = 1.7;
/*
 * The simulation's step, seconds: 15 a second, whatever the display runs at. Each step checks every tram
 * against every other (tramSim.ts), and at the headset's 72 a second that was about a seventh of a frame in
 * the street (2026-10-14). The trams are drawn between the last two steps, so they still move smoothly; the
 * picture runs one step (67 ms) behind the simulation, which nobody can see in a tram.
 */
const SIM_DT = 1 / 15;
const STEP_REACH_M = 2;
/** Trams nearer than this to the walker are solid (ride.blockers). */
const BLOCK_M = 60;
/** Inside: how far the rider's middle is kept from a seat's edge (a seat is 0.46 m square), the walls, and the cab ends. */
const SEAT_GAP_M = 0.15, WALL_GAP_M = 0.34, CAB_M = 1.9;
/** A seated eye above the cushion, and how far away a seat can be picked. */
const SEATED_EYE_M = 0.72, SEAT_REACH_M = 3.5;
/*
 * The headset's label over a door its laser is on: what the trigger does there, since a light alone does not
 * say it (2026-10-16). The desktop says it in the page (TramAim). White on near-black (L* 100 on about 7), so
 * it reads by lightness alone; 0.9 m wide, a hand's width of view at three metres.
 */
const LABEL_W_M = 0.9, LABEL_H_M = 0.34;
const LABELS = { board: ['Board this tram?', 'Pull the trigger'], alight: ['Get off here?', 'Pull the trigger'] } as const;
function labelTexture([title, how]: readonly [string, string]): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round((512 * LABEL_H_M) / LABEL_W_M);
  const g = c.getContext('2d'); if (!g) return null;
  g.fillStyle = '#121212'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 28); g.fill();
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '600 50px system-ui, sans-serif'; g.fillText(title, c.width / 2, c.height * 0.38);
  g.font = '400 36px system-ui, sans-serif'; g.fillText(how, c.width / 2, c.height * 0.74);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; return tex;
}

interface ClassMeshes { kit: TramKit; meshes: { mesh: InstancedMesh; section: number }[] }
/** What the centre of the view (or a tap, or a laser) is on. */
type Aim = { kind: 'board' | 'alight'; tram: Tram; door: number; side: number; d: number } | { kind: 'seat'; tram: Tram; seat: number; d: number };

export class TramLayer {
  readonly group = new Group();
  readonly sim: TramSim;
  private classes = new Map<ClassKey, ClassMeshes>();
  /** The tram being ridden: where in it the rider is (along from its middle, across, + left) and the seat sat on. */
  private riding: { tram: Tram; door: number; group: Group; glass: Material; x: number; y: number; seat: number | null } | null = null;
  private aim: Aim | null = null;
  /** The light over what is aimed at: a door or a seat. */
  private glow = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false }));
  private look = new Vector3(1, 0, 0);
  /** The headset's label (LABELS), one picture per kind, made on first use; shown over a door the laser is on. */
  private label = new Mesh(new PlaneGeometry(LABEL_W_M, LABEL_H_M), new MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
  private labelTex: Partial<Record<keyof typeof LABELS, CanvasTexture | null>> = {};
  private basis = new Matrix4(); private bx = new Vector3(); private by = new Vector3(); private bz = new Vector3();
  /** Seconds of the display not yet simulated, and where each tram's front was before the last step. */
  private owed = 0;
  private before = new Map<Tram, number>();
  private m = new Matrix4(); private q = new Quaternion(); private v = new Vector3(); private one = new Vector3(1, 1, 1); private z = new Vector3(0, 0, 1);

  constructor(doc: TramsDoc, day: DayKey, time: number, phase: (site: number, t: number) => Phase, before?: { doc: TramsDoc; day: DayKey }) {
    this.group.name = 'trams';
    this.sim = new TramSim(doc, day, time, phase, before);
    this.sim.onLeave = (t) => { if (this.riding?.tram === t) this.stepOff(); };
    this.glow.visible = false; this.glow.raycast = () => undefined; this.glow.renderOrder = 2; this.group.add(this.glow);
    this.label.visible = false; this.label.raycast = () => undefined; this.label.renderOrder = 3; this.group.add(this.label);
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

  /** Where tram `t` is drawn: between where its front was before the last step and where it is now. */
  private shownS(t: Tram): number {
    const was = this.before.get(t);
    // Further than a step can carry a tram (40 km/h for 1/15 s is under a metre) means the simulation was run on
    // without drawing — the warm-up (Streetscape) — and the old place is stale: drawn where it is now.
    if (was === undefined || Math.abs(t.s - was) > STEP_REACH_M) return t.s;
    return was + (t.s - was) * Math.min(1, this.owed / SIM_DT);
  }

  /** The matrix of section `i` of tram `t` (east, north, up). */
  private sectionMatrix(t: Tram, kit: TramKit, i: number, out: Matrix4): Matrix4 {
    const sec = kit.sections[i], centre = this.shownS(t) - (kit.cls.L / 2 - sec.centre);
    const a = t.path.at(centre - sec.len / 2), b = t.path.at(centre + sec.len / 2);
    this.q.setFromAxisAngle(this.z, Math.atan2(b[1] - a[1], b[0] - a[0]));
    return out.compose(this.v.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, RAIL_Z), this.q, this.one);
  }

  /**
   * @param cam the camera (east, north, up) in the streetscape's frame
   * @param reach the device's distance scale (lod.ts)
   * @param look the camera's direction in the same frame, for what the centre of the view is on
   * @param pointer in a headset, the laser (from, unit direction) in the same frame: what it is on is aimed
   *   at instead, doors only (the trigger takes no seat), with a label saying what the trigger does
   */
  update(dt: number, cam: Vector3, reach: number, look?: Vector3, pointer?: { from: Vector3; dir: Vector3 }): void {
    this.owed += Math.min(dt, 0.25);
    while (this.owed >= SIM_DT) {
      this.before = new Map(this.sim.trams.map((t) => [t, t.s]));
      this.sim.step(SIM_DT);
      this.owed -= SIM_DT;
    }
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
    this.walkInside();
    this.follow();
    this.solid(cam);
    if (look) this.look.copy(look);
    this.aim = pointer ? this.aimed(pointer.from, pointer.dir, false) : this.aimed(cam, this.look);
    this.light();
    this.labelFor(pointer ? cam : null);
    this.report(cam);
  }

  /** The sections near the walker as boxes, for the street view to keep the walker out of (ride.ts). */
  private solid(cam: Vector3): void {
    const out = ride.blockers; let n = 0;
    for (const t of this.sim.trams) {
      if (t === this.riding?.tram) continue;
      const mid = t.body[t.body.length >> 1];
      if (Math.hypot(mid[0] - cam.x, mid[1] - cam.y) > BLOCK_M + t.L / 2) continue;
      const kit = kitFor(t.trip.cls), front = this.shownS(t);
      for (const sec of kit.sections) {
        const c = front - (kit.cls.L / 2 - sec.centre), a = t.path.at(c - sec.len / 2), b = t.path.at(c + sec.len / 2);
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), k = n * 6;
        out[k] = (a[0] + b[0]) / 2; out[k + 1] = (a[1] + b[1]) / 2; out[k + 2] = Math.cos(ang); out[k + 3] = Math.sin(ang);
        out[k + 4] = sec.len / 2; out[k + 5] = kit.cls.W / 2; n++;
      }
    }
    ride.blockerCount = n;
  }

  // ── riding ──────────────────────────────────────────────────────────────
  /** A point of tram `t` (x along from its middle, y across, + left, z above the rail) where it is drawn now. */
  /**
   * Where a point of tram `t` is drawn (x along from its middle, y across, + left, z up from the rail), and
   * (`dir`) which way the body runs there. On the section the point is in, placed as that section is drawn
   * (sectionMatrix: straight between its two ends): on a curve the body cuts inside the track's curve, and a
   * point put on the curve itself was off the body — a door's light beside the door, a rider by the wall
   * (seen in a headset at a stop on a curve, 2026-10-16).
   */
  private pointOf(t: Tram, x: number, y: number, z: number, dir?: [number, number]): [number, number, number] {
    const kit = kitFor(t.trip.cls);
    let sec = kit.sections[0];
    for (const c of kit.sections) if (Math.abs(x - c.centre) - c.len / 2 < Math.abs(x - sec.centre) - sec.len / 2) sec = c;
    const centre = this.shownS(t) - (kit.cls.L / 2 - sec.centre), a = t.path.at(centre - sec.len / 2), b = t.path.at(centre + sec.len / 2);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, c = (b[0] - a[0]) / len, sn = (b[1] - a[1]) / len, u = x - sec.centre;
    if (dir) { dir[0] = c; dir[1] = sn; }
    return [(a[0] + b[0]) / 2 + u * c - y * sn, (a[1] + b[1]) / 2 + u * sn + y * c, RAIL_Z + z];
  }
  private dir: [number, number] = [1, 0];

  private doorPoint(t: Tram, door: number, side: number): [number, number, number] {
    const kit = kitFor(t.trip.cls), d = kit.doors[door];
    return this.pointOf(t, d.x, side * (kit.cls.W / 2 + 0.05), kit.cls.floor + 1.0);
  }

  /** A tram at a stop with a door within reach of the camera ray (only `only`, when given). */
  private doorUnder(cam: Vector3, dir: Vector3, only?: Tram): { tram: Tram; door: number; side: number; d: number } | null {
    let best: { tram: Tram; door: number; side: number; d: number } | null = null;
    for (const t of only ? [only] : this.sim.trams) {
      if (!t.calling || Math.hypot(t.body[0][0] - cam.x, t.body[0][1] - cam.y) > t.L + 15) continue;
      const kit = kitFor(t.trip.cls);
      kit.doors.forEach((_, i) => { for (const side of [1, -1]) {
        const [x, y, z] = this.doorPoint(t, i, side), rx = x - cam.x, ry = y - cam.y, rz = z - cam.z, along = rx * dir.x + ry * dir.y + rz * dir.z;
        if (along < 0 || along > 12) continue;
        const off = Math.hypot(rx - dir.x * along, ry - dir.y * along, rz - dir.z * along);
        if (off < 1.0 && (!best || along < best.d)) best = { tram: t, door: i, side, d: along };
      } });
    }
    return best;
  }

  /** A seat of the ridden tram within reach of the camera ray, not the one sat on. */
  private seatUnder(cam: Vector3, dir: Vector3): { seat: number; d: number } | null {
    const r = this.riding; if (!r) return null;
    const kit = kitFor(r.tram.trip.cls); let best: { seat: number; d: number } | null = null;
    kit.seats.forEach((st, i) => {
      if (i === r.seat) return;
      const [x, y, z] = this.pointOf(r.tram, st.x, st.y, st.z + 0.15), rx = x - cam.x, ry = y - cam.y, rz = z - cam.z, along = rx * dir.x + ry * dir.y + rz * dir.z;
      if (along < 0.3 || along > SEAT_REACH_M) return;
      const off = Math.hypot(rx - dir.x * along, ry - dir.y * along, rz - dir.z * along);
      if (off < 0.32 && (!best || along < best.d)) best = { seat: i, d: along };
    });
    return best;
  }

  /** What a ray from the eye (or a laser) is on: a door to board by, a door to get off by, or (`seats`) a seat. */
  private aimed(cam: Vector3, dir: Vector3, seats = true): Aim | null {
    const r = this.riding;
    if (!r) { const d = this.doorUnder(cam, dir); return d ? { kind: 'board', ...d } : null; }
    const seat = seats ? this.seatUnder(cam, dir) : null, door = this.doorUnder(cam, dir, r.tram);
    if (door && (!seat || door.d < seat.d)) return { kind: 'alight', ...door };
    return seat ? { kind: 'seat', tram: r.tram, ...seat } : null;
  }

  /** The light over the door or seat aimed at. */
  private light(): void {
    const a = this.aim, g = this.glow;
    if (!a) { g.visible = false; return; }
    const kit = kitFor(a.tram.trip.cls), C = kit.cls;
    if (a.kind === 'seat') {
      const st = kit.seats[a.seat], dir = this.dir;
      g.position.fromArray(this.pointOf(a.tram, st.x, st.y, st.z + 0.04, dir)); g.scale.set(0.5, 0.5, 0.08);
      g.rotation.set(0, 0, Math.atan2(dir[1], dir[0]));
    } else {
      const d = kit.doors[a.door], dir = this.dir, h = Math.max(1.9, C.H - 0.5 - C.floor);
      g.position.fromArray(this.pointOf(a.tram, d.x, a.side * (C.W / 2 + 0.02), C.floor + h / 2, dir)); g.scale.set(d.w, 0.1, h);
      g.rotation.set(0, 0, Math.atan2(dir[1], dir[0]));
    }
    g.visible = true;
  }

  /** The headset's label over the door aimed at, turned to face `eye`; hidden without an eye or a door. */
  private labelFor(eye: Vector3 | null): void {
    const a = this.aim, lb = this.label;
    if (!eye || !a || a.kind === 'seat') { lb.visible = false; return; }
    const tex = a.kind in this.labelTex ? this.labelTex[a.kind] : (this.labelTex[a.kind] = labelTexture(LABELS[a.kind]));
    if (!tex) { lb.visible = false; return; }
    const mat = lb.material as MeshBasicMaterial; if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
    // over the light, a little out from the side the door is on
    const kit = kitFor(a.tram.trip.cls), C = kit.cls, d = kit.doors[a.door], h = Math.max(1.9, C.H - 0.5 - C.floor);
    lb.position.fromArray(this.pointOf(a.tram, d.x, a.side * (C.W / 2 + 0.25), C.floor + h + 0.3));
    // upright (+y up), its face (+z) turned level towards the eye
    this.bz.set(eye.x - lb.position.x, eye.y - lb.position.y, 0); if (this.bz.lengthSq() < 1e-6) this.bz.set(1, 0, 0); this.bz.normalize();
    this.by.set(0, 0, 1); this.bx.crossVectors(this.by, this.bz);
    lb.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.bx, this.by, this.bz));
    lb.visible = true;
  }

  /**
   * A click while walking (cam and dir in the streetscape's frame): board, sit, or step off — by what the ray is
   * on. `seats` false for a phone's tap and a headset's laser: they have no way to stand up again (walking
   * inside is a desktop's keys), so a seat there is not taken.
   */
  click(cam: Vector3, dir: Vector3, seats = true): boolean {
    const a = this.aimed(cam, dir); if (!a || (a.kind === 'seat' && !seats)) return false;
    if (a.kind === 'board') this.board(a.tram, a.door, a.side);
    else if (a.kind === 'seat') this.sit(a.seat);
    else this.stepOff();
    return true;
  }
  key(code: string): void { if (code === 'KeyE' && this.riding?.tram.calling) this.stepOff(); }

  private board(t: Tram, door: number, side = 1): void {
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
    // just inside the door it came in by
    this.riding = { tram: t, door, group: g, glass, x: kit.doors[door].x, y: side * (kit.cls.W / 2 - 0.09 - WALL_GAP_M - 0.05), seat: null };
    ride.active = true; this.follow();
  }

  private sit(seat: number): void {
    const r = this.riding; if (!r) return;
    const st = kitFor(r.tram.trip.cls).seats[seat], dir = this.dir; this.pointOf(r.tram, st.x, st.y, 0, dir);
    r.seat = seat; r.x = st.x; r.y = st.y;
    ride.look = Math.atan2(dir[1], dir[0]) + (st.face > 0 ? 0 : Math.PI);
  }

  /** Room to stand at (x, y) inside the ridden tram: off the walls, out of the cabs, and (`seats`) off the seats. */
  private roomAt(kit: TramKit, x: number, y: number, seats = true): boolean {
    const C = kit.cls;
    if (Math.abs(x) > C.L / 2 - CAB_M || Math.abs(y) > C.W / 2 - 0.09 - WALL_GAP_M) return false;
    if (seats) for (const st of kit.seats) if (Math.abs(x - st.x) < 0.23 + SEAT_GAP_M && Math.abs(y - st.y) < 0.23 + SEAT_GAP_M) return false;
    return true;
  }

  /** The walking keys inside (ride.move, east/north): along and across the tram, kept in the room; a step stands up. */
  private walkInside(): void {
    const r = this.riding, m = ride.move; ride.move = null;
    if (!r || !m) return;
    const kit = kitFor(r.tram.trip.cls), dir = this.dir; this.pointOf(r.tram, r.x, r.y, 0, dir);
    if (r.seat !== null) { r.seat = null; if (this.roomAt(kit, r.x, 0)) r.y = 0; return; }   // up into the aisle
    const along = m[0] * dir[0] + m[1] * dir[1], across = -m[0] * dir[1] + m[1] * dir[0];
    // standing where there is no room (up from a seat with no aisle beside it): the seats do not hold it there
    const seats = this.roomAt(kit, r.x, r.y);
    if (this.roomAt(kit, r.x + along, r.y + across, seats)) { r.x += along; r.y += across; }
    else if (this.roomAt(kit, r.x + along, r.y, seats)) r.x += along;
    else if (this.roomAt(kit, r.x, r.y + across, seats)) r.y += across;
  }

  private stepOff(): void {
    const r = this.riding; if (!r) return;
    // by the door aimed at, or the one boarded by, on the platform side
    const door = this.aim?.kind === 'alight' ? this.aim.door : r.door;
    const d = kitFor(r.tram.trip.cls).doors[door], dir = this.dir;
    const [x, y] = this.pointOf(r.tram, d.x, kitFor(r.tram.trip.cls).cls.W / 2 + 0.05, 0, dir);
    ride.stepOff = [x - dir[1] * 1.0, y + dir[0] * 1.0];
    ride.active = false;
    this.group.remove(r.group);
    r.glass.dispose();   // the rest is the kit's, still drawn on the other trams
    this.riding = null;
  }

  private follow(): void {
    const r = this.riding; if (!r) return;
    const kit = kitFor(r.tram.trip.cls);
    for (const sg of r.group.children) { this.sectionMatrix(r.tram, kit, sg.userData.section as number, this.m); this.m.decompose(sg.position, sg.quaternion, sg.scale); }
    // where the tram is drawn, not where the simulation has it, so the rider and the tram move together
    const st = r.seat !== null ? kit.seats[r.seat] : null;
    const dir = this.dir;
    ride.eye = this.pointOf(r.tram, r.x, r.y, st ? st.z + SEATED_EYE_M : kit.cls.floor + EYE_M, dir);
    ride.heading = Math.atan2(dir[1], dir[0]);
  }

  private report(cam: Vector3): void {
    const r = this.riding;
    if (r) {
      // the stop after this one while calling here: "to" is where it goes next
      const t = r.tram, call = t.trip.stops[t.next + (t.calling ? 1 : 0)], name = call ? t.path.stops[call[0]][1] : '';
      ride.setStatus({ riding: true, canBoard: false, canAlight: t.calling, route: t.trip.route, next: name, aim: this.aim?.kind ?? '', seated: r.seat !== null });
      return;
    }
    const canBoard = this.sim.trams.some((t) => t.calling && Math.hypot(t.body[t.body.length >> 1][0] - cam.x, t.body[t.body.length >> 1][1] - cam.y) < t.L / 2 + 8);
    ride.setStatus({ riding: false, canBoard, canAlight: false, route: '', next: '', aim: this.aim?.kind ?? '', seated: false });
  }

  dispose(): void {
    /*
     * The ride ends where the rider is: the step-off point is cleared with the rest of the ride, since the
     * street view may be going too, and a point kept for the next walk would move the walker there.
     */
    if (this.riding) this.stepOff();
    ride.reset();
    for (const c of this.classes.values()) for (const { mesh } of c.meshes) mesh.dispose();
    this.classes.clear();
    this.glow.geometry.dispose(); (this.glow.material as Material).dispose();
    this.label.geometry.dispose(); (this.label.material as Material).dispose();
    for (const tex of Object.values(this.labelTex)) tex?.dispose();
    this.group.clear();
    disposeKits();   // the models too: nothing draws a tram until the next walk
  }
}
