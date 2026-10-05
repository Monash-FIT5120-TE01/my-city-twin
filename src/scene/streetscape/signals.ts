/*
 * TRAFFIC SIGNALS — posts, lanterns, pedestrian lanterns, push buttons, crossing and stop lines.
 *
 * Sites are real (DTP "Victorian Traffic Signals"); the posts are put on the kerb corners round each site,
 * and the lanterns follow the DTP standard drawings (posts and lanterns are EST in position):
 *   TC-1116  2B pedestal: 114 mm post, 4100 long, cap to 4410; 200 mm three-aspect lanterns bracket-mounted
 *            at 3200-4060; pedestrian lantern 2350-2930; push button at 1000.
 *   TC-1115  roles per approach (left-hand traffic): Primary near-left, Secondary far-right, Tertiary far-left.
 *   TCS 038  visors: Primary type 1 (open cut-away), Secondary/Tertiary type 3 (closed).
 * Push button: PB/5-type audio-tactile unit (black escutcheon, blue disc with white arrow and a raised tactile
 * arrow, white lamp, round stainless button). Its sounds are in pedestrianAudio.ts.
 *
 * The cycle is visual only and the same pattern everywhere, offset per site (timings EST): road A green 18 s,
 * amber 3, all red 2, road B green 18, amber 3, all red 2. Pedestrians cross the road that has red.
 */
import {
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { Batch, MAT, TALL_CELL_M, UNIT_BOX, UNIT_CYL, at, boxAt, canvasTexture, quiet, shared, slice, type XY } from './kit';
import { DIST, compactEach, type CompactGroup } from './lod';

export interface SignalsDoc {
  sites: { id: string; name: string; type: string; p: XY; corners: { pt: XY; items: [string, number, string, number][]; ped: [number, string][] }[] }[];
  /** [x, y, yaw, length, width] painted lines */
  marks: [number, number, number, number, number][];
}

export const CYCLE_S = 46;
/** 2 green, 1 amber, 0 red, for road A and B, and which road pedestrians may cross. */
export function phaseAt(t: number): { A: number; B: number; walk: 'A' | 'B' | null } {
  const x = ((t % CYCLE_S) + CYCLE_S) % CYCLE_S;
  if (x < 18) return { A: 2, B: 0, walk: 'B' };
  if (x < 21) return { A: 1, B: 0, walk: null };
  if (x < 23) return { A: 0, B: 0, walk: null };
  if (x < 41) return { A: 0, B: 2, walk: 'A' };
  if (x < 44) return { A: 0, B: 1, walk: null };
  return { A: 0, B: 0, walk: null };
}

const FOOTWAY = 0.14;
const local = (x: number, y: number, yaw: number, u: number, v: number): XY => [x + Math.cos(yaw) * u - Math.sin(yaw) * v, y + Math.sin(yaw) * u + Math.cos(yaw) * v];
/** A disc / plane facing local +x (the direction the lantern faces). */
const DISC = (() => { const g = new CircleGeometry(1, 12); g.rotateY(Math.PI / 2); return shared(g); })();
// faces +x, picture upright (+z) and reading left to right (+y) from in front; turned about y it lay on its side
const FACE = (() => { const g = new PlaneGeometry(1, 1); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); return shared(g); })();
function visorGeo(arc: number): BufferGeometry {   // open hood along +x, open part at the bottom (arc centred on top)
  const g = new CylinderGeometry(0.11, 0.11, 0.2, 14, 1, true, -arc / 2, arc); g.rotateZ(-Math.PI / 2); g.translate(0.1, 0, 0); return shared(g);
}
const VISOR1 = visorGeo(Math.PI * 1.25), VISOR3 = visorGeo(Math.PI * 1.85);
// PB/5 push button parts. The disc's texture is drawn upright: turn the disc so +y of the canvas is up (+z).
const PB_DISC = (() => { const g = new CircleGeometry(0.046, 28); g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2); return shared(g); })();
const PB_TIP = (() => { const g = new ConeGeometry(0.012, 0.018, 3); g.rotateX(Math.PI / 2); return shared(g); })();   // points up
const PB_BTN = (() => { const g = new CylinderGeometry(0.021, 0.021, 0.014, 20); g.rotateZ(-Math.PI / 2); return shared(g); })();   // faces out (+x)

interface Lamp { site: number; road: string; aspect: number }

export class SignalSystem {
  readonly group = new Group();
  /** Crossing and stop lines, drawn within DIST.tiny (register with the LodSet). */
  marks!: CompactGroup;
  /** Push buttons: position (local east/north/up), site index and which road they cross. */
  readonly buttons: { pos: Vector3; site: number; crosses: string }[] = [];
  private offsets: number[] = [];
  private lamps: { mesh: InstancedMesh; list: Lamp[]; on: Color[] } [] = [];
  private peds: { top: InstancedMesh; bot: InstancedMesh; list: { site: number; crosses: string }[] } | null = null;
  private trams: { mesh: InstancedMesh; list: { site: number; road: string }[] } | null = null;
  private btnLamps: InstancedMesh | null = null;
  private lastKey = '';

  /** Builds the posts, heads and lamps (in slices, see kit.ts). */
  async build(doc: SignalsDoc): Promise<this> {
    this.group.name = 'signals';
    this.offsets = doc.sites.map((s) => (parseInt(s.id, 10) * 7.3) % CYCLE_S);
    const near = new Batch(), mid = new Batch(TALL_CELL_M);
    const put = (b: Batch, geo: BufferGeometry, mat: Material, x: number, y: number, z: number, yaw: number, u: number, v: number, sx = 1, sy = 1, sz = 1) => {
      const [px, py] = local(x, y, yaw, u, v); b.add(geo, mat, at(px, py, z, yaw, sx, sy, sz));
    };
    const red: Lamp[] = [], amber: Lamp[] = [], green: Lamp[] = [], redM: [number, number, number, number][] = [], ambM: typeof redM = [], grnM: typeof redM = [];
    const pedList: { site: number; crosses: string }[] = [], pedM: [number, number, number, number][] = [];
    const tramList: { site: number; road: string }[] = [], tramM: [number, number, number, number][] = [];
    const btnM: [number, number, number, number][] = [];
    const pbDisc = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.2, map: canvasTexture(128, 128, (g) => {
      g.fillStyle = '#2a3fb0'; g.beginPath(); g.arc(64, 64, 64, 0, 7); g.fill(); g.fillStyle = '#e9ecef';
      g.beginPath(); g.moveTo(64, 14); g.lineTo(104, 54); g.lineTo(104, 74); g.lineTo(76, 48); g.lineTo(76, 120); g.lineTo(52, 120); g.lineTo(52, 48); g.lineTo(24, 74); g.lineTo(24, 54); g.closePath(); g.fill();
    }) });

    for (const [si, site] of doc.sites.entries()) {
      await slice();
      for (const c of site.corners) {
        const [x, y] = c.pt, z0 = FOOTWAY;
        // 2B pedestal: post, upper 4-way bracket, finial cap, lower bracket (mid band: seen from further)
        mid.add(UNIT_CYL, MAT.signal, at(x, y, z0, 0, 0.057, 0.057, 4.1));
        near.add(UNIT_BOX, MAT.signal, boxAt(x, y, z0 + 4.06, 0, 0.17, 0.17, 0.076));
        near.add(UNIT_CYL, MAT.signal, at(x, y, z0 + 4.13, 0, 0.06, 0.06, 0.28));
        near.add(UNIT_BOX, MAT.signal, boxAt(x, y, z0 + 3.155, 0, 0.17, 0.17, 0.05));
        for (const [role, yaw, road, tram] of c.items) {
          const zc = z0 + 3.63;
          put(near, UNIT_BOX, MAT.signal, x, y, zc, yaw, 0.08, 0, 0.12, 0.04, 0.04);                 // bracket
          put(near, UNIT_BOX, MAT.signal, x, y, zc, yaw, 0.2 - 0.095, 0, 0.015, 0.5, 1.02);          // target board
          put(near, UNIT_BOX, MAT.signal, x, y, zc, yaw, 0.2, 0, 0.19, 0.27, 0.86);                  // body
          [0.28, 0, -0.28].forEach((dz, k) => {
            put(near, role === 'P' ? VISOR1 : VISOR3, MAT.visor, x, y, zc + dz, yaw, 0.296, 0);
            const [px, py] = local(x, y, yaw, 0.297, 0);
            (k === 0 ? redM : k === 1 ? ambM : grnM).push([px, py, zc + dz, yaw]);
            (k === 0 ? red : k === 1 ? amber : green).push({ site: si, road, aspect: k }); // top red = 0, amber = 1, bottom green = 2 (as phaseAt)
          });
          if (tram) {   // tram lantern: a white bar, lit with its road's green (EST: tram phases not modelled)
            put(near, UNIT_BOX, MAT.signal, x, y, z0 + 3.0, yaw, 0.2, 0, 0.19, 0.27, 0.3);
            const [px, py] = local(x, y, yaw, 0.297, 0); tramM.push([px, py, z0 + 3.0, yaw]); tramList.push({ site: si, road });
          }
        }
        for (const [yaw, crosses] of c.ped) {
          // pedestrian lantern facing back across the crossing: two square aspects with type 4 hoods
          for (const dz of [0.145, -0.145]) {
            put(near, UNIT_BOX, MAT.signal, x, y, z0 + 2.64 + dz, yaw, 0.17, 0, 0.18, 0.29, 0.28);
            put(near, UNIT_BOX, MAT.signal, x, y, z0 + 2.64 + dz + 0.13, yaw, 0.36, 0, 0.2, 0.28, 0.015);
          }
          const [px, py] = local(x, y, yaw, 0.262, 0); pedM.push([px, py, z0 + 2.64, yaw]); pedList.push({ site: si, crosses });
          // PB/5 push button on the other side of the post, facing the waiting pedestrian
          const by = yaw + Math.PI, bz = z0 + 1.0;
          put(near, UNIT_BOX, MAT.darkGrey, x, y, bz, by, 0.1, 0, 0.07, 0.13, 0.32);
          put(near, UNIT_BOX, MAT.signal, x, y, bz, by, 0.14, 0, 0.012, 0.11, 0.2);
          put(near, PB_DISC, pbDisc, x, y, bz + 0.04, by, 0.147, 0);
          put(near, PB_TIP, MAT.steel, x, y, bz + 0.067, by, 0.149, 0);
          put(near, PB_BTN, MAT.steel, x, y, bz - 0.06, by, 0.152, -0.006);
          const [lx, ly] = local(x, y, by, 0.148, 0.034); btnM.push([lx, ly, bz - 0.035, by]);
          const [bx2, by2] = local(x, y, by, 0.15, 0); this.buttons.push({ pos: new Vector3(bx2, by2, bz), site: si, crosses });
        }
      }
    }
    const nearG = await near.build('signals-near'), midG = await mid.build('signals-mid');
    this.group.add(midG, nearG);

    // dynamic lamps: instanced, unlit, colour set per phase
    const lampMat = new MeshBasicMaterial({ color: '#ffffff' });
    const mk = (geo: BufferGeometry, mat: Material, list: [number, number, number, number][], sx: number, sy: number, sz: number) => {
      const im = new InstancedMesh(geo, mat, Math.max(1, list.length)); list.forEach(([px, py, pz, yaw], i) => im.setMatrixAt(i, at(px, py, pz, yaw, sx, sy, sz)));
      im.count = list.length; im.computeBoundingSphere(); return im;
    };
    for (const [list, mats, on] of [[red, redM, '#ff3b30'], [amber, ambM, '#ffb000'], [green, grnM, '#2ee86b']] as const) {
      const im = mk(DISC, lampMat, mats as unknown as [number, number, number, number][], 0.1, 0.1, 0.1);
      this.lamps.push({ mesh: im, list: list as Lamp[], on: [new Color('#2b2d2f'), new Color(on)] }); nearG.add(im);
    }
    const figure = (walking: boolean) => canvasTexture(64, 64, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 11, 6, 0, 7); g.fill();
      if (walking) { g.fillRect(28, 18, 8, 20); for (const [x0, y0, r, l, w] of [[32, 37, 0.45, 22, 6], [32, 37, -0.45, 22, 6], [32, 21, 0.75, 14, 4], [32, 21, -0.75, 14, 4]]) { g.save(); g.translate(x0, y0); g.rotate(r); g.fillRect(-w / 2, 0, w, l); g.restore(); } }
      else { g.fillRect(27, 18, 10, 23); g.fillRect(27, 40, 4, 19); g.fillRect(33, 40, 4, 19); g.fillRect(22, 19, 4, 17); g.fillRect(38, 19, 4, 17); }
    });
    const top = mk(FACE, new MeshBasicMaterial({ map: figure(false) }), pedM.map(([a, b, z, yw]) => [a, b, z + 0.14, yw]), 0.22, 0.22, 0.22);
    const bot = mk(FACE, new MeshBasicMaterial({ map: figure(true) }), pedM.map(([a, b, z, yw]) => [a, b, z - 0.14, yw]), 0.22, 0.22, 0.22);
    this.peds = { top, bot, list: pedList }; nearG.add(top, bot);
    const tramBar = mk(FACE, lampMat, tramM, 0.045, 0.045, 0.2);
    this.trams = { mesh: tramBar, list: tramList }; nearG.add(tramBar);
    this.btnLamps = mk(DISC, lampMat, btnM, 0.009, 0.009, 0.009); nearG.add(this.btnLamps);
    for (const im of [...this.lamps.map((l) => l.mesh), top, bot, tramBar, this.btnLamps]) im.frustumCulled = true;

    // crossing and stop lines (positions inferred)
    this.marks = compactEach('signal-marks', UNIT_BOX, MAT.paint, doc.marks, (i) => { const [x, y, yaw, L, W] = doc.marks[i]; return boxAt(x, y, 0.025, yaw, L, W, 0.006); }, DIST.tiny);
    this.group.add(this.marks.parts[0][0].mesh);
    // lamps, figures and button lights: whole-city instanced meshes, too small to see from height
    for (const im of [...this.lamps.map((l) => l.mesh), top, bot, tramBar, this.btnLamps]) im.userData.lowOnly = true;
    quiet(this.group);
    this.update(0);   // creates the instance colours before the first frame
    return this;
  }

  /** Phase of one site at time t (s). */
  phase(site: number, t: number) { return phaseAt(t + this.offsets[site]); }

  /** Recolour the lamps; cheap when nothing changed (checked once per whole second). */
  update(t: number): void {
    const key = String(Math.floor(t));
    if (key === this.lastKey) return; this.lastKey = key;
    const c = new Color();
    for (const L of this.lamps) {
      L.list.forEach((l, i) => { const ph = this.phase(l.site, t)[l.road as 'A' | 'B']; L.mesh.setColorAt(i, ph === l.aspect ? L.on[1] : L.on[0]); });
      if (L.mesh.instanceColor) L.mesh.instanceColor.needsUpdate = true;
    }
    if (this.peds) {
      const off = new Color('#202020'), r = new Color('#ff3b30'), g = new Color('#2ee86b');
      this.peds.list.forEach((p, i) => { const w = this.phase(p.site, t).walk === p.crosses; this.peds!.top.setColorAt(i, w ? off : r); this.peds!.bot.setColorAt(i, w ? g : off); });
      for (const m of [this.peds.top, this.peds.bot]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (this.trams) {
      this.trams.list.forEach((p, i) => this.trams!.mesh.setColorAt(i, this.phase(p.site, t)[p.road as 'A' | 'B'] === 2 ? c.set('#f4f6ff') : c.set('#2b2d2f')));
      if (this.trams.mesh.instanceColor) this.trams.mesh.instanceColor.needsUpdate = true;
    }
    if (this.btnLamps) {
      this.buttons.forEach((b, i) => this.btnLamps!.setColorAt(i, this.phase(b.site, t).walk === b.crosses ? c.set('#fff2a0') : c.set('#d9d9d4')));
      if (this.btnLamps.instanceColor) this.btnLamps.instanceColor.needsUpdate = true;
    }
  }
}
