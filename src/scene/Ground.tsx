import { useMemo } from 'react';
import { BufferAttribute, Color, PlaneGeometry } from 'three';
import type { CityModel } from '../data/model';

/** Background the ground dissolves into — the same colour the canvas clears to. */
const HORIZON = '#ededea';

/**
 * The ground the city stands on, fading out at its edges.
 *
 * The building data stops at the Hoddle Grid, so there is genuinely nothing
 * to draw beyond it. Drawn as a plain square that reads as the edge of the
 * world; faded, it reads as the extent of what we know, which is the truth.
 *
 * The fade is baked into vertex colours rather than into alpha. A transparent
 * ground still receives shadows, and shadows landing on nothing at the edges
 * look worse than the hard edge did.
 */
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
