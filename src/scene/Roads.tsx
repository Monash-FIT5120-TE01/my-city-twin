import { useMemo } from 'react';
import { BufferGeometry, Shape, ShapeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_DIRECTIONS, ROADS } from './streets';
import type { CityModel } from '../data/model';

/**
 * The carriageways, painted a shade lighter than the ground.
 *
 * In the Figma the roads are not blank gaps: they carry their own pale tone,
 * which is what makes the grid legible from above. Without it the city reads
 * as scattered blocks rather than as streets with buildings along them.
 *
 * Drawn just above the ground plane and just below the massing, so where a
 * building genuinely bridges a lane — the arcades do — the building covers
 * the road rather than the other way round.
 */
export function Roads({ model, groundAhdM }: { model: CityModel; groundAhdM: number }) {
  const geometry = useMemo<BufferGeometry | null>(() => {
    const { minE, minN, maxE, maxN } = model.extent;
    const centreE = (minE + maxE) / 2;
    const centreN = (minN + maxN) / 2;
    // Long enough to cross the grid from any corner, whichever way it runs.
    const half = Math.hypot(maxE - minE, maxN - minN) / 2 + 200;

    const strips = ROADS.map(({ axis, offsetM, widthM }) => {
      const [runE, runN] = GRID_DIRECTIONS[axis];
      const [offE, offN] = axis === 'long' ? GRID_DIRECTIONS.cross : GRID_DIRECTIONS.long;
      const halfWidth = widthM / 2;

      // Centre of this road, at the point closest to the middle of the city.
      const alongCentre = centreE * runE + centreN * runN;
      const cx = runE * alongCentre + offE * offsetM;
      const cy = runN * alongCentre + offN * offsetM;

      const shape = new Shape();
      const corner = (along: number, across: number) => [
        cx + runE * along + offE * across,
        cy + runN * along + offN * across,
      ];

      const [ax, ay] = corner(-half, -halfWidth);
      const [bx, by] = corner(half, -halfWidth);
      const [cx2, cy2] = corner(half, halfWidth);
      const [dx, dy] = corner(-half, halfWidth);

      shape.moveTo(ax, ay);
      shape.lineTo(bx, by);
      shape.lineTo(cx2, cy2);
      shape.lineTo(dx, dy);
      shape.closePath();

      return new ShapeGeometry(shape);
    });

    const merged = mergeGeometries(strips, false);
    for (const strip of strips) strip.dispose();
    return merged;
  }, [model.extent]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      // Above the ground, below everything that stands on it.
      position={[0, 0, groundAhdM + 0.06]}
      receiveShadow
    >
      <meshStandardMaterial color="#f7f5ef" roughness={1} metalness={0} />
    </mesh>
  );
}
