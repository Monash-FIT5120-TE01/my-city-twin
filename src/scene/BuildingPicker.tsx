/*
 * ─────────────────────────────────────────────────────────────────────────
 * DOUBLE-CLICKING AN EXISTING BUILDING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The way to open a building that stands today from the map, as a double
 *   click opens an approved project (DevelopmentMassings). It draws nothing.
 *
 * WHY NOT A POINTER HANDLER ON THE CITY MESH
 *   The city is one welded mesh of every building — hundreds of thousands of
 *   triangles. A react-three-fiber handler on it would have the city
 *   ray-tested on every pointer move, for hover, to serve an event that
 *   comes a few times a session. So this listens for the browser's own
 *   double click on the canvas and casts one ray then.
 *
 * WHAT THE RAY HAS TO GET PAST
 *   The ray is tested against the city and everything that can stand in
 *   front of it: the approved projects and the highlighted building. When a
 *   project is nearest, its own handler opens it and this does nothing; the
 *   highlighted building is lifted out of the welded city, so it is answered
 *   by its id. Otherwise the triangle hit names its building — see
 *   `ownerAt` in massing.ts.
 *
 * CLICKS, NOT THE ENDS OF DRAGS
 *   Both clicks have to be clicks: a press that travelled further than a tap
 *   (see tap.ts) was the camera being moved, and two quick pans that end
 *   over one tower are not a request to open it.
 *
 * NOT IN A HEADSET
 *   A controller has no double click; there, buildings are reached by search.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2, type Mesh, type Object3D } from 'three';
import type { Massing } from '../data/model';
import { ownerAt } from './massing';
import { beginTap, trackTap, wasDragged, type Gesture } from './tap';
import { useInVr } from './xrStore';

/** A welded city mesh, with which building drew each of its triangles. */
export interface PickableCity {
  mesh: RefObject<Mesh | null>;
  owned: { ends: Int32Array; owners: Massing[] } | null;
}

export function BuildingPicker({
  city,
  blockers,
  highlighted,
  onSelect,
}: {
  /** The welded city meshes: the ready buildings and the unresolved ones. */
  city: PickableCity[];
  /** What can stand in front of the city: the projects' group. */
  blockers: RefObject<Object3D | null>;
  /** The highlighted building's group and id — drawn apart from the city. */
  highlighted: { object: RefObject<Object3D | null>; id: string | null };
  /** Undefined switches the picker off. */
  onSelect?: (buildingId: string) => void;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const inVr = useInVr();

  /*
   * Read through a ref, so the listener below is not torn down and rebuilt
   * every time the parent renders with new arrays.
   */
  const latest = useRef({ city, blockers, highlighted, onSelect, camera });
  useEffect(() => {
    latest.current = { city, blockers, highlighted, onSelect, camera };
  });

  const enabled = onSelect !== undefined && !inVr;

  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    let gesture: Gesture | null = null;
    /** Whether each of the last two clicks was a click and not a drag. */
    let clean: [boolean, boolean] = [false, false];

    const down = (event: PointerEvent) => {
      if (event.button === 0) gesture = beginTap(event);
    };
    const move = (event: PointerEvent) => {
      gesture = trackTap(gesture, event);
    };
    const click = (event: MouseEvent) => {
      clean = [clean[1], !wasDragged(gesture, event)];
      gesture = null;
    };
    const dblclick = (event: MouseEvent) => {
      if (!clean[0] || !clean[1]) return;
      const { city, blockers, highlighted, onSelect, camera } = latest.current;
      if (!onSelect) return;

      const rect = canvas.getBoundingClientRect();
      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);

      const meshes = city.map((part) => part.mesh.current).filter((m): m is Mesh => m !== null);
      const targets: Object3D[] = [...meshes];
      if (blockers.current) targets.push(blockers.current);
      if (highlighted.object.current) targets.push(highlighted.object.current);
      const hit = raycaster.intersectObjects(targets, true)[0];
      if (!hit) return;

      // The highlighted building: anything inside its group.
      let node: Object3D | null = hit.object;
      while (node) {
        if (node === highlighted.object.current) {
          if (highlighted.id) onSelect(highlighted.id);
          return;
        }
        node = node.parent;
      }

      const part = city.find((entry) => entry.mesh.current === hit.object);
      // A project in front: its own handler has it.
      if (!part?.owned || hit.faceIndex == null) return;
      const owner = ownerAt(part.owned, hit.faceIndex);
      if (owner) onSelect(owner.parentId);
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('click', click);
    canvas.addEventListener('dblclick', dblclick);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('click', click);
      canvas.removeEventListener('dblclick', dblclick);
    };
  }, [enabled, gl]);

  return null;
}
