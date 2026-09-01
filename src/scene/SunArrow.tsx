import { useMemo } from 'react';
import { DoubleSide, Shape, ShapeGeometry } from 'three';
import { shadowBearingDeg } from './narrative';
import { shadowReachM, type SunAngles } from './sun';

interface SunArrowProps {
  sun: SunAngles;
  /** Where the arrow starts, in east/north metres. */
  anchorEN: [number, number];
  /** Metres AHD of the road it is drawn on. */
  groundAhdM: number;
  /** Height of the thing casting, so the arrow can be as long as its shadow. */
  heightM: number;
}

const DEG = Math.PI / 180;

/**
 * Spin about the up axis that turns a shape drawn along +x onto the direction
 * the light travels.
 *
 * Inside <WorldFrame> local x is east and local y is north, so a rotation of
 * θ sends +x to (cos θ, sin θ). The shadow runs along
 * (sin(bearing), cos(bearing)) because bearings are clockwise from north —
 * hence the swapped arguments to atan2. Exported so the sign is pinned by a
 * test rather than by eye; the street labels were wrong this way once.
 */
export function groundArrowRotation(sunAzimuthDeg: number): number {
  const bearing = shadowBearingDeg(sunAzimuthDeg) * DEG;
  return Math.atan2(Math.cos(bearing), Math.sin(bearing));
}

/** Beyond this the arrow stops being readable and starts crossing the grid. */
const MAX_LENGTH_M = 900;
const MIN_LENGTH_M = 90;

/**
 * The direction the light travels, drawn on the ground.
 *
 * The Figma puts this arrow on the screen, next to the "SUN 10:00 · FROM EAST"
 * chip. On screen it can only be right for one camera angle: the moment the
 * view is orbited, a fixed arrow points somewhere the sun is not. Drawn on the
 * ground instead it is a fact about the city rather than about the viewport,
 * and it stays true through every rotation.
 *
 * Its length is the shadow's reach, clamped — so it is a measurement of how
 * far the shadow gets, not an ornament. Where the sun is high enough that the
 * reach is trivial, the arrow shrinks to its minimum and says so by being
 * short.
 */
export function SunArrow({ sun, anchorEN, groundAhdM, heightM }: SunArrowProps) {
  const reach = shadowReachM(heightM, sun.altitudeDeg);

  const geometry = useMemo(() => {
    if (reach === null) return null;

    const length = Math.min(MAX_LENGTH_M, Math.max(MIN_LENGTH_M, reach));
    const headLength = Math.min(76, length * 0.28);
    const shaftHalf = 5.5;
    const headHalf = 20;
    const shaftEnd = length - headLength;

    // Drawn pointing along +x; the mesh below turns it onto the bearing.
    const shape = new Shape();
    shape.moveTo(0, -shaftHalf);
    shape.lineTo(shaftEnd, -shaftHalf);
    shape.lineTo(shaftEnd, -headHalf);
    shape.lineTo(length, 0);
    shape.lineTo(shaftEnd, headHalf);
    shape.lineTo(shaftEnd, shaftHalf);
    shape.lineTo(0, shaftHalf);
    shape.closePath();

    return new ShapeGeometry(shape);
  }, [reach]);

  if (!geometry || reach === null) return null;

  // Inside <WorldFrame> the shape's own plane is already horizontal, so the
  // only rotation needed is the spin onto the shadow's bearing.
  const rotation = groundArrowRotation(sun.azimuthDeg);

  return (
    <mesh
      geometry={geometry}
      position={[anchorEN[0], anchorEN[1], groundAhdM + 0.7]}
      rotation={[0, 0, rotation]}
      // Over the road, under the buildings: it is an annotation on the ground,
      // not a thing standing on it.
      renderOrder={2}
    >
      <meshBasicMaterial
        color="#e89a21"
        transparent
        opacity={0.88}
        side={DoubleSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
