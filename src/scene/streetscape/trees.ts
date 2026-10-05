/*
 * STREET TREES AND THEIR PLANTERS
 *
 * Positions and heights: the team tree handoff (2026-10-03), 2,682 trees. Heights are used for the
 * picture only; the 874 trees without a height are sized at draw time from the trunk diameter, and that
 * size is never stored or shown as data. Trees are NOT in the sunlight figures and cast no shadow.
 *
 * Crowns are leaf cards: ~30 fixed-orientation planes per tree with a leaf-cluster texture (built from the
 * CC0 ambientCG LeafSet010), darker inside and below. Crowns stay at least 3 m above the footway.
 *
 * LEVELS OF DETAIL (lod.ts): the 30-card crown and the limbs within DIST.crowns of the camera; beyond it a
 * five-card crown (three upright cards crossed at 60 degrees, two flat) of the same size and shade. Trunks to
 * DIST.tall. Planter rails' posts and plants to DIST.small, like the rest of the planter.
 *
 * Planters (street photos of the CBD): every tree on a footway stands in a raised planter, a bluestone kerb
 * round the pit outline (~0.25 m wide, ~0.2 m above the footway), dark soil with sparse leafy plants, and a
 * low stainless rail (posts ~0.9 m apart, one top rail ~0.3 m above the kerb). No rail on a planter end
 * that has a seat. The outline is the surveyed footway cut-out where the tree has one, else a 1.7 m square
 * (CoM DS 501.04). Trees off the footway (squares, parks) grow straight out of the ground.
 */
import {
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Euler,
  Color,
  Path,
  Shape,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  RepeatWrapping,
} from 'three';
import { bundled } from '../../data/bundled';
import { Batch, MAT, UNIT_ROD, at, quiet, rodBetween, ringInset, inRing, slice, type XY } from './kit';
import { CompactBuilder, DIST, ItemSet, type CompactGroup } from './lod';

export interface TreesDoc {
  /** [east, north, height m | null, dbh cm | null, height known 1/0] */
  trees: [number, number, number | null, number | null, number][];
  planters: { ring: XY[]; c: XY; ax: XY; hl: number; hw: number; surveyed: boolean; seatEnds: number[] }[];
}

const FOOTWAY_TOP = 0.14, KERB_TOP = FOOTWAY_TOP + 0.2, SOIL_TOP = KERB_TOP - 0.07, RAIL_H = 0.3;
const CARDS = 30;

function ringShape(outer: XY[], hole?: XY[]): Shape {
  const s = new Shape(); s.moveTo(outer[0][0], outer[0][1]); for (let i = 1; i < outer.length; i++) s.lineTo(outer[i][0], outer[i][1]);
  if (hole) { const p = new Path(); p.moveTo(hole[0][0], hole[0][1]); for (let i = 1; i < hole.length; i++) p.lineTo(hole[i][0], hole[i][1]); s.holes.push(p); }
  return s;
}

export async function buildTrees(doc: TreesDoc): Promise<{ always: Group; near: Group; groups: CompactGroup[] }> {
  const always = new Group(); always.name = 'trees';
  const loader = new TextureLoader();
  const leaf = loader.load(bundled('textures/streetscape/leaf-cluster.png')); leaf.colorSpace = SRGBColorSpace; leaf.anisotropy = 4;
  const bark = loader.load(bundled('textures/streetscape/bark.jpg')); bark.colorSpace = SRGBColorSpace; bark.wrapS = bark.wrapT = RepeatWrapping; bark.repeat.set(1, 3);
  const cardMat = new MeshStandardMaterial({ map: leaf, alphaTest: 0.45, side: DoubleSide, roughness: 0.9 });
  const trunkMat = new MeshStandardMaterial({ map: bark, roughness: 0.95 });
  const trunkGeo = (() => { const g = new CylinderGeometry(0.16, 0.24, 1, 8, 1); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return g; })();

  const n = doc.trees.length, cardGeo = new PlaneGeometry(1, 1);
  const trunks = new CompactBuilder(trunkGeo, trunkMat, n), limbs = new CompactBuilder(UNIT_ROD, trunkMat, n);
  const cards = new CompactBuilder(cardGeo, cardMat, n, true), farCards = new CompactBuilder(cardGeo, cardMat, n, true);
  let seed = 1; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pos = new Vector3(), q = new Quaternion(), sc = new Vector3(), m = new Matrix4(), col = new Color(), e = new Euler();
  for (const [i, [x, y, hData, dbh]] of doc.trees.entries()) {
    await slice();
    const h = hData ?? Math.min(18, Math.max(5, 4 + (dbh ?? 30) * 0.18));   // display only, never stored
    const r = Math.min(6.5, 1.6 + (dbh ?? 30) * 0.09);
    const clear = h >= 6 ? Math.max(3.0, Math.min(4.5, h * 0.3)) : h * 0.4;   // crown kept >= 3 m above the footway
    const vr = Math.max(1.2, (h - clear) / 2);
    trunks.push(i, at(x, y, FOOTWAY_TOP, 0, 1, 1, clear + vr * 0.6));
    for (let k = 0; k < 4; k++) {
      const a = rand() * Math.PI * 2, len = r * 0.75, z0 = clear + vr * 0.25;
      limbs.push(i, rodBetween(new Vector3(x, y, z0), new Vector3(x + Math.cos(a) * len * 0.7, y + Math.sin(a) * len * 0.7, z0 + len * 0.6), 0.07));
    }
    // far crown: three upright cards crossed at 60 degrees and two flat ones, filling the same volume
    const zc = clear + vr, turn = rand() * Math.PI;
    for (let k = 0; k < 3; k++) {
      pos.set(x, y, zc); q.setFromEuler(e.set(Math.PI / 2, 0, turn + (k * Math.PI) / 3, 'ZXY')); sc.set(2 * r * 1.1, 2 * vr * 1.15, 1);   // the leaf texture has clear margins: a little larger than the crown
      farCards.push(i, m.compose(pos, q, sc), col.setRGB(0.9, 0.9, 0.9));
    }
    for (const [dz, f, light] of [[0, 1.05, 0.85], [vr * 0.55, 0.75, 1]] as const) {   // as bright as the full crown's mean
      pos.set(x, y, zc + dz); q.setFromEuler(e.set(0, 0, turn, 'ZXY')); sc.set(2 * r * f, 2 * r * f, 1);
      farCards.push(i, m.compose(pos, q, sc), col.setRGB(light, light, light));
    }
    for (let k = 0; k < CARDS; k++) {
      let cx, cy, cz; do { cx = rand() * 2 - 1; cy = rand() * 2 - 1; cz = rand() * 2 - 1; } while (cx * cx + cy * cy + cz * cz > 1);
      const shell = Math.sqrt(cx * cx + cy * cy + cz * cz);
      pos.set(x + cx * r * 0.85, y + cy * r * 0.85, Math.max(clear + 0.4, clear + vr + cz * vr * 0.85));
      q.setFromEuler(e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI));
      const size = Math.min(r * (0.9 + rand() * 0.5), 2 * (pos.z - clear) + 1.2); sc.set(size, size, size);
      const light = 0.55 + 0.35 * shell + 0.15 * (cz + 1) / 2;
      cards.push(i, m.compose(pos, q, sc), col.setRGB(light, light, light));
    }
  }
  const near = cards.build('tree-crowns'), far = farCards.build('tree-crowns-far'), trunkMesh = trunks.build('tree-trunks'), limbMesh = limbs.build('tree-limbs');
  for (const c of [near, far, trunkMesh, limbMesh]) { c.mesh.receiveShadow = true; always.add(c.mesh); }
  const points = doc.trees.map(([x, y]) => [x, y]);
  const groups: CompactGroup[] = [
    { items: new ItemSet(points), within: DIST.crowns, parts: [[near, false], [far, true], [limbMesh, false]] },
    { items: new ItemSet(points), within: DIST.tall, parts: [[trunkMesh, false]] },
  ];

  // planters: kerb, soil, rails and shrubs, batched by cell (near band only)
  const batch = new Batch(), posts: [number, XY][] = [], shrubs: [number, number, number, number, number, number][] = [];
  const steelRod = MAT.steel;
  for (const [pi, pl] of doc.planters.entries()) {
    await slice();
    const inner = ringInset(pl.ring, 0.25);
    batch.add(new ExtrudeGeometry(ringShape(pl.ring, inner), { depth: KERB_TOP, bevelEnabled: false }), MAT.planterKerb, new Matrix4(), pl.c);
    batch.add(new ExtrudeGeometry(ringShape(inner), { depth: SOIL_TOP, bevelEnabled: false }), MAT.soil, new Matrix4(), pl.c);
    // which ring sides carry a seat: the side furthest along the planter axis at each seat end
    const skip = new Set<number>();
    for (const sg of pl.seatEnds) { let best = 0, far = -1e9; for (let k = 0; k < pl.ring.length - 1; k++) { const mx = (pl.ring[k][0] + pl.ring[k + 1][0]) / 2 - pl.c[0], my = (pl.ring[k][1] + pl.ring[k + 1][1]) / 2 - pl.c[1], d = (mx * pl.ax[0] + my * pl.ax[1]) * sg; if (d > far) { far = d; best = k; } } skip.add(best); }
    const rail = ringInset(pl.ring, 0.06);
    for (let k = 0; k < rail.length - 1; k++) {
      if (skip.has(k)) continue;
      const a = rail[k], b = rail[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nP = Math.max(1, Math.round(L / 0.9));
      for (let s = 0; s <= nP; s++) posts.push([pi, [a[0] + (b[0] - a[0]) * s / nP, a[1] + (b[1] - a[1]) * s / nP]]);
      batch.add(UNIT_ROD, steelRod, rodBetween(new Vector3(a[0], a[1], KERB_TOP + RAIL_H), new Vector3(b[0], b[1], KERB_TOP + RAIL_H), 0.012));
    }
    // sparse leafy plants, about 8 cards per m2
    let A = 0; for (let k = 0; k < inner.length - 1; k++) A += inner[k][0] * inner[k + 1][1] - inner[k + 1][0] * inner[k][1]; A = Math.abs(A / 2);
    const xs = inner.map((p) => p[0]), ys = inner.map((p) => p[1]);
    for (let t = 0, made = 0; made < Math.min(70, Math.max(6, A * 8)) && t < 400; t++) {
      const p: XY = [Math.min(...xs) + rand() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rand() * (Math.max(...ys) - Math.min(...ys))];
      if (!inRing(p, inner)) continue; made++; shrubs.push([pi, p[0], p[1], SOIL_TOP + 0.18 + rand() * 0.2, rand() * Math.PI, 0.4 + rand() * 0.35]);
    }
  }
  const planters = await batch.build('planters');
  const postB = new CompactBuilder(UNIT_ROD, steelRod, doc.planters.length);
  for (const [pi, [x, y]] of posts) postB.push(pi, at(x, y, KERB_TOP, 0, 0.016, 0.016, RAIL_H));
  const shrubMat = new MeshStandardMaterial({ map: leaf, alphaTest: 0.45, side: DoubleSide, roughness: 0.9, color: '#b8d89a' });
  const shrubB = new CompactBuilder(cardGeo, shrubMat, doc.planters.length), o = new Object3D();
  for (const [pi, x, y, z, r, s] of shrubs) { o.position.set(x, y, z); o.rotation.set(Math.PI / 2 - 0.5, 0, r, 'ZXY'); o.scale.set(s, s * 0.7, s); o.updateMatrix(); shrubB.push(pi, o.matrix); }
  const postMesh = postB.build('planter-posts'), shrubMesh = shrubB.build('planter-plants');
  always.add(postMesh.mesh, shrubMesh.mesh);
  groups.push({ items: new ItemSet(doc.planters.map((pl) => pl.c)), within: DIST.small, parts: [[postMesh, false], [shrubMesh, false]] });
  quiet(planters); quiet(always);
  return { always, near: planters, groups };
}
