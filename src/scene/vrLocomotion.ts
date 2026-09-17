/*
 * ─────────────────────────────────────────────────────────────────────────
 * TURNING AND STEPPING, AS ARITHMETIC
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The two sums VrWalk needs, with no three.js and no React in them, so they
 *   can be checked without a headset. Everything else in the VR path needs a
 *   device to exercise; this does not, and these are the parts where being
 *   wrong is silent rather than obvious.
 *
 * WHY THE PLAYER IS NOT WHERE THEIR ORIGIN IS
 *   In WebXR the thing the app positions is the FLOOR the person stands on —
 *   `XROrigin`, their feet as the app understands them. Where their head
 *   actually is depends on that origin PLUS wherever they have physically
 *   walked inside their room, and the app is not told which is which.
 *
 *   So the origin is the handle and the head is the person. Every question
 *   worth asking — what have I walked into, am I past the edge of the model,
 *   what am I turning around — is a question about the head. The answer is
 *   then applied to the origin, because the origin is the only part that can
 *   be moved.
 */

/**
 * Walking pace, metres per second — what a person actually does.
 *
 * It was the only speed for a while, and the desktop view still treats it as
 * the default with a key to hurry. In a headset there is a second reason to
 * respect it: speed a body cannot produce is one of the more reliable ways to
 * make somebody feel ill, because the eyes report motion the inner ear cannot
 * corroborate.
 */
export const WALK_MS = 1.4;

/** Flat out. The same figure the desktop view's Shift key gives. */
export const RUN_MS = 5.5;

/**
 * Below this the stick is not being pushed, it is being rested on.
 *
 * Thumbsticks do not return to exactly zero, and without a floor the player
 * drifts down the street while nobody is touching anything.
 */
const DEAD_ZONE = 0.12;

/**
 * Where walking ends and running begins, as a fraction of full deflection.
 *
 * WHY THERE IS A KNEE RATHER THAN ONE STRAIGHT LINE
 *   A single ramp from nothing to 5.5 m/s makes every ordinary speed a matter
 *   of holding a thumbstick at some precise fraction. Nobody can do that, so
 *   in practice the stick goes to the stop and the city is crossed at a
 *   sprint, which is both unpleasant to look at and the thing most likely to
 *   make somebody unwell.
 *
 *   Putting the knee at 0.85 gives most of the stick's travel to the speeds a
 *   person would actually walk at, and puts the run where the hardware has a
 *   feature you can feel: the gate at the edge. Pushing to the stop is a
 *   deliberate act, not a slip of the thumb.
 */
const RUN_FROM = 0.85;

/**
 * How fast to move, from how far the stick is pushed.
 *
 * @param deflection 0 at rest, 1 at the gate. Values above 1 are clamped —
 *   a stick reporting 1.02 on the diagonal should not run faster than one
 *   reporting 1.00.
 */
export function paceFor(deflection: number): number {
  const at = Math.min(1, Math.max(0, deflection));
  if (at <= DEAD_ZONE) return 0;
  if (at < RUN_FROM) {
    // Nothing to walking, across the comfortable part of the travel.
    return (WALK_MS * (at - DEAD_ZONE)) / (RUN_FROM - DEAD_ZONE);
  }
  // Walking to running, across the last of it.
  return WALK_MS + ((RUN_MS - WALK_MS) * (at - RUN_FROM)) / (1 - RUN_FROM);
}

/**
 * Which way a push on the walking stick goes, along the ground.
 *
 * WHY THE QUATERNION MUST BE THE WORLD ONE, AND IS NAMED SO
 *   @react-three/xr parents the XR camera to the origin group. A camera's own
 *   `quaternion` is therefore its orientation WITHIN the origin, and the
 *   stick rotation the app keeps on `group.rotation.y` is missing from it.
 *   Passing that instead of the world orientation compiles, type-checks, runs
 *   at the right speed, and walks the wrong way — after turning right 90° the
 *   view faced east and forward still went north. The parameter is named for
 *   the one thing about it that matters.
 *
 * WHY IT IS FLATTENED AND THEN NORMALISED, IN THAT ORDER
 *   Flattened, so that looking up at a tower and pushing forward does not
 *   lift the walker off the pavement. Normalised AFTERWARDS, so that looking
 *   down does not slow them: a direction pitched 40° down has only 77% of its
 *   length left once the vertical part is dropped, and without the second
 *   step the walker crawls whenever they look at their feet.
 *
 * @param stickX  the stick's horizontal axis, right positive
 * @param stickY  the stick's vertical axis, forward NEGATIVE — the gamepad
 *                convention, and the same sign three.js uses for forward
 * @param headingWorld the head's orientation IN THE WORLD
 * @param into    written in place; returns false and leaves it alone when the
 *                direction is degenerate, which happens when the head is
 *                looking straight down and there is no horizontal part left
 */
export function groundDirection(
  stickX: number,
  stickY: number,
  headingWorld: { x: number; y: number; z: number; w: number },
  into: { x: number; y: number; z: number },
): boolean {
  // Rotating a vector by a quaternion, written out rather than pulled in, so
  // this file stays free of three.js and can be checked against it instead of
  // agreeing with it by construction.
  const { x: qx, y: qy, z: qz, w: qw } = headingWorld;
  const vx = stickX;
  const vy = 0;
  const vz = stickY;

  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  const x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const z = iz * qw + iw * -qz + ix * -qy - iy * -qx;

  // The y component is deliberately never computed: it is about to be zero.
  const length = Math.hypot(x, z);
  if (length < 1e-6) return false;

  into.x = x / length;
  into.y = 0;
  into.z = z / length;
  return true;
}

/**
 * Where the origin must move so that a turn pivots on the head.
 *
 * WHY THIS IS NOT JUST `rotation.y += angle`
 *   Rotating the origin spins the player around their FEET AS PLACED — which
 *   is the middle of their room, not the middle of them. Anyone who has
 *   physically taken two steps is then swung sideways through an arc, in a
 *   headset, with no warning. It is one of the more reliable ways to make
 *   somebody ill, and it looks like the world lurching rather than like
 *   turning your head.
 *
 *   Turning about the head instead is what a person does when they turn on
 *   the spot. The origin swings around behind them and they do not move.
 *
 * HOW
 *   Rotate the origin about the head, by the same angle the origin itself is
 *   about to be turned by. Then the head, carried by the origin, lands
 *   exactly where it started.
 *
 *   Derivation, with H the head, O the origin and R the rotation: after
 *   turning, the head sits at O' + R(H − O). Setting that equal to H gives
 *   O' = H + R(O − H), which is the line below.
 *
 * @param origin x and z of the origin, three.js world metres
 * @param head   x and z of the head, three.js world metres
 * @param radians how far the origin is being turned, about +y
 */
export function turnAbout(
  [ox, oz]: readonly [number, number],
  [hx, hz]: readonly [number, number],
  radians: number,
): [number, number] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = ox - hx;
  const dz = oz - hz;
  /*
   * three.js rotates about +y as [cos, 0, sin; 0, 1, 0; -sin, 0, cos]. Using
   * the textbook 2D rotation here instead turns the player the wrong way,
   * which reads as a correct feature with an inverted setting rather than as
   * a bug — so it is written out in the same form the renderer uses.
   */
  return [hx + dx * cos + dz * sin, hz - dx * sin + dz * cos];
}

/**
 * Hold a point inside the modelled city.
 *
 * Past the edge there is only haze: the ground disc stops, and a walker out
 * there stands on nothing looking back at a city floating in the middle
 * distance. The desktop street view has the same fence — see StreetView — and
 * for the same reason.
 *
 * Returns the point unchanged when it is already inside, so the caller can
 * apply the result unconditionally.
 *
 * @param point  east and north, metres
 * @param centre east and north of the middle of the model
 * @param radiusM how far from that middle the walker may go
 */
export function insideBounds(
  [e, n]: readonly [number, number],
  [ce, cn]: readonly [number, number],
  radiusM: number,
): [number, number] {
  const de = e - ce;
  const dn = n - cn;
  const distance = Math.hypot(de, dn);
  if (distance <= radiusM) return [e, n];
  /*
   * Dead centre is the only point with no direction to be pushed back along.
   * It cannot be outside a positive radius, but a radius of zero would divide
   * by zero here rather than at the call site, where nobody would look for it.
   */
  if (distance === 0) return [ce, cn];
  return [ce + (de / distance) * radiusM, cn + (dn / distance) * radiusM];
}
