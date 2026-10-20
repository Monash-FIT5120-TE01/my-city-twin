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
 *
 * AND WHICH ONE IS UNDER THE POINTER
 *   So that the building a double click would open is seen before it is clicked (decided
 *   2026-10-20), the building under a mouse pointer is reported to `onHover` and drawn lit (CityMassing).
 *   One ray a frame at most, and the city tested building box first (ownedRaycast.ts), not triangle by
 *   triangle; nothing while a button is held (the camera is being moved), and on a desktop only.
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { Raycaster, Vector2, type Intersection, type Mesh, type Object3D } from 'three';
import type { Massing } from '../data/model';
import { ownerAt } from './massing';
import { ownedRaycast } from './ownedRaycast';
import { beginTap, trackTap, wasDragged, type Gesture } from './tap';
import { useInVr } from './xrStore';
import { detectDevice } from './streetscape/lod';

/** Whether the building under the pointer is lit: on a desktop only. */
const HOVERS = detectDevice() === 'desktop';

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
  onHover,
}: {
  /** The welded city meshes: the ready buildings and the unresolved ones. */
  city: PickableCity[];
  /** What can stand in front of the city: the projects' group. */
  blockers: RefObject<Object3D | null>;
  /** The highlighted building's group and id — drawn apart from the city. */
  highlighted: { object: RefObject<Object3D | null>; id: string | null };
  /** Undefined switches the picker off. */
  onSelect?: (buildingId: string) => void;
  /** The building under the mouse pointer, or null when there is none (or it is a project, or the chosen one). */
  onHover?: (buildingId: string | null) => void;
}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const inVr = useInVr();

  /*
   * Read through a ref, so the listener below is not torn down and rebuilt
   * every time the parent renders with new arrays.
   */
  const latest = useRef({ city, blockers, highlighted, onSelect, onHover, camera });
  useEffect(() => {
    latest.current = { city, blockers, highlighted, onSelect, onHover, camera };
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

    /*
     * The building under the pointer, at most once a frame. The fast ray test is made once for each
     * welded mesh and kept (its building boxes are kept with the geometry).
     */
    let frame = 0;
    let shown: string | null = null;
    const quick = new Map<Mesh, Mesh['raycast']>();
    const report = (id: string | null) => {
      if (id === shown) return;
      shown = id;
      canvas.style.cursor = id ? 'pointer' : '';
      latest.current.onHover?.(id);
    };
    const hover = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.buttons !== 0) {
        report(null);
        return;
      }
      if (frame) return;
      const { clientX, clientY } = event;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const { city, blockers, highlighted, camera } = latest.current;
        const rect = canvas.getBoundingClientRect();
        ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        let best: { distance: number; id: string | null } | null = null;
        // a project or the chosen building in front: nothing to light
        const front: Object3D[] = [];
        if (blockers.current) front.push(blockers.current);
        if (highlighted.object.current) front.push(highlighted.object.current);
        const shield = front.length ? raycaster.intersectObjects(front, true)[0] : undefined;
        if (shield) best = { distance: shield.distance, id: null };
        for (const part of city) {
          const mesh = part.mesh.current;
          if (!mesh || !part.owned) continue;
          let test = quick.get(mesh);
          if (!test) {
            test = ownedRaycast(mesh, part.owned);
            quick.set(mesh, test);
          }
          const hits: Intersection[] = [];
          test(raycaster, hits);
          const hit = hits[0];
          if (!hit || hit.faceIndex == null || (best && best.distance <= hit.distance)) continue;
          best = { distance: hit.distance, id: ownerAt(part.owned, hit.faceIndex)?.parentId ?? null };
        }
        report(best?.id ?? null);
      });
    };
    const leave = () => report(null);

    canvas.addEventListener('pointerdown', down);
    // a desktop's mouse only (decided 2026-10-20): a phone or a tablet has nothing to hover with
    if (HOVERS) canvas.addEventListener('pointermove', hover);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('click', click);
    canvas.addEventListener('dblclick', dblclick);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('click', click);
      canvas.removeEventListener('dblclick', dblclick);
      canvas.removeEventListener('pointermove', hover);
      canvas.removeEventListener('pointerleave', leave);
      window.cancelAnimationFrame(frame);
      report(null);
    };
  }, [enabled, gl]);

  return null;
}
