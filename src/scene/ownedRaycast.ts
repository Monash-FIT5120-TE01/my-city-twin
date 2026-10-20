/*
 * A quick ray test for a merged city mesh whose triangles are grouped by building (massing.ts
 * mergeMassingsOwned): each building's box first, then only the triangles of the buildings the ray
 * passes through.
 *
 * For the headset's beam, which tests what it points at on every frame while a building is being chosen.
 * three's own test walks every triangle of the city each time (several hundred thousand), which a
 * headset cannot spare at 72 Hz; the boxes cut that to the handful of buildings along the beam.
 */
import { Matrix4, Ray, Vector3, type BufferGeometry, type Intersection, type Mesh, type Raycaster } from 'three';

/** The vertex ranges by building: `ends[i]` is one past the last vertex of part i (non-indexed). */
export interface OwnedRanges {
  ends: Int32Array;
}

/** Each part's box in the mesh's own space: min x, y, z, max x, y, z, six numbers a part. */
export function partBoxes(positions: ArrayLike<number>, owned: OwnedRanges): Float32Array {
  const boxes = new Float32Array(owned.ends.length * 6);
  let start = 0;
  for (let i = 0; i < owned.ends.length; i++) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let v = start; v < owned.ends[i]; v++) {
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    boxes.set([x0, y0, z0, x1, y1, z1], i * 6);
    start = owned.ends[i];
  }
  return boxes;
}

/**
 * Where the ray enters the box, along it; null if it misses or the box is behind. In plain numbers, not
 * arrays: it runs for every building on every frame the beam is choosing one (review, 2026-10-19).
 */
function enters(ray: Ray, boxes: Float32Array, i: number): number | null {
  let near = 0, far = Infinity;
  for (let axis = 0; axis < 3; axis++) {
    const o = axis === 0 ? ray.origin.x : axis === 1 ? ray.origin.y : ray.origin.z;
    const d = axis === 0 ? ray.direction.x : axis === 1 ? ray.direction.y : ray.direction.z;
    const lo = boxes[i * 6 + axis], hi = boxes[i * 6 + 3 + axis];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t0 = (lo - o) / d, t1 = (hi - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return null;
  }
  return near;
}

/**
 * The nearest triangle the ray hits, as three reports one (faceIndex is the triangle's number in the
 * whole mesh, so massing.ts ownerAt names its building), or null. `accept` can turn a hit down (one
 * nearer than the raycaster's near limit, say): the nearest of the hits it accepts is returned.
 */
export function nearestOwnedHit(
  ray: Ray,
  positions: ArrayLike<number>,
  owned: OwnedRanges,
  boxes: Float32Array,
  accept: (point: Vector3) => boolean = () => true,
): { distance: number; point: Vector3; faceIndex: number; normal: Vector3 } | null {
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), at = new Vector3();
  // the parts the ray passes through, nearest box first, so a hit can stop the search
  const order: [number, number][] = [];
  for (let i = 0; i < owned.ends.length; i++) {
    const t = enters(ray, boxes, i);
    if (t !== null) order.push([t, i]);
  }
  order.sort((p, q) => p[0] - q[0]);
  let best: { distance: number; point: Vector3; faceIndex: number; normal: Vector3 } | null = null;
  for (const [t, i] of order) {
    if (best && t > best.distance) break;
    const start = i === 0 ? 0 : owned.ends[i - 1];
    for (let v = start; v + 2 < owned.ends[i]; v += 3) {
      a.fromArray(positions as number[], v * 3);
      b.fromArray(positions as number[], v * 3 + 3);
      c.fromArray(positions as number[], v * 3 + 6);
      if (!ray.intersectTriangle(a, b, c, false, at)) continue;
      const distance = at.distanceTo(ray.origin);
      if (best && distance >= best.distance) continue;
      if (!accept(at)) continue;
      const normal = new Vector3().subVectors(c, b).cross(new Vector3().subVectors(a, b)).normalize();
      best = { distance, point: at.clone(), faceIndex: v / 3, normal };
    }
  }
  return best;
}

/** The boxes, by geometry: worked out once for each merged city, however often the beam is armed. */
const boxesOf = new WeakMap<BufferGeometry, Float32Array>();

/**
 * A `raycast` for the mesh that uses the boxes: put on the mesh while the beam is choosing a building,
 * and the mesh's own put back afterwards.
 */
export function ownedRaycast(mesh: Mesh, owned: OwnedRanges): Mesh['raycast'] {
  const inverse = new Matrix4();
  const local = new Ray();
  const world = new Vector3();
  return (raycaster: Raycaster, intersects: Intersection[]) => {
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute('position').array;
    let boxes = boxesOf.get(geometry);
    if (!boxes) {
      boxes = partBoxes(positions, owned);
      boxesOf.set(geometry, boxes);
    }
    inverse.copy(mesh.matrixWorld).invert();
    local.copy(raycaster.ray).applyMatrix4(inverse);
    // the raycaster's limits, in the world: a hit nearer or further is passed over for the next one
    const within = (point: Vector3) => {
      const distance = raycaster.ray.origin.distanceTo(world.copy(point).applyMatrix4(mesh.matrixWorld));
      return distance >= raycaster.near && distance <= raycaster.far;
    };
    const hit = nearestOwnedHit(local, positions, owned, boxes, within);
    if (!hit) return;
    const point = hit.point.applyMatrix4(mesh.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(point);
    const v = hit.faceIndex * 3;
    // the face as three gives it (the pointer library reads its normal for the plane a drag moves in)
    const face = { a: v, b: v + 1, c: v + 2, normal: hit.normal, materialIndex: 0 };
    intersects.push({ distance, point, object: mesh, faceIndex: hit.faceIndex, face });
  };
}
