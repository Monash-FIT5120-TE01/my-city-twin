/*
 * TRAM MODELS — one per class, built once and drawn instanced.
 *
 * The shapes are the parametric trams of the streetscape mock (ProjectDoc/streetscape/11-trams-rolling-stock.md:
 * sizes from Yarra Trams CE-019-ST-0006, livery and interior from photos). They are built as one group in the
 * mock's frame (+x along the tram towards its front, y up from the rail top, z across), then cut into the
 * body sections (an articulated tram bends between them on a curve), each merged into one geometry per
 * material and turned into the streetscape's frame (+x forward, +y left, +z up), centred on the section.
 * The interior is kept apart: it is drawn only for the tram being ridden.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRAM_CLASSES, type ClassKey, type TramClass } from './tramClasses';

export interface Part { geo: BufferGeometry; mat: Material }
export interface Section { centre: number; len: number; outside: Part[]; inside: Part[] }
export interface TramKit {
  cls: TramClass;
  /** Back to front, as TramClass.secs. */
  sections: Section[];
  /** Door centres along the tram from its middle (+ towards the front), and widths. */
  doors: { x: number; w: number }[];
  /** The glass of the windows and doors: drawn see-through for the tram being ridden. */
  glass: Material;
}

const canvas = (w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d') as CanvasRenderingContext2D, w, h);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = RepeatWrapping; return t;
};

let mats: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  // PTV "network pattern": faceted greens (Tram Green #78BE20 and darker/lighter greens; exact set EST from photos)
  const pattern = canvas(512, 256, (g) => {
    const greens = ['#78be20', '#5aa62a', '#3f8f2f', '#2d7a34', '#8fcb3c', '#a6d65a', '#4e9e2c'];
    g.fillStyle = '#5aa62a'; g.fillRect(0, 0, 512, 256);
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts: [number, number][] = []; for (let i = 0; i < 70; i++) pts.push([rnd() * 512, rnd() * 256]);
    for (let i = 0; i < 160; i++) {
      const a = pts[Math.floor(rnd() * 70)], b = pts[Math.floor(rnd() * 70)], c = pts[Math.floor(rnd() * 70)];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 220 || Math.hypot(a[0] - c[0], a[1] - c[1]) > 220) continue;
      g.fillStyle = greens[Math.floor(rnd() * greens.length)]; g.globalAlpha = 0.85; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.lineTo(...c); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  });
  const logo = canvas(256, 96, (g) => {
    g.fillStyle = '#f2f3f0'; g.fillRect(0, 0, 256, 96); g.fillStyle = '#333434'; g.font = 'bold 64px sans-serif'; g.fillText('PT', 20, 72);
    g.strokeStyle = '#e4222e'; g.lineWidth = 10; g.beginPath(); g.moveTo(120, 30); g.lineTo(150, 50); g.lineTo(120, 70); g.stroke();
  });
  const moquette = canvas(128, 128, (x, w, h) => {
    x.fillStyle = '#1f8a3a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#0f3d20'; x.lineWidth = 3;
    for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(0, 20 + k * 25); x.bezierCurveTo(40, k * 25, 80, 40 + k * 25, 128, 15 + k * 25); x.stroke(); }
    x.strokeStyle = '#e5c21a'; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(10 + k * 40, 0); x.lineTo(40 + k * 40, 128); x.stroke(); }
    x.fillStyle = '#e5c21a'; for (let k = 0; k < 40; k++) { x.beginPath(); x.arc((k * 37) % 128, (k * 53) % 128, 2.5, 0, 7); x.fill(); }
  });
  const m = (c: string, o: Partial<MeshStandardMaterial> = {}) => Object.assign(new MeshStandardMaterial({ color: c, roughness: 0.55 }), o);
  const im = (c: string, o: Partial<MeshStandardMaterial> = {}) => Object.assign(new MeshStandardMaterial({ color: c, roughness: 0.75 }), o);
  return {
    white: m('#f2f3f0'), green: m('#78be20'), glass: m('#33404a', { roughness: 0.12, metalness: 0.45 }),
    door: m('#d4d82a'), lime: m('#b6d433'), roofband: m('#6cb52d'), skirtHi: m('#62666a'), bumper: m('#2b2d2f'),
    bogie: m('#202224', { roughness: 0.8 }), bellows: m('#1a1a1a', { roughness: 0.9 }), roof: m('#b9bcbf'),
    w8green: m('#2e5e3a'), w8cream: m('#e9ddb5'), w8red: m('#6b1f1a'), pan: m('#5a5e61', { metalness: 0.5 }),
    pattern: new MeshStandardMaterial({ map: pattern, roughness: 0.5 }), logo: new MeshStandardMaterial({ map: logo }),
    dest: m('#111111', { emissive: new Color('#ffb000'), emissiveIntensity: 0.15 }),
    // inside
    floor: im('#7d878f', { roughness: 0.9 }), wall: im('#e6e8e6'), ceil: im('#f4f4f2'), shell: im('#dfe2e2', { roughness: 0.4 }),
    cushion: new MeshStandardMaterial({ map: moquette, roughness: 0.9 }), plinth: im('#8a9096'), pole: im('#f2c500', { roughness: 0.35 }), frame: im('#2b2f33'),
    w8floor: im('#3b3632'), w8wall: im('#7a4b2a', { roughness: 0.6 }), w8ceil: im('#efe3c4'), w8shell: im('#5a3a22'), w8cushion: im('#2f6b4a', { roughness: 0.5 }),
    w8pole: im('#e0b81e', { roughness: 0.35 }),
    light: new MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.8 }), yellowLine: im('#e8c200'), myki: im('#b8d22c'),
    pid: new MeshStandardMaterial({ color: '#111111', emissive: '#ff9a00', emissiveIntensity: 0.6 }),
  };
}

/** The tram as one group in the mock's frame; the interior under a child group named 'interior'. */
function build(C: TramClass, wire: number): Group {
  const M = (mats ??= makeMats());
  const g = new Group();
  const W = C.W, H = C.H, L = C.L, belt = C.floor + 0.85, top = H - 0.42, GAP = 0.22;
  const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Material, into: Group = g) => {
    if (Math.abs(x1 - x0) < 0.005) return null;
    const b = new Mesh(new BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); into.add(b); return b;
  };
  const upper = C.livery === 'w8' ? M.w8cream : M.white;
  const noseOf = { w: 0.05, rake: 0.45, round: 0.6, flat: 0.12 }[C.nose];
  // body sections: side profile extruded across the width; cab ends shaped by the nose type
  let x = -L / 2;
  C.secs.forEach((len, i) => {
    const x0 = x + (i ? GAP / 2 : 0), x1 = x + len - (i < C.secs.length - 1 ? GAP / 2 : 0), first = i === 0, last = i === C.secs.length - 1;
    const sh = new Shape(), y0 = C.floor - 0.25, nose = noseOf;
    sh.moveTo(x0 + (first ? 0.1 : 0), y0); sh.lineTo(x1 - (last ? 0.1 : 0), y0);
    if (last) { sh.lineTo(x1, belt); if (C.nose === 'round') sh.quadraticCurveTo(x1 - nose * 0.2, H - 0.2, x1 - nose, H); else sh.lineTo(x1 - nose, H); } else sh.lineTo(x1, H);
    if (first) { sh.lineTo(x0 + nose, H); if (C.nose === 'round') sh.quadraticCurveTo(x0 + nose * 0.2, H - 0.2, x0, belt); else sh.lineTo(x0, belt); } else sh.lineTo(x0, H);
    sh.lineTo(x0 + (first ? 0.1 : 0), y0);
    const geo = new ExtrudeGeometry(sh, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2, curveSegments: 8 });
    geo.translate(0, 0, -(W - 0.12) / 2);
    g.add(new Mesh(geo, upper));
    // PTV livery (photos): white body; faceted green pattern on alternating modules or, on one-piece bodies,
    // behind the front cab to ~45 % and at the rear ~15 %; a green band along the roof line; grey skirt
    const hiFloor = C.floor > 0.5, cab = hiFloor ? 1.4 : 2.3, greenSpans: [number, number][] = [];
    if (C.livery === 'ptv') {
      if (C.secs.length === 1 || hiFloor) greenSpans.push([-L / 2 + cab, -L / 2 + 0.45 * L], [L / 2 - 0.17 * L, L / 2 - cab]);
      else if (i % 2 === 0) greenSpans.push([first ? x0 + cab : x0 + 0.05, last ? x1 - cab : x1 - 0.05]);
    }
    for (const sz of [-1, 1]) {
      const z = sz * (W / 2 + 0.004);
      if (C.livery === 'w8') { box(x0 + 0.2, x1 - 0.2, y0, belt - 0.05, z - 0.003, z + 0.003, M.w8green); box(x0 + 0.2, x1 - 0.2, H - 0.3, H - 0.18, z - 0.003, z + 0.003, M.w8green); continue; }
      const yTop = H - 0.22, yBot = hiFloor ? C.floor + 0.02 : y0 + 0.12;
      for (const [a0, a1] of greenSpans) {
        const a = Math.max(a0, x0), b = Math.min(a1, x1); if (b - a < 0.2) continue;
        const pg = new PlaneGeometry(b - a, yTop - yBot), uv = pg.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, (uv.getX(q) * (b - a) + a) / 4.0, (uv.getY(q) * (yTop - yBot)) / 2.2);
        const pm = new Mesh(pg, M.pattern); pm.position.set((a + b) / 2, (yTop + yBot) / 2, z); pm.rotation.y = sz > 0 ? 0 : Math.PI; g.add(pm);
      }
      box(x0 + (first ? nose : 0.05), x1 - (last ? nose : 0.05), H - 0.24, H - 0.04, z - 0.002, z + 0.002, M.roofband);
      if (hiFloor) box(x0 + 0.1, x1 - 0.1, y0, C.floor + 0.02, z - 0.003, z + 0.003, M.skirtHi); else box(x0 + 0.1, x1 - 0.1, y0, y0 + 0.12, z - 0.003, z + 0.003, M.skirtHi);
      if (first || last) { const xs = first ? x0 + 0.3 : x1 - 2.0; box(xs, xs + 1.7, C.floor + 0.5, C.floor + 0.58, z - 0.003, z + 0.003, M.lime); }
    }
    if (C.floor < 0.5) box(x0 + 0.8, x1 - 0.8, H + 0.02, H + 0.32, -0.75, 0.75, M.roof); else box(x0 + 0.5, x1 - 0.5, H + 0.01, H + 0.06, -0.9, 0.9, M.roof);
    x += len;
    if (!last) box(x - GAP / 2 - 0.02, x + GAP / 2 + 0.02, y0 + 0.1, H - 0.1, -W / 2 + 0.15, W / 2 - 0.15, M.bellows);
  });
  // doors (both sides) and windows split by them
  const doorAt = C.doors.map(([f, w, kind]) => ({ x: -L / 2 + f * L, w, kind })), openings: [number, number][] = [];
  for (const sz of [-1, 1]) {
    const z = sz * (W / 2 + 0.008);
    for (const d of doorAt) {
      const y0 = d.kind === 'drop' ? 0.45 : C.floor + 0.02;
      box(d.x - d.w / 2, d.x + d.w / 2, y0, top + 0.05, z - 0.004, z + 0.004, C.livery === 'w8' ? M.bogie : M.door);
      box(d.x - d.w / 2 + 0.06, d.x + d.w / 2 - 0.06, belt - 0.15, top - 0.05, z - 0.006, z + 0.006, M.glass);
      if (d.w > 1) box(d.x - 0.01, d.x + 0.01, y0, top + 0.05, z - 0.007, z + 0.007, M.bogie);
    }
    const cuts = [-L / 2 + 1.1, ...doorAt.flatMap((d) => [d.x - d.w / 2 - 0.12, d.x + d.w / 2 + 0.12]), L / 2 - 1.1].sort((a, b) => a - b);
    for (let k = 0; k < cuts.length - 1; k += 2) {
      const a = cuts[k], b = cuts[k + 1]; if (b - a < 0.4) continue;
      if (C.windows === 'band') { box(a, b, belt, top, z - 0.005, z + 0.005, M.glass); if (sz > 0) openings.push([a, b]); }
      else {
        const pane = C.windows === 'big' ? 1.6 : 0.95, n = Math.max(1, Math.round((b - a) / pane)), pw = (b - a) / n;
        for (let q = 0; q < n; q++) { box(a + q * pw + 0.06, a + (q + 1) * pw - 0.06, belt + (C.windows === 'single' ? 0.05 : 0), top, z - 0.005, z + 0.005, M.glass); if (sz > 0) openings.push([a + q * pw + 0.06, a + (q + 1) * pw - 0.06]); }
      }
    }
  }
  // windscreens, destination boxes, bumpers, logos at both ends
  for (const sx of [-1, 1]) {
    const inset = noseOf, hgt = H - 0.25 - belt, ws = new Mesh(new PlaneGeometry(W - 0.35, Math.hypot(hgt, inset) * 0.86), M.glass);
    const tilt = Math.atan2(inset, hgt); ws.rotation.order = 'YXZ'; ws.rotation.y = (sx * Math.PI) / 2; ws.rotation.x = -tilt;
    const out = C.nose === 'round' ? 0.34 : 0.08;
    ws.position.set(sx * (L / 2 - inset * 0.45 + out * Math.cos(tilt)), belt + hgt * 0.45 + out * Math.sin(tilt), 0); g.add(ws);
    const ds = new Mesh(new PlaneGeometry(1.4, 0.22), M.dest); ds.position.set(sx * (L / 2 - inset + 0.04), H - 0.17, 0); ds.rotation.y = (sx * Math.PI) / 2; g.add(ds);
    box((sx * L) / 2 - 0.08, (sx * L) / 2 + 0.08, C.floor - 0.25, C.floor + 0.1, -W / 2 + 0.2, W / 2 - 0.2, C.livery === 'w8' ? M.w8red : C.floor > 0.5 ? M.skirtHi : M.bumper);
    if (C.livery === 'ptv') {
      box(sx * (L / 2 + 0.005) - 0.01, sx * (L / 2 + 0.005) + 0.01, C.floor + 0.5, C.floor + 0.58, -W / 2 + 0.15, W / 2 - 0.15, M.lime);
      const lg = new Mesh(new PlaneGeometry(0.55, 0.2), M.logo); lg.position.set(sx * (L / 2 + 0.02), C.floor + 0.32, -sx * 0.6); lg.rotation.y = (sx * Math.PI) / 2; g.add(lg);
    }
  }
  // bogies and wheels
  for (const bx of C.bogies) {
    box(bx - 1.1, bx + 1.1, 0.18, C.floor < 0.5 ? C.floor - 0.03 : 0.75, -W / 2 + 0.35, W / 2 - 0.35, M.bogie);
    for (const wx of [-0.9, 0.9]) for (const wz of [-0.7175, 0.7175]) { const wh = new Mesh(new CylinderGeometry(0.3, 0.3, 0.12, 12), M.bogie); wh.rotation.x = Math.PI / 2; wh.position.set(bx + wx, 0.3, wz); g.add(wh); }
  }
  // pantograph up to the contact wire
  const px = C.secs.length > 1 ? -L / 2 + C.secs[0] + C.secs[1] / 2 : 0, base = H + (C.floor < 0.5 ? 0.32 : 0.06);
  box(px - 0.5, px + 0.5, base, base + 0.12, -0.45, 0.45, M.pan);
  const arm = (x0: number, y0: number, x1: number, y1: number) => { const dx = x1 - x0, dy = y1 - y0, a = new Mesh(new BoxGeometry(Math.hypot(dx, dy), 0.04, 0.04), M.pan); a.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); a.rotation.z = Math.atan2(dy, dx); g.add(a); };
  const mid = (base + 0.12 + wire) / 2; arm(px - 0.4, base + 0.12, px + 0.25, mid); arm(px + 0.25, mid, px - 0.05, wire - 0.04);
  box(px - 0.12, px + 0.12, wire - 0.05, wire, -0.9, 0.9, M.pan);

  // ── interior (the mock's, from interior photos; seat counts and spacing EST) ──
  const inside = new Group(); inside.name = 'interior'; g.add(inside);
  const w8 = C.livery === 'w8', low = C.floor < 0.5;
  const MI = w8 ? { floor: M.w8floor, wall: M.w8wall, ceil: M.w8ceil, shell: M.w8shell, cushion: M.w8cushion, plinth: M.w8floor, pole: M.w8pole, frame: M.w8shell }
    : { floor: M.floor, wall: M.wall, ceil: M.ceil, shell: M.shell, cushion: M.cushion, plinth: M.plinth, pole: M.pole, frame: M.frame };
  const ib = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Material) => box(x0, x1, y0, y1, z0, z1, mat, inside);
  const rod = (a: Vector3, b: Vector3, r = 0.019) => { const d = b.clone().sub(a), c = new Mesh(new CylinderGeometry(r, r, d.length(), 6), MI.pole); c.position.copy(a).addScaledVector(d, 0.5); c.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()); inside.add(c); };
  const V = (xx: number, y: number, z: number) => new Vector3(xx, y, z);
  const xin0 = -L / 2 + 1.6, xin1 = L / 2 - 1.6, zi = W / 2 - 0.09, F = C.floor, ceil = H - 0.2;
  ib(xin0, xin1, F - 0.03, F, -zi, zi, MI.floor);
  ib(xin0, xin1, ceil, ceil + 0.03, -zi + 0.35, zi - 0.35, MI.ceil);
  for (const sz of [-1, 1]) { const cv = ib(xin0, xin1, ceil - 0.15, ceil, sz * (zi - 0.2) - 0.18, sz * (zi - 0.2) + 0.18, MI.ceil); if (cv) cv.rotation.x = sz * 0.5; ib(xin0 + 0.3, xin1 - 0.3, ceil - 0.1, ceil - 0.07, sz * (zi - 0.42) - 0.05, sz * (zi - 0.42) + 0.05, w8 ? MI.ceil : M.light); }
  const doorsX = doorAt.map((d) => [d.x - d.w / 2, d.x + d.w / 2] as [number, number]);
  for (const sz of [-1, 1]) {
    const z = sz * zi, zf = sz * (zi - 0.02);
    ib(xin0, xin1, top + 0.02, ceil, z - 0.01, z + 0.01, MI.wall);
    let cx = xin0; for (const [a, b] of [...doorsX].sort((p, q) => p[0] - q[0])) { ib(cx, Math.min(a, xin1), F, belt + 0.02, z - 0.01, z + 0.01, MI.wall); cx = Math.max(cx, b); } ib(cx, xin1, F, belt + 0.02, z - 0.01, z + 0.01, MI.wall);
    const hs = [...openings, ...doorsX].map((h) => [Math.max(xin0, h[0]), Math.min(xin1, h[1])]).filter((h) => h[1] > h[0]).sort((p, q) => p[0] - q[0]);
    let qx = xin0; for (const [a, b] of hs) { ib(qx, a, belt + 0.02, top + 0.02, z - 0.01, z + 0.01, MI.wall); qx = Math.max(qx, b); } ib(qx, xin1, belt + 0.02, top + 0.02, z - 0.01, z + 0.01, MI.wall);
    for (const [a, b] of openings) { if (b < xin0 || a > xin1) continue; ib(a, b, belt, belt + 0.05, zf - 0.03, zf + 0.03, MI.frame); ib(a, b, top - 0.03, top + 0.02, zf - 0.03, zf + 0.03, MI.frame); }
  }
  for (const sx of [-1, 1]) { const xe = sx > 0 ? xin1 : xin0; ib(xe - 0.03, xe + 0.03, F, ceil, -zi, zi, MI.wall); }
  if (!w8) {
    let ax = -L / 2;
    C.secs.slice(0, -1).forEach((len) => {
      ax += len; const tp = new Mesh(new CircleGeometry(0.75, 20), MI.plinth); tp.rotation.x = -Math.PI / 2; tp.position.set(ax, F + 0.003, 0); inside.add(tp);
      for (const sz of [-1, 1]) ib(ax - 0.25, ax + 0.25, F, ceil, sz * (zi - 0.05) - 0.03, sz * (zi - 0.05) + 0.03, MI.plinth);
      ib(ax - 0.25, ax + 0.25, ceil - 0.05, ceil, -zi, zi, MI.plinth); ib(ax - 0.06, ax + 0.06, ceil - 0.42, ceil - 0.2, -0.55, 0.55, M.pid);
    });
  }
  const seat = (xx: number, zz: number, face: number, y0: number) => {
    ib(xx - 0.23, xx + 0.23, y0, y0 + 0.06, zz - 0.23, zz + 0.23, MI.shell); ib(xx - 0.21, xx + 0.21, y0 + 0.06, y0 + 0.11, zz - 0.21, zz + 0.21, MI.cushion);
    const bx = xx - face * 0.24; ib(bx - 0.03, bx + 0.03, y0 + 0.06, y0 + 0.68, zz - 0.23, zz + 0.23, MI.shell); ib(bx + face * 0.035 - 0.012, bx + face * 0.035 + 0.012, y0 + 0.14, y0 + 0.62, zz - 0.2, zz + 0.2, MI.cushion);
  };
  const SEAT_H = 0.42;
  const stops = [xin0 + 0.15, ...doorsX.flatMap(([a, b]) => [a - 0.45, b + 0.45]), xin1 - 0.15].sort((p, q) => p - q);
  const perSide = low || w8 ? 1 : 2, zSeat = (sz: number, k: number) => sz * (zi - 0.3 - k * 0.48);
  for (let k = 0; k < stops.length - 1; k += 2) {
    const a = stops[k], b = stops[k + 1]; if (b - a < 1.0) continue;
    const n = Math.max(2, Math.floor((b - a) / 0.85)), pitch = (b - a) / n, plinthH = low ? 0.34 : 0;
    for (const sz of [-1, 1]) {
      if (low) ib(a, b, F, F + plinthH, sz * zi - sz * 0.02, sz * (zi - 0.3 - (perSide - 1) * 0.48 - 0.26), MI.plinth);
      for (let q = 0; q < n; q++) { const xx = a + (q + 0.5) * pitch, face = q % 2 ? -1 : 1; for (let s2 = 0; s2 < perSide; s2++) seat(xx, zSeat(sz, s2), face, F + plinthH + SEAT_H - 0.11); }
    }
    if (!w8) for (const xx of [a + 0.1, b - 0.1]) { rod(V(xx, F, 0), V(xx, ceil - 0.55, 0)); rod(V(xx, ceil - 0.55, 0), V(xx, ceil - 0.3, 0.45)); rod(V(xx, ceil - 0.55, 0), V(xx, ceil - 0.3, -0.45)); }
    else for (const xx of [a + 0.1, b - 0.1]) for (const sz of [-1, 1]) rod(V(xx, F, sz * 0.55), V(xx, ceil, sz * 0.55));
  }
  if (low) for (const bx of C.bogies) for (const sz of [-1, 1]) ib(Math.max(xin0, bx - 1.25), Math.min(xin1, bx + 1.25), F, F + 0.34, sz * zi - sz * 0.02, sz * (zi - 0.56), MI.plinth);
  for (const sz of [-1, 1]) rod(V(xin0 + 0.2, ceil - 0.3, sz * 0.45), V(xin1 - 0.2, ceil - 0.3, sz * 0.45), 0.017);
  for (let x2 = xin0 + 0.6; x2 < xin1; x2 += 1.8) rod(V(x2, ceil - 0.3, -0.45), V(x2, ceil - 0.3, 0.45), 0.015);
  doorAt.forEach((d, di) => {
    for (const sz of [-1, 1]) for (const e of [-1, 1]) { const xx = d.x + e * (d.w / 2 + 0.12), zz = sz * (zi - 0.12); rod(V(xx, F + 0.75, zz), V(xx, F + 1.75, zz), 0.017); if (e < 0 && !w8) ib(xx - 0.06, xx + 0.06, F + 1.0, F + 1.22, zz - sz * 0.08 - 0.03, zz - sz * 0.08 + 0.03, M.myki); }
    if (low && di % 2 === 0) for (const sz of [-1, 1]) {
      const z0 = sz * (zi - 0.15), z1 = sz * (zi - 1.0);
      for (const [xa, xb, za, zb] of [[d.x - 0.65, d.x + 0.65, z0, z0], [d.x - 0.65, d.x + 0.65, z1, z1], [d.x - 0.65, d.x - 0.65, z0, z1], [d.x + 0.65, d.x + 0.65, z0, z1]]) ib(Math.min(xa, xb) - 0.02, Math.max(xa, xb) + 0.02, F + 0.001, F + 0.004, Math.min(za, zb) - 0.02, Math.max(za, zb) + 0.02, M.yellowLine);
    }
  });
  if (w8) for (let x2 = xin0 + 0.4; x2 < xin1; x2 += 0.5) for (const sz of [-1, 1]) ib(x2 - 0.02, x2 + 0.02, ceil - 0.55, ceil - 0.3, sz * 0.45 - 0.02, sz * 0.45 + 0.02, MI.cushion);
  return g;
}

const kits = new Map<ClassKey, TramKit>();
let plainMat: MeshStandardMaterial | null = null;
/** The class's model, cut into sections and merged (built on first use). */
export function kitFor(key: ClassKey, wire = 5.64): TramKit {
  const have = kits.get(key); if (have) return have;
  const C = TRAM_CLASSES[key], g = build(C, wire);
  g.updateMatrixWorld(true);
  const interior = g.getObjectByName('interior')!;
  // section boundaries along x (back to front)
  const bounds: number[] = [-C.L / 2]; for (const len of C.secs) bounds.push(bounds[bounds.length - 1] + len);
  const sections = C.secs.map((len, i) => ({ centre: (bounds[i] + bounds[i + 1]) / 2, len, out: new Map<Material, BufferGeometry[]>(), inn: new Map<Material, BufferGeometry[]>() }));
  const centre = new Vector3();
  g.traverse((o) => {
    const m = o as Mesh; if (!m.isMesh) return;
    let inInterior = false; for (let p = m.parent; p; p = p.parent) if (p === interior) inInterior = true;
    m.geometry.computeBoundingBox(); m.geometry.boundingBox!.getCenter(centre).applyMatrix4(m.matrixWorld);
    let i = 0; while (i < sections.length - 1 && centre.x > bounds[i + 1]) i++;
    const sec = sections[i];
    // mock frame (x along, y up, z across) -> streetscape (x forward, y left, z up), centred on the section
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld).translate(-sec.centre, 0, 0).rotateX(Math.PI / 2);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    const bucket = inInterior ? sec.inn : sec.out, mat = m.material as Material;
    if (!bucket.has(mat)) bucket.set(mat, []); bucket.get(mat)!.push(geo);
    m.geometry.dispose();
  });
  // Outside, every plain-coloured part (body, doors, roof, skirt, bogies...) becomes one geometry coloured per
  // vertex: a tram is then five draw calls a section (plain, pattern, logo, destination, glass), not fifteen.
  const plain = (plainMat ??= new MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  const isPlain = (mat: Material) => { const m = mat as MeshStandardMaterial; return !m.map && m.emissiveIntensity === 1 && m.emissive.getHex() === 0 && mat !== (mats ??= makeMats()).glass; };
  for (const sec of sections) {
    const coloured: BufferGeometry[] = [];
    for (const [mat, geos] of [...sec.out]) {
      if (!isPlain(mat)) continue;
      const c = (mat as MeshStandardMaterial).color;
      for (const g0 of geos) { const n = g0.attributes.position.count, col = new Float32Array(n * 3); for (let k = 0; k < n; k++) { col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; } g0.setAttribute('color', new Float32BufferAttribute(col, 3)); coloured.push(g0); }
      sec.out.delete(mat);
    }
    if (coloured.length) sec.out.set(plain, coloured);
  }
  const merge = (map: Map<Material, BufferGeometry[]>): Part[] => [...map].map(([mat, geos]) => {
    const indexed = geos.every((x) => x.index), list = indexed ? geos : geos.map((x) => (x.index ? x.toNonIndexed() : x));
    const geo = mergeGeometries(list, false)!; geo.computeBoundingSphere(); return { geo, mat };
  });
  const kit: TramKit = {
    cls: C, glass: (mats ??= makeMats()).glass,
    sections: sections.map((s) => ({ centre: s.centre, len: s.len, outside: merge(s.out), inside: merge(s.inn) })),
    doors: C.doors.map(([f, w]) => ({ x: -C.L / 2 + f * C.L, w })),
  };
  kits.set(key, kit);
  return kit;
}
