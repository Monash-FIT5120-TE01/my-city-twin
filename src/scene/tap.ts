/*
 * ─────────────────────────────────────────────────────────────────────────
 * TELLING A CLICK FROM THE END OF A DRAG
 * ─────────────────────────────────────────────────────────────────────────
 *
 * THE BUG THIS EXISTS FOR
 *   The left button does two jobs in this scene. It pans the camera, and it
 *   picks things — a spot on the ground to measure, a building to open.
 *
 *   A DOM click is just "pressed and released on the same element", and a
 *   pan ends exactly that way: press on the ground, drag the city around,
 *   release still over the ground. So every time somebody moved the view
 *   they also placed a measurement point they did not ask for, and every
 *   drag that happened to finish over a tower opened that tower's project
 *   page. Both were reported as the camera "randomly" doing things.
 *
 * WHY IT WATCHES THE WHOLE GESTURE AND NOT JUST ITS ENDS
 *   The first version compared where the press landed with where the
 *   release landed, which is not the same question. Pan a hundred pixels
 *   across the city, bring the pointer back to where it started, and let go:
 *   the displacement is zero, and it was accepted as a click. The camera had
 *   moved the whole time.
 *
 *   So the gesture is watched as it happens. Once it has travelled far
 *   enough to be a drag it stays one, however it finishes.
 *
 * WHY DISTANCE AND NOT TIME
 *   A slow, careful click is still a click — somebody lining up a spot on a
 *   footpath may well hold the button for a second while they check. And a
 *   fast flick of the camera is still a drag. Duration says nothing useful;
 *   movement says everything.
 *
 * WHY THE THRESHOLD IS NOT ZERO
 *   A hand on a mouse moves a pixel or two during a click, and a fingertip
 *   on glass moves several. At zero, half of all genuine clicks would be
 *   discarded as drags, which is the same complaint from the other side.
 */

/**
 * How far the pointer may travel and still count as a click, in CSS pixels.
 *
 * Five is the figure most pointer-gesture code settles on, and it holds up
 * here: below about three, ordinary mouse jitter starts eating real clicks;
 * above about eight, a deliberate short drag of the camera starts landing a
 * measurement point at the end of it.
 *
 * It is measured in screen pixels rather than in metres of city on purpose.
 * The question is what the HAND did, and the hand is on a screen — the same
 * five-pixel wobble is a metre of ground zoomed in and a hundred zoomed out.
 */
export const TAP_SLOP_PX = 5;

export interface PointerAt {
  clientX: number;
  clientY: number;
}

/**
 * What is remembered about a press while it is still going on.
 *
 * `strayed` is the whole point: it latches. Once true it stays true, which
 * is what makes a drag that wanders back to its origin still a drag.
 */
export interface Gesture {
  from: PointerAt;
  strayed: boolean;
}

/** Called on pointer down. */
export function beginTap(at: PointerAt): Gesture {
  return { from: { clientX: at.clientX, clientY: at.clientY }, strayed: false };
}

/**
 * Called on every pointer move while the button is down.
 *
 * Mutates rather than returning a new gesture: this runs dozens of times a
 * second and is held in a ref, where a new object each time would be
 * allocation for nothing. Returns the gesture for convenience.
 */
export function trackTap(gesture: Gesture | null, at: PointerAt): Gesture | null {
  if (!gesture || gesture.strayed) return gesture;
  if (beyondSlop(gesture.from, at)) gesture.strayed = true;
  return gesture;
}

/** The distance test on its own, so both callers below agree about it. */
function beyondSlop(from: PointerAt, to: PointerAt): boolean {
  return Math.hypot(to.clientX - from.clientX, to.clientY - from.clientY) > TAP_SLOP_PX;
}

/**
 * Whether the gesture that is ending was a drag.
 *
 * True if it ever strayed, and true if it ends far from where it began —
 * the second catches a release that arrives with no moves in between, which
 * happens when the pointer is captured elsewhere for the duration.
 *
 * A null gesture means no press was seen: the press began somewhere else and
 * the release landed here. That is not a click on this object by any
 * reading, so it counts as a drag and is ignored.
 */
export function wasDragged(gesture: Gesture | null, to: PointerAt): boolean {
  if (!gesture) return true;
  return gesture.strayed || beyondSlop(gesture.from, to);
}
