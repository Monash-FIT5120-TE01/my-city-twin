/*
 * STREET FURNITURE — lights, seats, pit lids, tactile pads, parking-bay lines, fountains, toilets.
 *
 * Positions are real (City of Melbourne open data) except the light poles, which are inferred from the
 * peaks of the CoM "emitted lux level" points (there is no open pole dataset). Orientations and the exact
 * shapes are decided in scripts/build-streetscape.mjs; this file only draws them.
 *
 * Shapes:
 *   Kings Street light   CoM DS 601.01: 10 m silver pole, road arm 3.5 m out at 9.0 m, footpath arm 1.255 m
 *                        out at 5.69 m.
 *   Seats                CoM DS 701.01 slatted seat (1987 x 565 x 810); at a planter end, the curved stainless
 *                        rod seat seen in street photos, backless, facing along the street.
 *   Pit lids             CoM "Stormwater pits": real grate size and material; bar pattern EST.
 *   Tactile pads         CoM asset points; pad 2.4 x 0.6 m with stainless studs (shape EST).
 *   Parking bays         CoM bay points; end lines and the road-side line as in street photos (sizes EST).
 *   Fountains            CoM DS 703.01 "leaf" fountain; "Type 1" as a plain pedestal (EST).
 *   Toilets              CoM points; structure only where the National Public Toilet Map states the type:
 *                        Exeloo = CoM DS 710.09 capsule, underground = stair entrance; otherwise a WC sign.
 */
import { ExtrudeGeometry, Group, MeshStandardMaterial, Shape, Vector3, type BufferGeometry, type Material } from 'three';
import type { FeatureKind, LightType } from './lights';
import { DIST, compactEach, type CompactGroup } from './lod';
import { Batch, FLAT_TOP, MAT, SIGN_X, SIGN_Y, TALL_CELL_M, UNIT_BOX, UNIT_CYL, UNIT_ROD, at, boxAt, canvasTexture, onTop, quiet, rodBetween, slice, type XY } from './kit';

export interface StreetDoc {
  /** [x, y, yaw, type] — see lights.ts */
  lights: [number, number, number, LightType][];
  /** [x, y, kind, lamps in the fitting, yaw, ground z] */
  featureLights: [number, number, FeatureKind, number, number, number][];
  seats: { p: XY; yaw: number; z: number; kind: 'kerb' | 'planter'; len?: number; model: string }[];
  /** [x, y, yaw, length m, width m, top z, crossed bars 1/0, cast iron 1/0] */
  pits: [number, number, number, number, number, number, number, number][];
  tgsi: [number, number, number][];
  /** [x, y, yaw, length m, z] */
  bayLines: [number, number, number, number, number][];
  /** [x, y, yaw, leaf 1/0, bottle tap 1/0, z] */
  fountains: [number, number, number, number, number, number][];
  toilets: { p: XY; yaw: number; type: 'exeloo' | 'underground' | 'unknown' | 'building'; name: string }[];
}

const FOOTWAY = 0.14;
const local = (x: number, y: number, yaw: number, u: number, v: number): XY => [x + Math.cos(yaw) * u - Math.sin(yaw) * v, y + Math.sin(yaw) * u + Math.cos(yaw) * v];

function stadium(len: number, wid: number): Shape {
  const r = wid / 2, a = len / 2 - r, s = new Shape();
  s.moveTo(-a, -r); s.lineTo(a, -r); s.absarc(a, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-a, r); s.absarc(-a, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}

export async function buildStreet(doc: StreetDoc): Promise<{ near: Group; mid: Group; groups: CompactGroup[] }> {
  const near = new Batch(), mid = new Batch(TALL_CELL_M);
  const put = (b: Batch, geo: BufferGeometry, mat: Material, x: number, y: number, z: number, yaw: number, u: number, v: number, sx: number, sy: number, sz: number) => {
    const [px, py] = local(x, y, yaw, u, v); b.add(geo, mat, at(px, py, z, yaw, sx, sy, sz));
  };

  // street and feature lights: see lights.ts

  // seats
  for (const s of doc.seats) {
    await slice();
    const [x, y] = s.p, z = s.z + 0.0, yaw = s.yaw;
    if (s.kind === 'planter') {   // curved rod seat across the planter end, back to the planter, facing `yaw`
      const len = s.len ?? 1.5;
      // rods run across the end (local y), rising at front and back into a shallow dish
      for (let k = 0; k < 9; k++) { const u = -0.24 + k * 0.06, h = z + 0.4 + 0.9 * u * u; const a = local(x, y, yaw, u, -len / 2), b = local(x, y, yaw, u, len / 2); near.add(UNIT_ROD, MAT.steel, rodBetween(new Vector3(a[0], a[1], h), new Vector3(b[0], b[1], h), 0.009)); }
      for (const v of [-len / 2 + 0.15, len / 2 - 0.15]) put(near, UNIT_BOX, MAT.steel, x, y, z + 0.2, yaw, 0, v, 0.36, 0.03, 0.4);
      continue;
    }
    // DS 701.01: seat slats, back slats leaning back, two legs; front faces `yaw` (local +x)
    for (let k = 0; k < 6; k++) put(near, UNIT_BOX, MAT.steel, x, y, z + 0.42, yaw, 0.15 - k * 0.06, 0, 0.05, 1.987, 0.025);
    for (let k = 0; k < 5; k++) put(near, UNIT_BOX, MAT.steel, x, y, z + 0.52 + k * 0.07, yaw, -0.24 - k * 0.012, 0, 0.022, 1.987, 0.05);
    for (const v of [-0.8, 0.8]) put(near, UNIT_ROD, MAT.steel, x, y, z, yaw, 0.05, v, 0.025, 0.025, 0.42);
  }

  // drinking fountains
  for (const [x, y, yaw, leaf, bottle, z] of doc.fountains) {
    await slice();
    if (leaf) {
      put(near, UNIT_CYL, MAT.steel, x, y, z, yaw, -0.05, 0, 0.075, 0.075, 0.82);
      put(near, UNIT_BOX, MAT.steel, x, y, z + 0.78, yaw, 0.2, 0, 0.55, 0.22, 0.06);
      put(near, UNIT_CYL, MAT.steel, x, y, z + 0.8, yaw, 0.03, 0, 0.015, 0.015, 0.07);
      if (bottle) put(near, UNIT_BOX, MAT.steel, x, y, z + 0.5, yaw, -0.12, 0.06, 0.05, 0.05, 0.08);
    } else {
      put(near, UNIT_CYL, MAT.steel, x, y, z, yaw, 0, 0, 0.12, 0.12, 0.85);
      put(near, UNIT_CYL, MAT.steel, x, y, z + 0.84, yaw, 0, 0, 0.2, 0.2, 0.08);
    }
  }

  // toilets
  const pod = (len: number, wid: number, h: number) => new ExtrudeGeometry(stadium(len, wid), { depth: h, bevelEnabled: false, curveSegments: 12 });
  const fascia = new MeshStandardMaterial({ map: canvasTexture(512, 64, (g, w) => { g.fillStyle = '#c9ccce'; g.fillRect(0, 0, w, 64); g.fillStyle = '#2b2d2f'; g.font = 'bold 36px sans-serif'; g.textAlign = 'center'; g.fillText('T O I L E T', w / 2, 46); }), roughness: 0.35, metalness: 0.25 });
  const sign = new MeshStandardMaterial({ map: canvasTexture(128, 128, (g) => { g.fillStyle = '#1f4fa0'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.fillText('WC', 64, 84); }) });
  for (const t of doc.toilets) {
    await slice();
    const [x, y] = t.p, z = FOOTWAY, yaw = t.yaw;
    if (t.type === 'exeloo') {   // CoM DS 710.09: 4100 x 2300 capsule, ceiling 2235, fascia band, 890 door
      near.add(pod(4.1, 2.3, 2.235), MAT.steel, at(x, y, z, yaw));
      // the band round the capsule is plain; its name is on a plate on each long side, so it reads the right way
      near.add(pod(4.25, 2.45, 0.22), MAT.steel, at(x, y, z + 2.235, yaw));
      for (const v of [-1.23, 1.23]) put(near, SIGN_Y, fascia, x, y, z + 2.345, yaw, 0, v, 1.8, 0.01, 0.2);
      put(near, UNIT_BOX, MAT.frame, x, y, z + 1.05, yaw, -0.3, -1.16, 0.89, 0.03, 2.1);
    } else if (t.type === 'underground') {   // heritage stair entrance with a railing (sizes EST)
      put(near, UNIT_BOX, MAT.groove, x, y, z + 0.01, yaw, 0, 0, 4.2, 1.6, 0.02);
      for (const v of [-0.85, 0.85]) put(near, UNIT_BOX, MAT.darkGrey, x, y, z + 1.0, yaw, 0, v, 4.3, 0.05, 0.05);
      put(near, UNIT_BOX, MAT.darkGrey, x, y, z + 1.0, yaw, -2.15, 0, 0.05, 1.75, 0.05);
      for (let u = -2.1; u <= 2.1; u += 0.3) for (const v of [-0.85, 0.85]) put(near, UNIT_BOX, MAT.darkGrey, x, y, z + 0.5, yaw, u, v, 0.02, 0.02, 1.0);
    } else {   // type not stated in open data, or inside a building: a blue WC sign on a post
      put(near, UNIT_ROD, MAT.steel, x, y, z, yaw, 0, 0, 0.03, 0.03, 2.6);
      put(near, SIGN_X, sign, x, y, z + 2.35, yaw, 0, 0, 0.02, 0.42, 0.42);
    }
  }

  const nearG = await near.build('street-near'), midG = await mid.build('street-mid');

  // instanced: pit lids, tactile pads, bay lines (many and identical in shape)
  const grate = (crossed: boolean, castIron: boolean) => onTop(new MeshStandardMaterial({ roughness: 0.7, metalness: 0.4, map: canvasTexture(128, 128, (g) => {
    g.fillStyle = '#141311'; g.fillRect(0, 0, 128, 128); g.fillStyle = castIron ? '#57534e' : '#7a6e62';
    g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10); g.fillRect(0, 0, 10, 128); g.fillRect(118, 0, 10, 128);
    if (crossed) for (let i = 10; i < 118; i += 18) { g.fillRect(i, 0, 6, 128); g.fillRect(0, i, 128, 6); } else for (let i = 10; i < 118; i += 13) g.fillRect(i, 0, 6, 128);
  }) }), FLAT_TOP);
  const pitGroups = new Map<string, [number, number, number, number, number, number][]>();
  for (const [x, y, yaw, L, W, z, crossed, ci] of doc.pits) { const k = `${crossed}${ci}`; if (!pitGroups.has(k)) pitGroups.set(k, []); pitGroups.get(k)!.push([x, y, yaw, L, W, z]); }
  // pit lids, tactile pads and bay lines: a few millimetres proud, drawn within DIST.tiny (lod.ts)
  const groups: CompactGroup[] = [];
  for (const [k, list] of pitGroups) groups.push(compactEach('pits', UNIT_BOX, grate(k[0] === '1', k[1] === '1'), list, (i) => { const [x, y, yaw, L, W, z] = list[i]; return boxAt(x, y, z, yaw, L, W, 0.008); }, DIST.tiny));
  const studs = onTop(new MeshStandardMaterial({ roughness: 0.6, metalness: 0.3, map: canvasTexture(64, 64, (g) => { g.fillStyle = '#bdbcb7'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#7f8386'; for (let a = 8; a < 64; a += 16) for (let b = 8; b < 64; b += 16) { g.beginPath(); g.arc(a, b, 4.5, 0, 7); g.fill(); } }, true) }), FLAT_TOP);
  studs.map!.repeat.set(2.4 / 0.25, 0.6 / 0.25);
  groups.push(compactEach('tactile-pads', UNIT_BOX, studs, doc.tgsi, (i) => { const [x, y, yaw] = doc.tgsi[i]; return boxAt(x, y, FOOTWAY, yaw, 2.4, 0.6, 0.006); }, DIST.tiny));
  groups.push(compactEach('bay-lines', UNIT_BOX, MAT.paint, doc.bayLines, (i) => { const [x, y, yaw, L, z] = doc.bayLines[i]; return boxAt(x, y, z, yaw, L, 0.1, 0.004); }, DIST.tiny));
  for (const g of groups) for (const [c] of g.parts) nearG.add(c.mesh);
  return { near: quiet(nearG), mid: quiet(midG), groups };
}
