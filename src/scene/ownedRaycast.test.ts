import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferAttribute, BufferGeometry, Mesh, Ray, Raycaster, Vector3 } from 'three';
import { nearestOwnedHit, ownedRaycast, partBoxes } from './ownedRaycast';

/** Two unit boxes, non-indexed, at x = 0 and x = 5: part 0 and part 1. */
function twoBoxes() {
  const one = new BoxGeometry(1, 1, 1).toNonIndexed();
  const two = new BoxGeometry(1, 1, 1).toNonIndexed().translate(5, 0, 0);
  const a = one.getAttribute('position').array as Float32Array;
  const b = two.getAttribute('position').array as Float32Array;
  const positions = new Float32Array(a.length + b.length);
  positions.set(a);
  positions.set(b, a.length);
  const ends = new Int32Array([a.length / 3, (a.length + b.length) / 3]);
  return { positions, owned: { ends } };
}

/** The part a triangle belongs to. */
function partOf(ends: Int32Array, faceIndex: number) {
  return ends.findIndex((end) => faceIndex * 3 < end);
}

describe('ownedRaycast', () => {
  it('boxes each part', () => {
    const { positions, owned } = twoBoxes();
    const boxes = partBoxes(positions, owned);
    expect([...boxes.slice(0, 6)]).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
    expect([...boxes.slice(6, 12)]).toEqual([4.5, -0.5, -0.5, 5.5, 0.5, 0.5]);
  });

  it('finds the nearer building along the ray, and names it', () => {
    const { positions, owned } = twoBoxes();
    const boxes = partBoxes(positions, owned);
    const fromLeft = nearestOwnedHit(new Ray(new Vector3(-10, 0, 0), new Vector3(1, 0, 0)), positions, owned, boxes);
    expect(fromLeft && partOf(owned.ends, fromLeft.faceIndex)).toBe(0);
    expect(fromLeft?.distance).toBeCloseTo(9.5);
    const fromRight = nearestOwnedHit(new Ray(new Vector3(10, 0, 0), new Vector3(-1, 0, 0)), positions, owned, boxes);
    expect(fromRight && partOf(owned.ends, fromRight.faceIndex)).toBe(1);
    expect(fromRight?.distance).toBeCloseTo(4.5);
  });

  it('misses between the buildings and behind the ray', () => {
    const { positions, owned } = twoBoxes();
    const boxes = partBoxes(positions, owned);
    expect(nearestOwnedHit(new Ray(new Vector3(2.5, 10, 0), new Vector3(0, -1, 0)), positions, owned, boxes)).toBeNull();
    expect(nearestOwnedHit(new Ray(new Vector3(10, 0, 0), new Vector3(1, 0, 0)), positions, owned, boxes)).toBeNull();
  });

  it('agrees with three on a moved mesh', () => {
    const { positions, owned } = twoBoxes();
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const mesh = new Mesh(geometry);
    mesh.position.set(0, 0, 20);
    mesh.updateMatrixWorld();
    const raycaster = new Raycaster(new Vector3(5, 10, 20), new Vector3(0, -1, 0));
    const ours: ReturnType<Raycaster['intersectObject']> = [];
    ownedRaycast(mesh, owned)(raycaster, ours);
    const theirs = raycaster.intersectObject(mesh);
    expect(ours).toHaveLength(1);
    expect(ours[0].distance).toBeCloseTo(theirs[0].distance);
    expect(partOf(owned.ends, ours[0].faceIndex!)).toBe(partOf(owned.ends, theirs[0].faceIndex!));
  });
});
