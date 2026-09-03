/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE GROUND, AND WHERE IT STOPS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The flat surface the city stands on, and the surface a click lands on
 *   when someone measures a spot.
 *
 * WHY IT FADES AT THE EDGES
 *   The building data covers the Hoddle Grid and stops. Beyond it there is
 *   genuinely nothing — no suburbs, no river, no data of any kind. Drawn as
 *   a plain square, that boundary reads as the edge of the world. Faded, it
 *   reads as the edge of what is known, which is what it is.
 *
 * HOW THE FADE IS MADE
 *   The plane is divided into a grid of small squares, and each corner is
 *   given a colour: solid near the middle, blending to the background colour
 *   further out. The graphics card blends smoothly between them.
 *
 *   The alternative — making the ground transparent — was tried and is
 *   worse. A transparent ground still catches shadows, so the city ends up
 *   casting shadows onto empty space.
 *
 * WHY THE GROUND IS FLAT
 *   The real CBD slopes about 20 m from Latrobe Street down to the river,
 *   and that surface exists in the source data. It is not used yet, so
 *   buildings carry their true heights above sea level while the ground
 *   beneath them is a single level. Terrain is Iteration 2 work.
 */

import { useMemo } from 'react';
import { BufferAttribute, Color, PlaneGeometry } from 'three';
import type { CityModel } from '../data/model';

/** Background the ground dissolves into — the same colour the canvas clears to. */
const HORIZON = '#ededea';

export function Ground({
  model,
  groundAhdM,
  onPick,
}: {
  model: CityModel;
  groundAhdM: number;
  /** Called with an east/north point when the ground is clicked. */
  onPick?: (point: [number, number]) => void;
}) {
  const { minE, minN, maxE, maxN } = model.extent;
  const centreE = (minE + maxE) / 2;
  const centreN = (minN + maxN) / 2;

  const geometry = useMemo(() => {
    const span = Math.max(maxE - minE, maxN - minN);
    // Room for the fade itself, beyond the last building.
    const size = span * 2.4;
    const plane = new PlaneGeometry(size, size, 64, 64);

    const solid = new Color('#e6e3da');
    const horizon = new Color(HORIZON);
    const scratch = new Color();

    // Opaque out to the edge of the data, then gone by the edge of the plane.
    const inner = span * 0.62;
    const outer = size * 0.5;

    const position = plane.getAttribute('position');
    const colours = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      const distance = Math.hypot(position.getX(i), position.getY(i));
      const t = Math.min(1, Math.max(0, (distance - inner) / (outer - inner)));
      // Smoothstep, so the fade has no visible band where it begins.
      const eased = t * t * (3 - 2 * t);
      scratch.copy(solid).lerp(horizon, eased);
      colours[i * 3] = scratch.r;
      colours[i * 3 + 1] = scratch.g;
      colours[i * 3 + 2] = scratch.b;
    }

    plane.setAttribute('color', new BufferAttribute(colours, 3));
    return plane;
  }, [minE, minN, maxE, maxN]);

  return (
    <mesh
      receiveShadow
      geometry={geometry}
      position={[centreE, centreN, groundAhdM]}
      onClick={
        onPick &&
        ((event) => {
          event.stopPropagation();
          // The hit is in three's world frame; enuToWorld sent
          // (east, north, up) to (east, up, -north), so this reads it back.
          onPick([event.point.x, -event.point.z]);
        })
      }
    >
      <meshStandardMaterial vertexColors roughness={1} metalness={0} />
    </mesh>
  );
}
