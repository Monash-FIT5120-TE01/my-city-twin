/*
 * TRAM INFRASTRUCTURE — rails, overhead, platforms (no trams yet).
 *
 * Rails: Transport Victoria GTFS shapes (CC BY 4.0), one centreline per track, shifted onto the City of
 * Melbourne tram formation where it exists; two rails at +-717.5 mm, each a steel head with a dark groove.
 * Overhead (Yarra Trams CE-021-ST-0036): contact wire 5.64 m over each track; cross spans every ~30 m to
 * poles 0.8 m behind the kerbs (273/219 mm, 9 m). Pole positions are EST (no open data).
 * Platforms: OpenStreetMap outlines (ODbL), 290 mm high (Yarra Trams CE-019-ST-0039): bluestone coping and
 * the pale warning TGSI on the track edge; where the rear faces the carriageway, the stainless pipe fence, a
 * ramp at the end nearer a signalised crossing and two steps at the other, and enclosed glass shelters;
 * where it faces a footway, no fence or ramp, and the open CBD canopy (CoM DS 710.04). Green PTV totem at
 * the departure end, litter bins (DS 702.01), stop name on the canopy band. Fitting positions are EST.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Euler,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three';
import { Batch, FLAT_TOP, MAT, RAISED, SIGN_Y, TALL_CELL_M, UNIT_BOX, UNIT_CYL, UNIT_ROD, at, canvasTexture, onTop, quiet, rodBetween, simplifyLine, slice, type XY } from './kit';

export interface Platform {
  name: string; stopName?: string; stopNo?: string; ring: XY[]; c: XY; t: XY; u: [number, number]; w: [number, number];
  front?: number; dep?: number; needRamp?: boolean; rampAtStart?: boolean; m?: [number, number]; fence?: [number, number][];
  shelters?: { type: 'box' | 'canopy'; u: number; w: number; depth: number; ruleBench: boolean }[]; simple?: boolean;
}
export interface TramDoc { trackLines: XY[][]; platforms: Platform[]; overhead: { spans: [XY, XY][]; poles: XY[] } }

const PH = 0.29, RAIL_Z = 0.042;

function ribbon(line: XY[], off: number, width: number, z: number): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  line.forEach((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    for (const w of [off - width / 2, off + width / 2]) pos.push(p[0] - dy * w, p[1] + dx * w, z);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  });
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function clipRing(ring: XY[], f: (p: XY) => number): XY[] {
  const out: XY[] = [], pts = ring.slice(0, -1);
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k], b = pts[(k + 1) % pts.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  if (out.length > 2) out.push(out[0]);
  return out;
}
const slabGeo = (ring: XY[], h: number) => { const s = new Shape(); s.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) s.lineTo(ring[i][0], ring[i][1]); return new ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); };

export async function buildTram(doc: TramDoc): Promise<{ always: Group; mid: Group; near: Group }> {
  const always = new Group(); always.name = 'tram-always';
  const mid = new Batch(TALL_CELL_M);
  // rails: the track lines carry a point every ~2 m along straight track; 2 cm keeps the curves. Cut into
  // ~100 m pieces so each lands in its own cell and goes with it (mid band).
  const railMat = MAT.rail.clone(); railMat.side = DoubleSide; const grooveMat = MAT.groove.clone(); grooveMat.side = DoubleSide;
  for (const full of doc.trackLines) {
    await slice();
    const line = simplifyLine(full, 0.02);
    for (let s = 0; s < line.length - 1;) {
      let e = s + 1, run = 0; while (e < line.length - 1 && run < 100) { run += Math.hypot(line[e][0] - line[e - 1][0], line[e][1] - line[e - 1][1]); e++; }
      const part = line.slice(s, e + 1), where = part[Math.floor(part.length / 2)];
      for (const off of [-0.7175, 0.7175]) {
        mid.add(ribbon(part, off, 0.06, RAIL_Z), railMat, new Matrix4(), where);
        mid.add(ribbon(part, off - Math.sign(off) * 0.05, 0.04, RAIL_Z - 0.001), grooveMat, new Matrix4(), where);
      }
      s = e;
    }
  }

  // overhead: wires (mid band), poles (mid band)
  for (const line of doc.trackLines) {
    if (line.length < 2) continue;
    const curve = new CatmullRomCurve3(line.map((q) => new Vector3(q[0], q[1], 5.64)));
    mid.add(new TubeGeometry(curve, Math.max(2, line.length), 0.007, 3, false), MAT.wire, at(0, 0, 0), line[Math.floor(line.length / 2)]);
  }
  for (const [a, b] of doc.overhead.spans) {
    const m: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    mid.add(UNIT_ROD, MAT.wire, rodBetween(new Vector3(a[0], a[1], 6.6), new Vector3(m[0], m[1], 5.74), 0.005));
    mid.add(UNIT_ROD, MAT.wire, rodBetween(new Vector3(m[0], m[1], 5.74), new Vector3(b[0], b[1], 6.6), 0.005));
  }
  for (const [x, y] of doc.overhead.poles) { mid.add(UNIT_CYL, MAT.galv, at(x, y, 0.14, 0, 0.137, 0.137, 4)); mid.add(UNIT_CYL, MAT.galv, at(x, y, 4.14, 0, 0.11, 0.11, 5)); }

  // platforms
  const near = new Batch();
  const platMat = onTop(new MeshStandardMaterial({ color: '#8f8e8a', roughness: 0.95 }), RAISED);
  const tgsiMat = onTop(new MeshStandardMaterial({ roughness: 0.8, map: canvasTexture(64, 64, (g) => { g.fillStyle = '#d8d5cd'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#b9b5ab'; for (const x of [16, 48]) for (const y of [16, 48]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); } }) }), FLAT_TOP);
  const glass = new MeshStandardMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.28, roughness: 0.1, side: DoubleSide, depthWrite: false });
  const roofGlass = new MeshStandardMaterial({ color: '#b8d0d6', transparent: true, opacity: 0.4, roughness: 0.15, side: DoubleSide, depthWrite: false });
  const art = new MeshStandardMaterial({ roughness: 0.6, map: canvasTexture(128, 256, (g, w, h) => { g.fillStyle = '#1f6f4a'; g.fillRect(0, 0, w, h); const cs = ['#2f9e5f', '#7cc576', '#13456b', '#e0c25a', '#0d3b2a']; for (let k = 0; k < 40; k++) { g.fillStyle = cs[k % 5]; g.beginPath(); g.arc((k * 53) % w, (k * 97) % h, 10 + (k * 7) % 26, 0, 7); g.fill(); } }) });
  const pid = new MeshStandardMaterial({ emissive: '#ffb000', emissiveIntensity: 0.25, map: canvasTexture(256, 96, (g, w, h) => { g.fillStyle = '#050505'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb000'; for (let r = 0; r < 3; r++) { g.fillRect(14, 16 + r * 26, 30, 12); g.fillRect(56, 16 + r * 26, 130, 12); g.fillRect(205, 16 + r * 26, 36, 12); } }) });
  const bin = new MeshStandardMaterial({ roughness: 0.35, metalness: 0.3, map: canvasTexture(64, 64, (g) => { g.fillStyle = '#b8bcbf'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#5a5e61'; for (let x = 4; x < 64; x += 8) for (let y = 4; y < 64; y += 8) g.fillRect(x, y, 4, 4); }, true) });

  for (const pl of doc.platforms) {
    await slice();
    const { c, t } = pl, n: XY = [-t[1], t[0]], yaw = Math.atan2(t[1], t[0]);
    const U = (q: XY) => (q[0] - c[0]) * t[0] + (q[1] - c[1]) * t[1];
    const P = (u: number, w: number): XY => [c[0] + t[0] * u + n[0] * w, c[1] + t[1] * u + n[1] * w];
    const box = (ua: number, ub: number, wa: number, wb: number, z0: number, h: number, mat: Material, geo = UNIT_BOX) => {
      const [x, y] = P((ua + ub) / 2, (wa + wb) / 2); near.add(geo, mat, at(x, y, z0 + h / 2, yaw, Math.abs(ub - ua), Math.abs(wb - wa), h));
    };
    const tube = (a: [number, number, number], b: [number, number, number], r: number) => { const [ax, ay] = P(a[0], a[1]), [bx, by] = P(b[0], b[1]); near.add(UNIT_ROD, MAT.steel, rodBetween(new Vector3(ax, ay, a[2]), new Vector3(bx, by, b[2]), r)); };
    if (pl.simple || pl.front === undefined) { near.add(slabGeo(pl.ring, PH), platMat, at(0, 0, 0), c); continue; }
    const f = pl.front, [u0, u1] = pl.u, wf = f === 1 ? pl.w[1] : pl.w[0], wr = f === 1 ? pl.w[0] : pl.w[1], k = f, s = -f;
    const [mStart, mEnd] = pl.m!, dep = pl.dep!;
    const piece = (a: number, b: number) => clipRing(clipRing(pl.ring, (q) => U(q) - a), (q) => b - U(q));
    const main = pl.needRamp ? piece(mStart, mEnd) : pl.ring;
    if (main.length > 3) near.add(slabGeo(main, PH), platMat, at(0, 0, 0), c);
    if (pl.needRamp) {
      const start = !!pl.rampAtStart, rampRing = start ? piece(u0, mStart) : piece(mEnd, u1), stepRing = start ? piece(mEnd, u1) : piece(u0, mStart);
      if (rampRing.length > 3) {   // a wedge: top falls to the road at the outer end
        const g = slabGeo(rampRing, PH), pos = g.attributes.position;
        for (let q = 0; q < pos.count; q++) if (pos.getZ(q) > PH - 1e-4) { const uu = U([pos.getX(q), pos.getY(q)]); const fr = start ? (uu - u0) / (mStart - u0) : (u1 - uu) / (u1 - mEnd); pos.setZ(q, Math.max(0.01, PH * Math.min(1, fr))); }
        g.computeVertexNormals(); near.add(g, platMat, at(0, 0, 0), c);
      }
      if (stepRing.length > 3) near.add(slabGeo(stepRing, PH / 2), platMat, at(0, 0, 0), c);
      for (const [ua, ub] of [[mStart, mStart + 0.6], [mEnd - 0.6, mEnd]]) box(ua, ub, pl.w[0] + 0.2, pl.w[1] - 0.2, PH, 0.006, tgsiMat);
      const [ra, rb] = start ? [u0 + 0.2, mStart] : [mEnd, u1 - 0.2];
      for (const w of [pl.w[0] + 0.12, pl.w[1] - 0.12]) {
        const ya = (u: number) => PH * Math.min(1, start ? (u - u0) / (mStart - u0) : (u1 - u) / (u1 - mEnd)) + 0.9;
        tube([ra, w, ya(ra)], [rb, w, ya(rb)], 0.022);
        for (const u of [ra, (ra + rb) / 2, rb]) tube([u, w, ya(u) - 0.9], [u, w, ya(u)], 0.025);
      }
    }
    // track edge: thin yellow line, then the pale warning TGSI 300 wide from 300 mm
    box(mStart, mEnd, wf, wf + s * 0.075, PH, 0.005, MAT.yellow);
    box(mStart, mEnd, wf + s * 0.3, wf + s * 0.6, PH, 0.006, tgsiMat);
    // fence (rear faces the carriageway only): posts every 2 m, top rail 1.1 m, bottom rail 0.15 m, bars 120 mm
    const wz = wr + k * 0.08;
    for (const [fa, fb] of pl.fence || []) {
      for (let u = fa; u <= fb + 0.01; u += 2) tube([u, wz, PH], [u, wz, PH + 1.18], 0.038);
      tube([fa, wz, PH + 1.1], [fb, wz, PH + 1.1], 0.025); tube([fa, wz, PH + 0.15], [fb, wz, PH + 0.15], 0.016);
      for (let u = fa + 0.06; u < fb; u += 0.12) tube([u, wz, PH + 0.15], [u, wz, PH + 1.1], 0.008);
    }
    for (const sh of pl.shelters || []) {
      const um = sh.u;
      if (sh.type === 'canopy') {   // DS 710.04: 9850 long, 3 stainless posts at 3500, glass roof on dark ribs, green name band
        const wc = sh.w, ca = um - 4.925, cb = um + 4.925;
        for (const uu of [um - 3.5, um, um + 3.5]) tube([uu, wc, PH], [uu, wc, PH + 2.35], 0.05);
        box(ca, cb, wc - 0.08, wc + 0.08, PH + 2.35, 0.22, MAT.frame);
        for (const sg of [-1, 1]) {
          for (let u = ca; u <= cb + 0.01; u += 0.9) tube([u, wc, PH + 2.55], [u, wc + sg * 1.4, PH + 2.55 + 0.33], 0.03);
          const [gx, gy] = P(um, wc + sg * 0.7); near.add(UNIT_BOX, roofGlass, tiltedPlate(gx, gy, PH + 2.72, yaw, 9.85, 1.42, sg * 0.24));
        }
        const band = new MeshStandardMaterial({ map: canvasTexture(1024, 64, (gx, w, h) => { const gr = gx.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#5aa61e'); gr.addColorStop(1, '#78be20'); gx.fillStyle = gr; gx.fillRect(0, 0, w, h); gx.fillStyle = '#fff'; gx.font = '600 34px sans-serif'; gx.fillText(pl.stopName || '', 24, 44); gx.textAlign = 'right'; gx.font = '600 26px sans-serif'; gx.fillText(pl.stopNo ? 'Stop ' + pl.stopNo : '', w - 24, 44); }) });
        box(um - 3.4, um + 3.4, wc - 0.1, wc + 0.1, PH + 2.0, 0.3, band, SIGN_Y);
        box(um + 0.88, um + 1.52, wc - 0.25, wc + 0.25, PH, 1.75, MAT.steel);   // myki machine
        if (sh.ruleBench) box(um - 1, um + 1, wc + k * 0.4, wc + k * 0.85, PH + 0.42, 0.05, MAT.steel);
        continue;
      }
      // enclosed glass shelter (Evo type, 4140 x 1700 x 2550), backed onto the fence
      const sa = um - 2.07, sb = um + 2.07, wa = sh.w, wb = wa + k * sh.depth;
      for (const uu of [sa + 0.05, sb - 0.05]) for (const ww of [wa + k * 0.05, wb - k * 0.05]) box(uu - 0.04, uu + 0.04, ww - 0.04, ww + 0.04, PH, 2.43, MAT.frame);
      box(sa - 0.1, sb + 0.1, wa, wb + k * 0.2, PH + 2.43, 0.12, MAT.frame);
      box(sa, sb, wa + k * 0.02, wa + k * 0.03, PH + 0.1, 2.25, glass);
      const ue = dep > 0 ? sa : sb, ui = dep > 0 ? sb : sa;
      box(ue - 0.06, ue + 0.06, wa, wb, PH + 0.1, 2.25, art);
      box(ui - 0.006, ui + 0.006, wa, wa + k * 1.0, PH + 0.1, 2.25, glass);
      if (sh.ruleBench) box(um - 1.2, um + 1.2, wa + k * 0.08, wa + k * 0.48, PH + 0.42, 0.05, MAT.steel);
      const up = ue + (dep > 0 ? 0.7 : -0.7); box(up - 0.5, up + 0.5, wb - k * 0.08, wb - k * 0.02, PH + 2.0, 0.34, pid, SIGN_Y);
      const us = ui + (dep > 0 ? 1.0 : -1.0); box(us - 0.3, us + 0.3, wa + k * 0.03, wa + k * 0.05, PH + 0.55, 0.42, MAT.green);
      const ub = ui + (dep > 0 ? 0.5 : -0.5); box(ub - 0.28, ub + 0.28, wa, wa + k * 0.565, PH, 1.04, bin);
    }
    // PTV totem at the departure end
    const ut = dep > 0 ? mEnd - 1.2 : mStart + 1.2, wm = (pl.w[0] + pl.w[1]) / 2 + k * 0.3;
    box(ut - 0.06, ut + 0.06, wm - 0.3, wm + 0.3, PH, 2.6, MAT.green); box(ut - 0.065, ut + 0.065, wm - 0.28, wm + 0.28, PH + 2.1, 0.4, MAT.white);
  }
  return { always: quiet(always), mid: quiet(await mid.build('tram-mid')), near: quiet(await near.build('tram-near')) };
}

/** A thin plate centred at (x, y, z), length along `yaw`, rolled by `roll` about its length (rising outward). */
function tiltedPlate(x: number, y: number, z: number, yaw: number, len: number, wid: number, roll: number): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(roll, 0, yaw, 'ZXY'));
  return new Matrix4().compose(new Vector3(x, y, z), q, new Vector3(len, wid, 0.015));
}
