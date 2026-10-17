/*
 * Laying flat things on the ground: roads, parks, footpaths, the patches of
 * colour that used to sit on one flat plane (terrain.ts).
 *
 * A polygon from the data has a handful of corners and long straight edges.
 * Lifted corner by corner onto a slope, its middle would cut straight
 * through a rise or hang over a dip. So it is cut into triangles no wider
 * than the ground grid first, and every corner of every one is set on the
 * ground, a little above it.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { groundAt, type Ground } from './terrain';

/** No triangle edge longer than this, metres: under the ground grid's 10 m, so a road bends with it. */
const MAX_EDGE_M = 8;

/**
 * The geometry (flat, in east/north at z = 0) cut fine and set on the ground, `liftM` above it. Returns a
 * new, non-indexed geometry with normals; the input is not changed. Attributes other than position (uv,
 * colour) are not carried: the flat things this is for are drawn in one colour each.
 */
export function drapeOnGround(flat: BufferGeometry, ground: Ground, liftM: number, maxEdgeM = MAX_EDGE_M): BufferGeometry {
  const source = flat.index ? flat.toNonIndexed() : flat;
  const p = source.getAttribute('position');
  const out: number[] = [];
  const max2 = maxEdgeM * maxEdgeM;
  const split = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, depth: number) => {
    const ab = (ax - bx) ** 2 + (ay - by) ** 2;
    const bc = (bx - cx) ** 2 + (by - cy) ** 2;
    const ca = (cx - ax) ** 2 + (cy - ay) ** 2;
    const longest = Math.max(ab, bc, ca);
    if (longest <= max2 || depth > 18) {
      out.push(ax, ay, 0, bx, by, 0, cx, cy, 0);
      return;
    }
    // halve the longest edge: the two halves keep the winding
    if (longest === ab) {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      split(ax, ay, mx, my, cx, cy, depth + 1);
      split(mx, my, bx, by, cx, cy, depth + 1);
    } else if (longest === bc) {
      const mx = (bx + cx) / 2, my = (by + cy) / 2;
      split(ax, ay, bx, by, mx, my, depth + 1);
      split(ax, ay, mx, my, cx, cy, depth + 1);
    } else {
      const mx = (cx + ax) / 2, my = (cy + ay) / 2;
      split(ax, ay, bx, by, mx, my, depth + 1);
      split(mx, my, bx, by, cx, cy, depth + 1);
    }
  };
  for (let i = 0; i < p.count; i += 3) {
    split(p.getX(i), p.getY(i), p.getX(i + 1), p.getY(i + 1), p.getX(i + 2), p.getY(i + 2), 0);
  }
  if (source !== flat) source.dispose();
  for (let i = 0; i < out.length; i += 3) out[i + 2] = groundAt(ground, out[i], out[i + 1]) + liftM;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(out), 3));
  g.computeVertexNormals();
  return g;
}
