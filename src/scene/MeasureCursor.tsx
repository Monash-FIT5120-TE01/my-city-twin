/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE GROUND, VISIBLY ASKING TO BE CLICKED
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT IS
 *   A faint ring that follows the pointer across the ground while a spot can
 *   be measured, and a crosshair cursor while it is over it.
 *
 * WHY IT EXISTS
 *   Measuring a point is what this product is FOR — every sunlight figure in
 *   it starts with somebody clicking a piece of footpath — and the ground was
 *   the one interactive thing in the scene with no sign that it was
 *   interactive at all. Buildings change the cursor on hover. The ground did
 *   not change anything.
 *
 *   What it had instead was a sentence in the panel: "Click anywhere on the
 *   ground to measure…". That is not an affordance. People do not read a
 *   paragraph and then go looking for what it described; they look for
 *   something that appears pressable, and if nothing does, they stop. Being
 *   told about an action and being shown one are different events.
 *
 * WHY IT IS DRAWN AND NOT JUST A CURSOR
 *   A crosshair says "this surface responds". The ring says WHERE — which
 *   matters here more than usual, because the pointer is on a screen and the
 *   thing being chosen is a point on a plane seen at an angle. From a high
 *   oblique the ground under the cursor can be fifty metres from where it
 *   looks, and the ring is the only way to know before committing.
 *
 * WHY ITS VISIBILITY IS NOT REACT STATE EITHER
 *   The first version held "is the pointer over the ground" in useState and
 *   drove `visible` from it. It broke the moment a point was placed: the
 *   marker that appeared took the raycast, the ground reported a leave, the
 *   state went false — and because the reader was now looking at their
 *   result rather than moving the mouse, no further event arrived to put it
 *   back. The ring was gone for the rest of the session.
 *
 *   Disabling the raycast on everything that floats over the ground fixed
 *   that particular thief and did not fix the class of problem: a cursor
 *   whose visibility lives in React state is only correct as long as every
 *   enter is matched by a leave, and pointer events make no such promise.
 *
 *   So the owner sets `visible` on the object directly, in the same handlers
 *   that set the position. There is no state to fall out of step, and a
 *   re-render cannot undo it — `visible` is deliberately NOT passed as a
 *   prop, because a prop is what the renderer would reassert.
 *
 * WHY IT MOVES WITHOUT RE-RENDERING
 *   Pointer moves fire dozens of times a second. Putting the position into
 *   React state would re-render this component, its parent and the whole
 *   scene graph beneath it on every one of them. The ring's position is
 *   written straight onto the object instead, which is what a cursor is: a
 *   thing that follows, not a thing that is re-derived.
 *
 * WHERE IT SITS IN THE FRAME
 *   INSIDE <WorldFrame>, like the receptor marker it is a preview of, so it
 *   takes east/north/up straight with no conversion and needs no rotation —
 *   the ring's own plane is already the ground plane. Converting here would
 *   stand it on its edge, which is the mistake frame.ts records twice.
 */

import { useRef } from 'react';
import type { Group } from 'three';

/**
 * Slightly smaller than the marker it precedes, so that placing a point
 * reads as the ring settling into its final size rather than as one shape
 * being swapped for another.
 */
const INNER_M = 5.5;
const OUTER_M = 8;

export function MeasureCursor({
  groundAhdM,
  innerRef,
}: {
  groundAhdM: number;
  /**
   * Handed in by the owner of the ground, which is where the pointer events
   * arrive. It writes the east/north AND the visibility straight onto this
   * group — see the note above on why neither is a prop.
   */
  innerRef: React.RefObject<Group | null>;
}) {
  const ring = useRef<Group>(null);
  return (
    <group ref={innerRef}>
      <group ref={ring} position={[0, 0, groundAhdM + 0.6]}>
        {/*
          Unlit and never tone-mapped: it is an instrument, not part of the
          city, and it has to read the same at noon and at dusk. depthWrite
          off so it cannot shadow or occlude anything it is laid over.
        */}
        <mesh raycast={() => null}>
          <ringGeometry args={[INNER_M, OUTER_M, 48]} />
          <meshBasicMaterial
            color="#e89a21"
            toneMapped={false}
            depthWrite={false}
            transparent
            /*
              Faint. It is a preview of a choice, not the choice — at the
              marker's own strength the reader could not tell which of the
              two rings on screen was the measured one.
            */
            opacity={0.55}
          />
        </mesh>
      </group>
    </group>
  );
}
