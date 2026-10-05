/*
 * STREET AND FEATURE LIGHTING
 *
 * Street lights — positions inferred from the peaks of the City of Melbourne "emitted lux level" points
 * (there is no open pole dataset); the type is chosen in scripts/build-streetscape.mjs by the Design
 * Standards' own rules of use. Shapes follow the City of Melbourne Design Standards (2013):
 *   601.01 Kings Street tall   10 m aluminium pole, Dulux Silver Glow Pearl; road arm 3.5 m at 9.0 m with a
 *                              tie rod from the top; footpath arm 1.255 m at 5.69 m
 *   601.02 Kings Street short  5.5 m pole; arm 2.72 m at 5.0 m with a tie rod
 *   601.05 laneway wall light  stainless arm from a wall plate, long bracket 1.74 m out, "Swanston Street"
 *                              lantern (stepped hood over a glass globe) at 5.5 m
 *   601.07 St Kilda Road       ~10 m galvanised pole (also a tram catenary pole), arm 2 m
 *   601.09 park light          5.455 m tapered pole, Dulux Deep Brunswick Green (Birrarung Marr: Charcoal),
 *                              760 mm inverted glass cone with a spun aluminium top
 * Feature lighting — real positions and types from the CoM "Feature lighting" dataset; these fittings have
 * no design standard, so their shapes are EST: lamps on slim poles, floodlights, up-lights in the ground,
 * down-lights, wall lights, the Chinatown catenary lanterns, and LED strips under seats, stairs and bridges.
 *
 * Lit or not: the lamp faces share two materials whose glow is switched, and pools of light are drawn on the
 * ground under each lamp (additive, no real light source — so building shadows are untouched).
 */
import {
  AdditiveBlending,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { Batch, FLAT_TOP, MAT, TALL_CELL_M, UNIT_BOX, UNIT_CYL, UNIT_ROD, at, canvasTexture, onTop, quiet, rodBetween, shared, slice, type XY } from './kit';

export type LightType = 'tall' | 'short' | 'wall' | 'stkilda' | 'park' | 'parkCharcoal';
export type FeatureKind = 'feature' | 'flood' | 'up' | 'down' | 'wall' | 'catenary' | 'seat' | 'stairs' | 'bridge';

const FOOTWAY = 0.14;
const local = (x: number, y: number, yaw: number, u: number, v: number): XY => [x + Math.cos(yaw) * u - Math.sin(yaw) * v, y + Math.sin(yaw) * u + Math.cos(yaw) * v];
const taper = (r0: number, r1: number) => { const g = new CylinderGeometry(r1, r0, 1, 12, 1); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return g; };
/** Kings Street luminaire: a flattened teardrop along +x. */
const KINGS_HEAD = (() => { const g = new SphereGeometry(0.5, 16, 8); g.scale(1, 0.42, 0.18); return shared(g); })();
const SPHERE = shared(new SphereGeometry(1, 14, 10));

export class Lighting {
  near!: Group;
  mid!: Group;
  /** Pools of light on the ground; shown only when lit. */
  readonly pools: Group = new Group();
  private lampWarm = new MeshStandardMaterial({ color: '#eef0f2', emissive: '#ffe2b0', emissiveIntensity: 0, roughness: 0.4 });
  private lampRed = new MeshStandardMaterial({ color: '#8d1c22', emissive: '#ff3b2f', emissiveIntensity: 0, roughness: 0.5 });
  private lit = false;

  /** Builds the poles, heads and pools (in slices, see kit.ts). */
  async build(lights: [number, number, number, LightType][], features: [number, number, FeatureKind, number, number, number][]): Promise<this> {
    const near = new Batch(), mid = new Batch(TALL_CELL_M);
    const put = (b: Batch, geo: BufferGeometry, mat: Material, x: number, y: number, z: number, yaw: number, u: number, v: number, sx = 1, sy = 1, sz = 1) => {
      const [px, py] = local(x, y, yaw, u, v); b.add(geo, mat, at(px, py, z, yaw, sx, sy, sz));
    };
    const rod = (b: Batch, mat: Material, a: [number, number, number], c: [number, number, number], r: number) => b.add(UNIT_ROD, mat, rodBetween(new Vector3(...a), new Vector3(...c), r));
    const pools: [number, number, number, number, string][] = [];   // x, y, z, radius, colour
    const green = new MeshStandardMaterial({ color: '#2b4434', roughness: 0.5 }), charcoal = new MeshStandardMaterial({ color: '#3a3d40', roughness: 0.5 });
    const glass = new MeshStandardMaterial({ color: '#f4f2ea', transparent: true, opacity: 0.55, roughness: 0.1 });
    const POLE_KINGS = taper(0.11, 0.06), POLE_SHORT = taper(0.09, 0.055), POLE_PARK = taper(0.0825, 0.05);

    for (const [x, y, yaw, type] of lights) {
      await slice();
      const z = FOOTWAY;
      const L = (u: number, v = 0): XY => local(x, y, yaw, u, v);
      if (type === 'tall') {
        mid.add(POLE_KINGS, MAT.silver, at(x, y, z, 0, 1, 1, 10));
        put(near, UNIT_BOX, MAT.silver, x, y, z + 9.0, yaw, 1.75, 0, 3.5, 0.07, 0.07);
        rod(near, MAT.silver, [x, y, z + 9.95], [...L(2.3), z + 9.03], 0.014);
        put(near, KINGS_HEAD, this.lampWarm, x, y, z + 8.95, yaw, 3.3, 0, 0.8, 1, 1);
        put(near, UNIT_BOX, MAT.silver, x, y, z + 5.69, yaw, -0.63, 0, 1.255, 0.06, 0.06);
        put(near, KINGS_HEAD, this.lampWarm, x, y, z + 5.64, yaw, -1.2, 0, 0.55, 0.8, 0.8);
        pools.push([...L(3.3), 0.05, 9, '#ffe2b0'], [...L(-1.2), FOOTWAY + 0.02, 5, '#ffe2b0']);
      } else if (type === 'short') {
        mid.add(POLE_SHORT, MAT.silver, at(x, y, z, 0, 1, 1, 5.5));
        put(near, UNIT_BOX, MAT.silver, x, y, z + 5.0, yaw, 1.36, 0, 2.72, 0.06, 0.06);
        rod(near, MAT.silver, [x, y, z + 5.45], [...L(1.8), z + 5.03], 0.012);
        put(near, KINGS_HEAD, this.lampWarm, x, y, z + 4.95, yaw, 2.55, 0, 0.6, 0.9, 0.9);
        pools.push([...L(2.55), 0.05, 6, '#ffe2b0']);
      } else if (type === 'stkilda') {
        mid.add(UNIT_CYL, MAT.galv, at(x, y, z, 0, 0.162, 0.162, 9.97));
        put(near, UNIT_BOX, MAT.galv, x, y, z + 9.85, yaw, 1.0, 0, 2.0, 0.06, 0.06);
        put(near, KINGS_HEAD, this.lampWarm, x, y, z + 9.8, yaw, 1.95, 0, 0.6, 0.9, 0.9);
        pools.push([...L(1.95), 0.05, 7, '#ffe2b0']);
      } else if (type === 'wall') {   // DS 601.05 long bracket: wall plate, arm curving out 1.74 m, lantern hanging below its end
        const zA = z + 6.3;
        put(near, UNIT_BOX, MAT.steel, x, y, z + 5.9, yaw, 0.02, 0, 0.04, 0.22, 0.6);
        const pts: [number, number, number][] = [0, 0.4, 0.8, 1.2, 1.55, 1.74].map((u, k) => [...L(u), zA - 0.55 + 0.55 * Math.sin((k / 5) * Math.PI / 2)] as [number, number, number]);
        for (let k = 0; k < pts.length - 1; k++) rod(near, MAT.steel, pts[k], pts[k + 1], 0.025);
        rod(near, MAT.steel, [...L(0), zA + 0.35] as [number, number, number], pts[3], 0.006);   // bracing wire
        const [hx, hy] = L(1.74), zH = z + 5.5;
        rod(near, MAT.steel, [hx, hy, zA], [hx, hy, zH + 0.35], 0.012);
        near.add(CONE_HOOD, MAT.steel, at(hx, hy, zH + 0.2, 0, 0.36, 0.36, 0.18));   // stepped hood
        near.add(CONE_HOOD, MAT.steel, at(hx, hy, zH + 0.33, 0, 0.18, 0.18, 0.1));
        near.add(SPHERE, this.lampWarm, at(hx, hy, zH + 0.08, 0, 0.13, 0.13, 0.15));
        pools.push([hx, hy, FOOTWAY + 0.02, 5, '#ffe2b0']);
      } else {   // park light
        const paint = type === 'parkCharcoal' ? charcoal : green;
        mid.add(POLE_PARK, paint, at(x, y, z, 0, 1, 1, 5.455));
        near.add(PARK_CONE, glass, at(x, y, z + 5.455, 0, 1, 1, 1));
        near.add(UNIT_CYL, this.lampWarm, at(x, y, z + 5.5, 0, 0.06, 0.06, 0.45));
        near.add(PARK_CAP, paint, at(x, y, z + 6.215, 0, 1, 1, 1));
        pools.push([x, y, FOOTWAY + 0.02, 7, '#ffe2b0']);
      }
    }

    // feature lighting (shapes EST; positions and kinds real)
    const black = MAT.signal, cat: XY[] = [];
    for (const [x, y, kind, n, yaw, zs] of features) {
      await slice();
      if (kind === 'feature') {
        rod(near, black, [x, y, zs], [x, y, zs + 4.5], 0.05);
        const m = Math.min(6, n);
        for (let k = 0; k < m; k++) { const a = (k / m) * Math.PI * 2; const [lx, ly] = m > 1 ? [x + Math.cos(a) * 0.25, y + Math.sin(a) * 0.25] : [x, y]; near.add(SPHERE, this.lampWarm, at(lx, ly, zs + 4.45, 0, 0.12, 0.12, 0.12)); }
        pools.push([x, y, zs + 0.02, 3.5, '#ffe9c4']);
      } else if (kind === 'flood') {
        rod(near, black, [x, y, zs], [x, y, zs + 6], 0.06);
        put(near, UNIT_BOX, this.lampWarm, x, y, zs + 5.9, yaw, 0.15, 0, 0.12, 0.35, 0.28);
        pools.push([...local(x, y, yaw, 4, 0), zs + 0.02, 5, '#f2f6ff']);
      } else if (kind === 'up') {
        near.add(UNIT_CYL, this.lampWarm, at(x, y, zs, 0, 0.12, 0.12, 0.01));
      } else if (kind === 'down') {
        rod(near, black, [x, y, zs], [x, y, zs + 3.5], 0.045);
        near.add(UNIT_CYL, this.lampWarm, at(x, y, zs + 3.4, 0, 0.14, 0.14, 0.1));
        pools.push([x, y, zs + 0.02, 2.5, '#ffe9c4']);
      } else if (kind === 'wall') {
        put(near, UNIT_BOX, this.lampWarm, x, y, zs + 3.0, yaw, 0, 0, 0.12, 0.2, 0.25);
      } else if (kind === 'catenary') {   // Chinatown: lanterns hung on wires over Little Bourke Street
        near.add(SPHERE, this.lampRed, at(x, y, zs + 6, 0, 0.28, 0.28, 0.36)); cat.push([x, y]);
      } else {   // LED strips under seats, on stairs and bridges
        put(near, UNIT_BOX, this.lampWarm, x, y, zs + 0.25, yaw, 0, 0, 0.05, 1.2, 0.03);
      }
    }
    const wired = new Set<string>();
    for (let i = 0; i < cat.length; i++) {   // wire from each lantern to its nearest neighbour within 12 m, once per pair
      let best = -1, bd = 12; for (let j = 0; j < cat.length; j++) { if (j === i) continue; const d = Math.hypot(cat[j][0] - cat[i][0], cat[j][1] - cat[i][1]); if (d < bd) { bd = d; best = j; } }
      if (best < 0) continue;
      const pair = i < best ? `${i}-${best}` : `${best}-${i}`;
      if (wired.has(pair)) continue;
      wired.add(pair); rod(near, MAT.wire, [cat[i][0], cat[i][1], FOOTWAY + 6.3], [cat[best][0], cat[best][1], FOOTWAY + 6.3], 0.006);
    }
    this.near = quiet(await near.build('lights-near')); this.mid = quiet(await mid.build('lights-mid'));

    // pools of light: one instanced disc per colour, radial falloff, additive
    const fall = canvasTexture(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    const byCol = new Map<string, [number, number, number, number][]>();
    for (const [px, py, pz, r, c] of pools) { if (!byCol.has(c)) byCol.set(c, []); byCol.get(c)!.push([px, py, pz, r]); }
    for (const [c, list] of byCol) {
      const mat = onTop(new MeshBasicMaterial({ map: fall, color: c, transparent: true, depthWrite: false, blending: AdditiveBlending }), FLAT_TOP - 4);
      const im = new InstancedMesh(new CircleGeometry(1, 32), mat, list.length);
      list.forEach(([px, py, pz, r], i) => im.setMatrixAt(i, at(px, py, pz, 0, r, r, 1)));
      im.computeBoundingSphere(); this.pools.add(im);
    }
    this.pools.name = 'light-pools'; this.pools.visible = false; quiet(this.pools);
    return this;
  }

  /** Lamps glow and pools show when lit. */
  setLit(on: boolean): void {
    if (on === this.lit) return; this.lit = on;
    this.lampWarm.emissiveIntensity = on ? 2.2 : 0;
    this.lampRed.emissiveIntensity = on ? 1.8 : 0;
    this.pools.visible = on;
  }
}

/** DS 601.09 lantern: 760 mm inverted cone of glass (wide at the top). */
const PARK_CONE = (() => { const g = new CylinderGeometry(0.33, 0.09, 0.76, 18, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.38); return shared(g); })();
/** Its spun aluminium top. */
const PARK_CAP = (() => { const g = new ConeGeometry(0.36, 0.12, 18); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.06); return shared(g); })();
/** The Swanston Street lantern's hood: a shallow cone, wide at the bottom. */
const CONE_HOOD = (() => { const g = new ConeGeometry(1, 1, 20, 1, false); g.rotateX(Math.PI / 2); return shared(g); })();
