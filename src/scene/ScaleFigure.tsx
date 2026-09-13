/*
 * Something 1.7 metres tall to look at.
 *
 * WHY
 *   Eye height alone does not give scale. A blank wall forty metres away and
 *   a blank wall four hundred metres away look the same when neither has a
 *   window, a door, or anything else of known size on it — which is exactly
 *   what LOD1 massing is. Without a reference the city reads as a model of
 *   unknown size that the camera happens to be inside.
 *
 *   One object of a size everybody knows fixes that for the whole view.
 *
 * WHY IT IS A MARKER AND NOT A PERSON
 *   It is drawn as an obvious annotation and labelled with its height. A
 *   naturalistic figure — still less a crowd of them — would be a claim
 *   about who uses this street and when, on a model that knows only where
 *   the buildings are. The same line the lit windows crossed.
 *
 * WHAT IT MUST NOT TOUCH
 *   It casts no shadow, receives none, and cannot be clicked. The measured
 *   figures come from geometry, and a decoration that could shade a receptor
 *   or intercept a pick would be able to change them.
 */

import { Html } from '@react-three/drei';
import { EYE_HEIGHT_M } from './StreetView';

/** A person's height, and the height the camera is at. The point is that they match. */
const HEIGHT_M = EYE_HEIGHT_M;
const WIDTH_M = 0.42;
const DEPTH_M = 0.24;

export function ScaleFigure({
  atEN,
  groundAhdM,
}: {
  atEN: [number, number];
  groundAhdM: number;
}) {
  return (
    <group position={[atEN[0], atEN[1], groundAhdM]}>
      {/*
        Inside <WorldFrame>, so +z is up and the box stands on the ground by
        being raised half its own height.
      */}
      <mesh position={[0, 0, HEIGHT_M / 2]} raycast={() => null}>
        <boxGeometry args={[WIDTH_M, DEPTH_M, HEIGHT_M]} />
        {/*
          Dark and unlit. Unlit because it is an annotation rather than part
          of the city — it should read the same at noon and at dusk — and
          dark because everything around it is near-white, so lightness alone
          separates it without depending on hue.
        */}
        <meshBasicMaterial color="#1d2b24" toneMapped={false} />
      </mesh>

      <Html
        position={[0, 0, HEIGHT_M + 0.35]}
        center
        distanceFactor={18}
        occlude={false}
        // Never in the way of a click on the ground behind it.
        style={{ pointerEvents: 'none' }}
      >
        <span className="scale-figure__label">1.7 m · scale reference</span>
      </Html>
    </group>
  );
}
