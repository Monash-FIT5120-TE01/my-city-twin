/**
 * The window whose sunlight is being counted.
 *
 * A small square standing ON the facade, not a ring on the ground: the thing
 * being measured is a hole in a wall, and the reader has answered a question
 * about a floor and a side. Without it they have chosen "floor 12, north" out
 * of a list and have no way to check that the app understood the same flat
 * they meant.
 *
 * INSIDE <WorldFrame>, SO NOTHING HERE CONVERTS ANYTHING.
 *
 * This was written with a frame conversion around its position, copied from
 * markers that sit OUTSIDE the frame. CityMassing renders it, CityMassing is
 * inside <WorldFrame>, and the frame has already done that rotation — so the
 * conversion ran twice and sent (east, north, up) to (east, -north, -height).
 * The marker was under the city, upside down, which is why it could not be
 * found on any facade. frame-boundary.test.ts lists this file among those
 * that must not convert.
 *
 * IT REFUSES THE RAYCAST, for the reason every annotation in this scene does:
 * it reports a result and must never intercept the gesture that produces one.
 *
 * BOTH MATERIALS SAY `transparent` BECAUSE BOTH SAY `depthWrite={false}`.
 * The two only work as a pair — an object that does not write depth but is
 * drawn in the opaque pass is painted over by whatever is drawn after it.
 * ReceptorMarker was invisible for exactly that reason once.
 */

import { DoubleSide } from 'three';

/**
 * Big enough to FIND, which is the job.
 *
 * Three metres is the honest size of a window and it is also invisible: on a
 * 267 m tower seen from across the city it is under two pixels. This is a
 * marker, not a model of a pane, and a marker nobody can see does not confirm
 * anything. Eight metres is about two flats wide and still reads as a patch
 * of one facade rather than a floor of it.
 */
const SIZE_M = 8;

/**
 * How far to stand it off the wall.
 *
 * Half a metre put it inside the highlight shell drawn over a searched
 * building, where the depth test quietly discarded it.
 */
const OFF_WALL_M = 1.5;

/**
 * Draws the marker at a place, on the side it faces.
 *
 * `en` and `ahdM` come straight from WindowPlace, and `facingDeg` is the
 * bearing the wall looks along — the plate is turned to lie flat against it
 * rather than facing the camera, because it is standing in for part of a
 * building rather than labelling one.
 */
export function WindowMarker({
  en,
  ahdM,
  facingDeg,
}: {
  en: [number, number];
  ahdM: number;
  /** The way the wall looks, so the plate can lie flat against it. */
  facingDeg: number;
}) {
  const [east, north] = en;

  /*
   * Two nested turns rather than one Euler triple, because the order of an
   * Euler triple is a thing to get wrong and nesting is not: the inner one
   * happens first, the outer one after it.
   *
   * Inside the frame the axes are east, north and up. A plane faces its own
   * +z, which is UP here, so the inner quarter turn about east stands it
   * upright facing north, and the outer turn about up swings that north onto
   * the bearing. DoubleSide is insurance: a marker that vanishes when the
   * camera crosses the wall would read as a bug in the measurement.
   */
  const facing = (facingDeg * Math.PI) / 180;

  return (
    <group
      position={[
        east + Math.sin(facing) * OFF_WALL_M,
        north + Math.cos(facing) * OFF_WALL_M,
        ahdM,
      ]}
      rotation={[0, 0, -facing]}
      raycast={() => null}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[SIZE_M, SIZE_M]} />
        <meshBasicMaterial
          color="#14624a"
          transparent
          opacity={0.34}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>

      {/* A brighter edge, so it reads as a marked pane and not a smudge. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[SIZE_M * 0.52, SIZE_M * 0.62, 4]} />
        <meshBasicMaterial
          color="#14624a"
          transparent
          opacity={0.9}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
