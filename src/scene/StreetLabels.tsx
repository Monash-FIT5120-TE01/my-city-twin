import { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { enuToWorld } from './frame';
import { streetLabelsNear } from './streets';
import '../styles/street-labels.css';

interface StreetLabelsProps {
  /** Where the names gather before the camera has moved, east/north metres. */
  initialEast: number;
  initialNorth: number;
  /** Ground elevation, metres AHD, so names sit on the road surface. */
  groundAhdM: number;
}

/**
 * How far the view has to move before the names are repositioned.
 *
 * A street name is a line, not a point, so sliding it along its own street
 * costs nothing visually — but doing that every frame would re-render twelve
 * DOM nodes at 60 Hz for no gain. Half a block is small enough that a name is
 * always within reach and large enough that panning does not thrash.
 */
const RESEAT_DISTANCE_M = 40;

/**
 * Street names lying flat on the road, as in the Figma.
 *
 * They follow the view. Every screen in the design has street names visible
 * near whatever is being looked at, because that is what tells a resident
 * which part of the city they are seeing — and it matters most when zoomed
 * in, where there are no other landmarks. Names pinned to one fixed spot
 * would leave the frame as soon as anyone panned.
 *
 * Rendered as DOM through drei's <Html transform> rather than as 3D text,
 * which keeps them in the interface typeface and avoids a font loader:
 * troika wants a .ttf and the fonts here are the woff files @fontsource ships.
 *
 * These sit OUTSIDE <WorldFrame>, unlike everything else in the scene.
 * <Html transform> builds a CSS3D matrix from the object's world transform,
 * and composing that with the frame's -90° rotation does not give the
 * orientation the numbers say it should. Stating the world transform directly
 * removes the composition, at the cost of the one enuToWorld call below.
 *
 * Orientation is Euler order YXZ, which composes as Ry · Rx:
 *
 *   Rx(-90°) turns the plane face-up — its normal (0,0,1) becomes (0,1,0),
 *            while its +x axis is untouched.
 *   Ry(θ)    swings that +x onto (cos θ, 0, -sin θ) = (runE, 0, -runN),
 *            which is exactly enuToWorld of the street direction.
 *
 * The sign of the X rotation is the whole trick: Rx(+90°) sends the normal to
 * (0,-1,0) instead, and the label lies face-down under the road, seen from
 * behind and mirrored.
 */
export function StreetLabels({ initialEast, initialNorth, groundAhdM }: StreetLabelsProps) {
  const controls = useThree((state) => state.controls) as { target?: { x: number; z: number } } | null;
  const [anchor, setAnchor] = useState<[number, number]>([initialEast, initialNorth]);
  const seated = useRef<[number, number]>([initialEast, initialNorth]);

  useFrame(() => {
    const target = controls?.target;
    if (!target) return;

    // The orbit target is in three's world frame; enuToWorld sent
    // (east, north, up) to (east, up, -north), so this reads it back.
    const east = target.x;
    const north = -target.z;

    const [seatedE, seatedN] = seated.current;
    if (Math.hypot(east - seatedE, north - seatedN) < RESEAT_DISTANCE_M) return;

    seated.current = [east, north];
    setAnchor([east, north]);
  });

  const labels = streetLabelsNear(anchor[0], anchor[1]);

  return (
    <group>
      {labels.map((label) => (
        <Html
          key={label.name}
          transform
          // Just clear of the road so the name is not z-fighting the ground.
          position={enuToWorld([label.east, label.north, groundAhdM + 0.4])}
          rotation={[-Math.PI / 2, label.rotation, 0, 'YXZ']}
          // Holds the name at a steady size on screen however far the camera
          // is, so the names stay legible when zoomed right in.
          distanceFactor={90}
          pointerEvents="none"
          zIndexRange={[1, 0]}
        >
          <span className="street-label">{label.name}</span>
        </Html>
      ))}
    </group>
  );
}
