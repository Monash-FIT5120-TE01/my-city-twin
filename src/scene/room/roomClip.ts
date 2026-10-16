/*
 * The six clipping planes that take the flat's block out of the building's
 * massing — in the picture and in the shadows (clipShadows), or the flat
 * would sit in its own building's shadow and be dark at noon.
 *
 * three.js keeps the side of a plane its normal points to. With
 * clipIntersection on, a fragment is cut only when every plane cuts it, so
 * normals pointing OUT of the box cut exactly the inside of the box.
 *
 * THREE.JS WORLD COORDINATES. Clipping planes are world-space, and the
 * massing is drawn inside <WorldFrame> (east, north, up turned to east, up,
 * -north). The box is built in the flat's frame, turned into east/north/up,
 * then into the world frame: enuToWorld, the one rotation, in one place.
 */
import { Plane, Vector3 } from 'three';
import { enuToWorld } from '../frame';
import { CUT_BOX } from './apartmentLayout';
import { toEN, type RoomPlacement } from './roomPlacement';

function worldPoint(p: RoomPlacement, x: number, y: number, z: number): Vector3 {
  const [e, n] = toEN(p, x, y);
  return new Vector3(...enuToWorld([e, n, p.floorAhdM + z]));
}

/** A direction in the flat's frame, as a three.js world vector. */
function worldDir(p: RoomPlacement, dx: number, dy: number, dz: number): Vector3 {
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  return new Vector3(...enuToWorld([dx * c - dy * s, dx * s + dy * c, dz])).normalize();
}

export function roomClipPlanes(p: RoomPlacement, box = CUT_BOX): Plane[] {
  const faces: [number, number, number, number, number, number][] = [
    // outward normal (local), a point on the face (local)
    [1, 0, 0, box.x1, box.y0, box.z0],
    [-1, 0, 0, box.x0, box.y0, box.z0],
    [0, 1, 0, box.x0, box.y1, box.z0],
    [0, -1, 0, box.x0, box.y0, box.z0],
    [0, 0, 1, box.x0, box.y0, box.z1],
    [0, 0, -1, box.x0, box.y0, box.z0],
  ];
  return faces.map(([nx, ny, nz, x, y, z]) => new Plane().setFromNormalAndCoplanarPoint(worldDir(p, nx, ny, nz), worldPoint(p, x, y, z)));
}

/** Whether a point (local frame) is inside the cut: what the planes remove. */
export function insideCut(planes: Plane[], world: Vector3): boolean {
  return planes.every((pl) => pl.distanceToPoint(world) < 0);
}
