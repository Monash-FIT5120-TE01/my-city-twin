/*
 * The street furniture onto the ground's real heights (terrain.ts).
 *
 * Everything in the streetscape is built at z = 0 for the ground under it: the builders were written for
 * one flat ground. Once built, the whole lot is raised here, in one place. Each placed object (a pole, a
 * seat, a sign: one instance) is raised rigidly by the ground at its own position; each baked mesh (road
 * surfaces, kerbs, rails, wires, paint) vertex by vertex, after its long flat triangles are cut fine
 * enough to bend with the ground. So a rail follows the street down the hill, and a pole stands upright
 * at its foot.
 *
 * Run once, after building and before anything is frozen (still.ts) or compiled. The trams move, and are
 * raised as they are drawn (trams/TramLayer.ts).
 */
import { BufferAttribute, BufferGeometry, Matrix4, Vector3, type InstancedMesh, type Mesh, type Object3D } from 'three';
import type { Compact } from './lod';
import { heightAt, type Ground, type Terrain } from '../terrain';

/*
 * No triangle edge longer than this on a baked mesh, metres. At 8 m (under the ground grid's 10 m) the
 * streetscape went from about 0.96M points to 7.4M, too much for a headset; at 20 m it is 2.8M, and the
 * ground, smooth over hundreds of metres, does not come up through the roads in between (2026-10-18).
 */
const MAX_EDGE_M = 20;

/**
 * The geometry with every triangle that has an edge longer than `max` (in plan) cut by halving that edge,
 * every attribute carried along. Returns the same geometry when nothing is that long.
 *
 * Written with flat typed arrays and no allocation per vertex: the whole city's road surfaces and rails
 * go through it, and the first version, which built small arrays for every vertex, took four seconds.
 */
export function cutFine(source: BufferGeometry, max = MAX_EDGE_M): BufferGeometry {
  if (!source.getAttribute('position')) return source;
  const max2 = max * max;
  const flat = source.index ? source.toNonIndexed() : source;
  const pos = flat.getAttribute('position');
  let long = false;
  for (let i = 0; i + 2 < pos.count && !long; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = i + k;
      const b = i + ((k + 1) % 3);
      if ((pos.getX(a) - pos.getX(b)) ** 2 + (pos.getY(a) - pos.getY(b)) ** 2 > max2) {
        long = true;
        break;
      }
    }
  }
  if (!long) {
    if (flat !== source) flat.dispose();
    return source;
  }
  const names = Object.keys(flat.attributes);
  const attrs = names.map((n) => flat.getAttribute(n));
  const sizes = attrs.map((a) => a.itemSize);
  const offsets: number[] = [];
  let C = 0;
  for (const s of sizes) {
    offsets.push(C);
    C += s;
  }
  const P = offsets[names.indexOf('position')];
  // every source vertex packed: C numbers each
  const src = new Float32Array(pos.count * C);
  attrs.forEach((at, j) => {
    for (let i = 0; i < at.count; i++) for (let c = 0; c < sizes[j]; c++) src[i * C + offsets[j] + c] = at.getComponent(i, c);
  });
  // output, packed the same way, grown by doubling
  let out = new Float32Array(src.length * 2);
  let outN = 0;
  // vertices made by halving edges, for the triangle in hand
  let pool = new Float32Array(C * 256);
  let poolN = 0;
  // where a vertex's numbers are: a source vertex (named -(i + 1)) or one made by halving (its pool place)
  const arrOf = (slot: number) => (slot < 0 ? src : pool);
  const offOf = (slot: number) => (slot < 0 ? (-slot - 1) * C : slot * C);
  const emit = (slot: number) => {
    if ((outN + 1) * C > out.length) {
      const grown = new Float32Array(out.length * 2);
      grown.set(out);
      out = grown;
    }
    const o = offOf(slot);
    out.set(arrOf(slot).subarray(o, o + C), outN * C);
    outN++;
  };
  const halve = (a: number, b: number): number => {
    if ((poolN + 1) * C > pool.length) {
      const grown = new Float32Array(pool.length * 2);
      grown.set(pool);
      pool = grown;
    }
    const aa = arrOf(a), ao = offOf(a), ba = arrOf(b), bo = offOf(b);
    const o = poolN * C;
    for (let c = 0; c < C; c++) pool[o + c] = (aa[ao + c] + ba[bo + c]) / 2;
    return poolN++;
  };
  const d2 = (a: number, b: number) => {
    const aa = arrOf(a), ao = offOf(a), ba = arrOf(b), bo = offOf(b);
    return (aa[ao + P] - ba[bo + P]) ** 2 + (aa[ao + P + 1] - ba[bo + P + 1]) ** 2;
  };
  const split = (a: number, b: number, c: number, depth: number) => {
    const ab = d2(a, b);
    const bc = d2(b, c);
    const ca = d2(c, a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= max2 || depth > 16) {
      emit(a);
      emit(b);
      emit(c);
      return;
    }
    // halve the longest edge; both halves keep the winding
    if (longest === ab) {
      const m = halve(a, b);
      split(a, m, c, depth + 1);
      split(m, b, c, depth + 1);
    } else if (longest === bc) {
      const m = halve(b, c);
      split(a, b, m, depth + 1);
      split(a, m, c, depth + 1);
    } else {
      const m = halve(c, a);
      split(a, b, m, depth + 1);
      split(m, b, c, depth + 1);
    }
  };
  // source vertices are named -(i + 1), halving ones by their place in the pool
  for (let i = 0; i + 2 < pos.count; i += 3) {
    poolN = 0;
    split(-(i + 1), -(i + 2), -(i + 3), 0);
  }
  const g = new BufferGeometry();
  names.forEach((n, j) => {
    const arr = new Float32Array(outN * sizes[j]);
    for (let v = 0; v < outN; v++) for (let c = 0; c < sizes[j]; c++) arr[v * sizes[j] + c] = out[v * C + offsets[j] + c];
    g.setAttribute(n, new BufferAttribute(arr, sizes[j], attrs[j].normalized));
  });
  // marked, so the lift knows to give it normals that face up the slope it is laid on
  g.userData = { ...source.userData, cutFine: true };
  if (flat !== source) flat.dispose();
  return g;
}

/*
 * The ground the street is laid on: the terrain, raised where it is convex by as much as a slab triangle
 * (edges up to MAX_EDGE_M) can sag below it there. A flat triangle with its corners on a hump passes under
 * the hump's top, and the bare ground (Ground.tsx) showed through the road as pale patches round the
 * walker, up to 19 cm deep (2026-10-20). Cutting the near slabs to 8 m tripled their points and still left
 * 6 cm; this costs no points. A function of the position alone, so the triangles either side of an edge are
 * raised alike and no crack opens between them. Flat and hollow ground is not raised at all.
 */
export function streetGroundOf(ground: Ground): (e: number, n: number) => number {
  if (typeof ground === 'number') return () => ground;
  const { cols, rows, cell, heights: h } = ground;
  // how sharply the ground bends over at each grid point, 1/m: the steepest of the four directions
  const bend = new Float32Array(cols * rows);
  const steps: [number, number, number][] = [[1, 0, cell], [0, 1, cell], [1, 1, cell * Math.SQRT2], [1, -1, cell * Math.SQRT2]];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      let most = 0;
      for (const [dc, dr, d] of steps) {
        const over = (2 * h[i] - h[i + dr * cols + dc] - h[i - dr * cols - dc]) / (d * d);
        if (over > most) most = over;
      }
      bend[i] = most;
    }
  }
  // how far an edge of L sags below ground bending by k: k L^2 / 8, taken over every point such an edge can
  // reach (checked over the whole city against Ground.tsx: nothing showed through, 2026-10-20)
  const reach = Math.ceil(MAX_EDGE_M / cell);
  const sag = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let most = 0;
      for (let rr = Math.max(0, r - reach); rr <= Math.min(rows - 1, r + reach); rr++) {
        for (let cc = Math.max(0, c - reach); cc <= Math.min(cols - 1, c + reach); cc++) most = Math.max(most, bend[rr * cols + cc]);
      }
      sag[r * cols + c] = (most * MAX_EDGE_M * MAX_EDGE_M) / 8;
    }
  }
  const raise: Terrain = { ...ground, heights: sag };
  return (e, n) => heightAt(ground, e, n) + heightAt(raise, e, n);
}

/** The longest edge to leave uncut on this mesh: MAX_EDGE_M, or a coarser one set on a group above it. */
function cutEdgeOf(o: Object3D): number {
  for (let p: Object3D | null = o; p; p = p.parent) {
    const e = p.userData.cutEdgeM as number | undefined;
    if (e) return e;
  }
  return MAX_EDGE_M;
}

/**
 * Raise everything under `root` (built, not yet in a scene) onto the ground. In steps, with a break
 * (`pause`) whenever a step has run for a few milliseconds: the street is built the same way, so the page
 * stays responsive while it is.
 */
export async function liftOntoGround(
  root: Object3D,
  groundAt: (e: number, n: number) => number,
  pause: () => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  root.updateMatrixWorld(true);
  const objects: Object3D[] = [];
  root.traverse((o) => objects.push(o));
  /*
   * A geometry used by more than one mesh gets a copy for each, taken before any of them is raised:
   * raising the shared one in place lifted the second mesh twice (review, 2026-10-18).
   */
  const users = new Map<BufferGeometry, number>();
  for (const o of objects) {
    const mesh = o as Mesh;
    if (mesh.geometry && !(o as InstancedMesh).isInstancedMesh) users.set(mesh.geometry, (users.get(mesh.geometry) ?? 0) + 1);
  }
  const inverse = new Matrix4();
  const m = new Matrix4();
  const w = new Matrix4();
  const v = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  let since = performance.now();
  for (const o of objects) {
    if (performance.now() - since > 8) {
      await pause();
      since = performance.now();
    }
    const im = o as InstancedMesh;
    if (im.isInstancedMesh) {
      // the level-of-detail sets copy from their own store (lod.ts): that is what is raised
      const compact = im.userData.compact as Compact | undefined;
      if (compact) {
        compact.lift(groundAt);
        continue;
      }
      /*
       * Rigidly by the ground at each instance's place — except a long thin one (a span wire, a rail
       * between two posts), which is sheared so each end sits on the ground at that end: raised by its
       * middle alone, the uphill end of a 15 m wire hung a metre low.
       */
      if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
      const box = im.geometry.boundingBox!;
      const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
      inverse.copy(im.matrixWorld).invert();
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        w.multiplyMatrices(im.matrixWorld, m);
        /*
         * Thin and long as PLACED: the geometry's size along each axis times that axis's stretch in this
         * instance's matrix. A unit rod is a block until it is scaled into a 20 m wire, and judging the
         * geometry alone missed every wire (review, 2026-10-18).
         */
        const placed = size.map((s, k) => s * Math.hypot(w.elements[k * 4], w.elements[k * 4 + 1], w.elements[k * 4 + 2]));
        const axis = placed.indexOf(Math.max(...placed));
        const thin = placed.every((s, k) => k === axis || s * 3 <= placed[axis]);
        const lo = [box.min.x, box.min.y, box.min.z][axis];
        const len = size[axis];
        if (thin && len > 0) {
          // the two ends along the long axis, in the streetscape's frame
          a.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
          b.copy(a);
          a.setComponent(axis, lo);
          b.setComponent(axis, lo + len);
          a.applyMatrix4(w);
          b.applyMatrix4(w);
          if (Math.hypot(b.x - a.x, b.y - a.y) > 2) {
            const la = groundAt(a.x, a.y);
            const lb = groundAt(b.x, b.y);
            const per = (lb - la) / len;
            // up = la + per * (p_axis - lo): into the axis column's z and the translation
            w.elements[axis * 4 + 2] += per;
            w.elements[14] += la - per * lo;
            im.setMatrixAt(i, m.multiplyMatrices(inverse, w));
            continue;
          }
        }
        w.elements[14] += groundAt(w.elements[12], w.elements[13]);
        im.setMatrixAt(i, m.multiplyMatrices(inverse, w));
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      continue;
    }
    const mesh = o as Mesh;
    const drawn = mesh.isMesh || (o as { isLine?: boolean }).isLine || (o as { isPoints?: boolean }).isPoints;
    if (!drawn) continue;
    let g = mesh.geometry;
    if ((users.get(g) ?? 0) > 1) g = g.clone();
    const cut = mesh.isMesh ? cutFine(g, cutEdgeOf(mesh)) : g;
    if (cut !== g && g !== mesh.geometry) g.dispose();
    g = cut;
    if (g !== mesh.geometry) mesh.geometry = g;
    const pos = g.getAttribute('position');
    inverse.copy(mesh.matrixWorld).invert();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      v.z += groundAt(v.x, v.y);
      v.applyMatrix4(inverse);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    // a surface cut fine to follow the slope faces up the slope too, so it is lit like the ground beside it
    if (g.userData.cutFine) g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
  }
}
