/*
 * A quick ray test for a merged city mesh whose triangles are grouped by building (massing.ts
 * mergeMassingsOwned): each building's box first, then only the triangles of the buildings the ray
 * passes through.
 *
 * For the headset's beam, which tests what it points at on every frame while a building is being chosen.
 * three's own test walks every triangle of the city each time (several hundred thousand), which a
 * headset cannot spare at 72 Hz; the boxes cut that to the handful of buildings along the beam.
 */
import { Matrix4, Ray, Vector3, type Intersection, type Mesh, type Raycaster } from 'three';

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

/** Where the ray enters the box, along it; null if it misses or the box is behind. */
function enters(ray: Ray, boxes: Float32Array, i: number): number | null {
  let near = 0, far = Infinity;
  const o = [ray.origin.x, ray.origin.y, ray.origin.z];
  const d = [ray.direction.x, ray.direction.y, ray.direction.z];
  for (let axis = 0; axis < 3; axis++) {
    const lo = boxes[i * 6 + axis], hi = boxes[i * 6 + 3 + axis];
    if (Math.abs(d[axis]) < 1e-12) {
      if (o[axis] < lo || o[axis] > hi) return null;
      continue;
    }
    let t0 = (lo - o[axis]) / d[axis], t1 = (hi - o[axis]) / d[axis];
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return null;
  }
  return near;
}

/**
 * The nearest triangle the ray hits, as three reports one (faceIndex is the triangle's number in the
 * whole mesh, so massing.ts ownerAt names its building), or null.
 */
export function nearestOwnedHit(
  ray: Ray,
  positions: ArrayLike<number>,
  owned: OwnedRanges,
  boxes: Float32Array,
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
      if (!best || distance < best.distance) {
        const normal = new Vector3().subVectors(c, b).cross(new Vector3().subVectors(a, b)).normalize();
        best = { distance, point: at.clone(), faceIndex: v / 3, normal };
      }
    }
  }
  return best;
}

/**
 * A `raycast` for the mesh that uses the boxes: put on the mesh while the beam is choosing a building,
 * and the mesh's own put back afterwards. The boxes are worked out once, on the first test.
 */
export function ownedRaycast(mesh: Mesh, owned: OwnedRanges): Mesh['raycast'] {
  let boxes: Float32Array | null = null;
  const inverse = new Matrix4();
  const local = new Ray();
  return (raycaster: Raycaster, intersects: Intersection[]) => {
    const positions = mesh.geometry.getAttribute('position').array;
    boxes ??= partBoxes(positions, owned);
    inverse.copy(mesh.matrixWorld).invert();
    local.copy(raycaster.ray).applyMatrix4(inverse);
    const hit = nearestOwnedHit(local, positions, owned, boxes);
    if (!hit) return;
    const point = hit.point.applyMatrix4(mesh.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(point);
    if (distance < raycaster.near || distance > raycaster.far) return;
    const v = hit.faceIndex * 3;
    // the face as three gives it (the pointer library reads its normal for the plane a drag moves in)
    const face = { a: v, b: v + 1, c: v + 2, normal: hit.normal, materialIndex: 0 };
    intersects.push({ distance, point, object: mesh, faceIndex: hit.faceIndex, face });
  };
}
