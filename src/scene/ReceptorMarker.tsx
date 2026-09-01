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
      <mesh>
        <ringGeometry args={[7, 10, 48]} />
        <meshBasicMaterial color="#e89a21" toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[3.2, 32]} />
        <meshBasicMaterial color="#e89a21" toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}
