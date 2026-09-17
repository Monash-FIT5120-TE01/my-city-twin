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
 * ── HOW WIDE TO CAST THE NET, AND WHY IT IS NOT A CONSTANT ────────────────
 *
 * A fixed radius answers the wrong question. It asks "which streets are near
 * the point the camera is orbiting", and what a reader wants is "which
 * streets can I see". Those agree only at one zoom. Pulled back over the
 * whole city, a 340 m radius named the handful of streets around the orbit
 * target and left every street actually on screen unlabelled.
 *
 * Tying it to how far the camera has pulled back makes it the same question
 * at every zoom: a wide shot covers more ground, so more of it gets named.
 *
 * The floor keeps at least the surrounding block named when standing close
 * in; the ceiling stops a fully zoomed-out view from labelling the entire
 * extract at once, which is the crowding this radius exists to prevent.
 */
const RADIUS_PER_DISTANCE = 0.5;
const RADIUS_MIN_M = 260;
const RADIUS_MAX_M = 1300;

/** A zoom has to change by this much before the names are reconsidered. */
const RESEAT_ZOOM_RATIO = 1.2;

const radiusFor = (cameraDistanceM: number) =>
  Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, cameraDistanceM * RADIUS_PER_DISTANCE));

/**
 * Street names lying flat on the road, as in the design.
 *
 * They follow the view. Every screen in the design has street names visible
 * near whatever is being looked at, because that is what tells a resident
 * which part of the city they are seeing — and it matters most when zoomed
 * in, where there are no other landmarks. Names pinned to one fixed spot
 * would leave the frame as soon as anyone panned.
 *
 * Rendered as DOM through drei's <Html transform> rather than as 3D text,
 * which keeps them in the interface typeface and avoids a font loader
 * entirely. 3D text wants a font FILE, and the interface has none to give
 * it: the type is the stack the operating system already has, which exists
 * for CSS to ask for and not as an asset anything can load.
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
  const controls = useThree((state) => state.controls) as {
    target?: { x: number; y: number; z: number };
  } | null;
  const camera = useThree((state) => state.camera);
  const [view, setView] = useState<{ east: number; north: number; radiusM: number }>({
    east: initialEast,
    north: initialNorth,
    radiusM: RADIUS_MIN_M,
  });
  const seated = useRef(view);

  useFrame(() => {
    const target = controls?.target;
    if (!target) return;

    // The orbit target is in three's world frame; enuToWorld sent
    // (east, north, up) to (east, up, -north), so this reads it back.
    const east = target.x;
    const north = -target.z;

    const radiusM = radiusFor(
      Math.hypot(
        camera.position.x - target.x,
        camera.position.y - target.y,
        camera.position.z - target.z,
      ),
    );

    /*
     * Two reasons to reconsider, and zooming is the one that is easy to
     * forget: it does not move the orbit target at all, so a check on
     * position alone left the names as they were while the view they were
     * chosen for changed underneath them.
     */
    const previous = seated.current;
    const moved = Math.hypot(east - previous.east, north - previous.north);
    const zoomed = Math.max(radiusM / previous.radiusM, previous.radiusM / radiusM);
    if (moved < RESEAT_DISTANCE_M && zoomed < RESEAT_ZOOM_RATIO) return;

    const next = { east, north, radiusM };
    seated.current = next;
    setView(next);
  });

  const labels = streetLabelsNear(view.east, view.north, view.radiusM);

  return (
    <group>
      {labels.map((label) => (
        <Html
          key={label.name}
          transform
          /*
           * 1.2 m, and the number is doing two jobs.
           *
           * It clears the road surface so the name is not z-fighting it, and
           * it gives the occlusion below something to work with: that test
           * compares depths, and a label lying IN the ground plane is hidden
           * by the ground plane -- at 0.4 m every name disappeared.
           *
           * It is not higher because the name is meant to read as paint on
           * the road. Seen from a typical oblique the lift shifts it about a
           * metre and a half across a street 30 m wide; at 6 m, where the
           * occlusion is no more correct, it is seven, and the name visibly
           * floats off the carriageway.
           */
          position={enuToWorld([label.east, label.north, groundAhdM + 1.2])}
          rotation={[-Math.PI / 2, label.rotation, 0, 'YXZ']}
          // Holds the name at a steady size on screen however far the camera
          // is, so the names stay legible when zoomed right in.
          distanceFactor={90}
          /*
           * NO OCCLUSION, AND IT IS A TRADE RATHER THAN AN OVERSIGHT.
           *
           * DOM has no depth buffer, so a name whose street is behind a tower
           * still paints over the tower. drei can hide it -- "blending" puts
           * the canvas above these elements and punches a hole the size of
           * each one to let it show through. It works, and the hole is the
           * price: everything the label does not paint itself becomes a
           * window onto the page behind the map, so the name needs an opaque
           * plate under it, and the plate is a white box on the road.
           *
           * The box was the worse of the two faults to look at, so it went.
           * Most of what looked like "the name is on a building" was the
           * placement, not the painting -- Spencer Street was 77 m off its
           * carriageway and the long streets ran past their own ends. With
           * those measured properly the names sit in the carriageways, and
           * what is left is the genuine case of a street hidden behind a
           * tower.
           *
           * The way to have both is raycast occlusion, which hides the whole
           * label instead of clipping it and needs no hole: occlude={[ref]}
           * against the massing. It costs a ray per label per frame against
           * the merged city, so it would have to be throttled to the moments
           * the view settles rather than run every frame.
           */
          pointerEvents="none"
          zIndexRange={[1, 0]}
        >
          <span className="street-label">{label.name}</span>
        </Html>
      ))}
    </group>
  );
}
