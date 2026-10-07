/*
 * WALKING BY TOUCH — what the on-screen stick says, for the street view.
 *
 * On a phone there are no keys and no pointer lock: the stick (ui/TouchWalk.tsx) writes how far it is pushed
 * here, and StreetView reads it every frame as it reads the keys on a desktop. Looking round is a drag on the
 * city itself, handled in StreetView.
 */

export const touchWalk = {
  /** The stick: x to the right, y forward, each -1..1 (0, 0 at rest). */
  move: [0, 0] as [number, number],
};

/** A phone or tablet: walked by touch rather than keys and a locked pointer. */
export function walksByTouch(): boolean {
  if (typeof navigator === 'undefined' || typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;
}
