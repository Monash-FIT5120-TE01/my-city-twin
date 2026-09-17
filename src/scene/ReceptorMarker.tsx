/**
 * The spot whose sunlight is being counted.
 *
 * A ring on the ground rather than a pin: the question is about a place on
 * the footpath, and a pin floating above it would suggest a building.
 *
 * This renders INSIDE <WorldFrame>, unlike SiteLabel and SitePin — so it
 * takes east/north/up straight, with no conversion, and needs no rotation
 * either: inside the frame the ring's own plane is already the ground plane.
 * Copying the pattern from those two put it through the conversion twice and
 * stood it on its edge. frame-boundary.test.ts now checks this mechanically.
 *
 * IT IS NOT A TARGET. Both meshes refuse the raycast.
 *
 *   It sits 0.9 m above the ground, so without this it becomes the nearest
 *   thing under the pointer the moment it is placed. The ground then reports
 *   a pointer-out, the hover ring vanishes, and the next click lands on the
 *   marker instead of on the city — so the one gesture the sunlight screen
 *   exists for stopped working immediately after being used once.
 *
 *   It is an annotation. Nothing that only reports a result should be able
 *   to intercept the gesture that produces one; ScaleFigure refuses the
 *   raycast for the same reason.
 *
 * WHY BOTH MATERIALS SAY `transparent`, WITH NOTHING TRANSPARENT ABOUT THEM
 *   Because they also say `depthWrite={false}`, and the two only work as a
 *   pair. This marker was invisible for exactly that reason.
 *
 *   Opaque objects are drawn NEAREST FIRST, and each one records its depth
 *   so that the things behind it can be skipped. With depth writing off, the
 *   marker was drawn — a metre above the ground, correctly, first — and
 *   recorded nothing. The ground then arrived, found the depth buffer still
 *   empty at those pixels, passed the test it should have failed, and
 *   painted straight over it.
 *
 *   Nothing was wrong with the position, the size, the colour or the frame.
 *   It was drawn every frame and immediately covered up, which is why there
 *   was no error to find and why the panel could report a result for a point
 *   that could not be seen.
 *
 *   `transparent` moves it to the pass that runs AFTER all the opaque
 *   geometry, where not writing depth is the normal and correct thing to do.
 *   MeasureCursor and SunArrow already had the pair; this had half of it.
 */
export function ReceptorMarker({
  point,
  groundAhdM,
}: {
  point: [number, number];
  groundAhdM: number;
}) {
  return (
    <group position={[point[0], point[1], groundAhdM + 0.9]}>
      <mesh raycast={() => null}>
        <ringGeometry args={[7, 10, 48]} />
        <meshBasicMaterial
          color="#e89a21"
          toneMapped={false}
          transparent
          depthWrite={false}
        />
      </mesh>
      <mesh raycast={() => null}>
        <circleGeometry args={[3.2, 32]} />
        <meshBasicMaterial
          color="#e89a21"
          toneMapped={false}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
