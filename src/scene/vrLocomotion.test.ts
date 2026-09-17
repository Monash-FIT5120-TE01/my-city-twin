import { describe, expect, it } from 'vitest';
import { Euler, Group, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import {
  RUN_MS,
  WALK_MS,
  groundDirection,
  insideBounds,
  paceFor,
  turnAbout,
} from './vrLocomotion';

/*
 * The point of these is that a headset is not needed to find out. Everything
 * else in the VR path — the session, the controllers, the reference space —
 * needs a device; these two sums do not, and they are where being wrong is
 * silent. A turn that pivots on the wrong point still turns.
 */

describe('turning about the head', () => {
  it('leaves the head exactly where it was', () => {
    const head: [number, number] = [12, -30];
    const origin: [number, number] = [10, -34];

    for (const degrees of [30, -30, 45, 90, 180, -7.5]) {
      const radians = degrees * (Math.PI / 180);
      const [nx, nz] = turnAbout(origin, head, radians);

      /*
       * Carry the head through the same move the renderer would: the origin
       * goes to its new place and the head rides on it, rotated about the
       * origin. three.js is doing the rotation here rather than a second copy
       * of the formula, so the test would catch the sine convention being
       * wrong — which the formula alone cannot.
       */
      const carried = new Vector3(head[0] - origin[0], 0, head[1] - origin[1])
        .applyEuler(new Euler(0, radians, 0))
        .add(new Vector3(nx, 0, nz));

      expect(carried.x).toBeCloseTo(head[0], 10);
      expect(carried.z).toBeCloseTo(head[1], 10);
    }
  });

  it('keeps the origin the same distance from the head', () => {
    const head: [number, number] = [0, 0];
    const origin: [number, number] = [3, 4];
    const [nx, nz] = turnAbout(origin, head, 1.1);
    expect(Math.hypot(nx, nz)).toBeCloseTo(5, 10);
  });

  it('does nothing at all when the angle is zero', () => {
    expect(turnAbout([7, -2], [1, 1], 0)).toEqual([7, -2]);
  });

  it('does nothing when the head is already the pivot', () => {
    const [nx, nz] = turnAbout([5, 5], [5, 5], 0.9);
    expect(nx).toBeCloseTo(5, 10);
    expect(nz).toBeCloseTo(5, 10);
  });
});

describe('which way forward is', () => {
  /*
   * Built as the real thing is built: a camera parented to the origin group,
   * which is what @react-three/xr does — `group.add(xrCamera)` in XROrigin.
   * That parenting is the whole reason these tests exist, so it is
   * reproduced rather than assumed.
   */
  const rig = (originTurnY: number, headTurnY = 0, headPitchX = 0) => {
    const origin = new Group();
    origin.rotation.y = originTurnY;
    const camera = new PerspectiveCamera();
    camera.rotation.order = 'YXZ';
    camera.rotation.y = headTurnY;
    camera.rotation.x = headPitchX;
    origin.add(camera);
    origin.updateMatrixWorld(true);
    return { origin, camera };
  };

  const world = (camera: PerspectiveCamera) => camera.getWorldQuaternion(new Quaternion());

  /** Stick pushed straight forward. The gamepad reports −1 for forward. */
  const FORWARD: [number, number] = [0, -1];

  it('walks the way the head is facing when nothing has been turned', () => {
    const { camera } = rig(0);
    const into = new Vector3();
    expect(groundDirection(...FORWARD, world(camera), into)).toBe(true);
    expect(into.x).toBeCloseTo(0, 6);
    expect(into.z).toBeCloseTo(-1, 6);
  });

  it('follows a turn applied to the ORIGIN, not only to the head', () => {
    /*
     * THE BUG THIS FILE EXISTS FOR.
     *
     * Turning is done by rotating the origin group. Read from the camera's
     * OWN quaternion the rotation is invisible — the camera has not moved
     * relative to its parent — so the walker kept going north while the view
     * faced east. Turned a further 90° it walked backwards.
     */
    const { camera } = rig(-Math.PI / 2); // a right turn: −90° about +y
    const into = new Vector3();
    groundDirection(...FORWARD, world(camera), into);

    // Facing east now, so forward is +x.
    expect(into.x).toBeCloseTo(1, 6);
    expect(into.z).toBeCloseTo(0, 6);

    // And the reading that caused it, kept as the counter-example: the local
    // quaternion is the identity, so it would still have walked north.
    const local = new Vector3();
    groundDirection(...FORWARD, camera.quaternion, local);
    expect(local.z).toBeCloseTo(-1, 6);
    expect(local.x).toBeCloseTo(0, 6);
  });

  it('combines a turn of the origin with a turn of the head', () => {
    // 90° right by stick, then 90° left by neck: back where we started.
    const { camera } = rig(-Math.PI / 2, Math.PI / 2);
    const into = new Vector3();
    groundDirection(...FORWARD, world(camera), into);
    expect(into.x).toBeCloseTo(0, 6);
    expect(into.z).toBeCloseTo(-1, 6);
  });

  it('walks sideways when the stick goes sideways', () => {
    const { camera } = rig(0);
    const into = new Vector3();
    groundDirection(1, 0, world(camera), into);
    // Stick right, facing −z: strafe towards +x.
    expect(into.x).toBeCloseTo(1, 6);
    expect(into.z).toBeCloseTo(0, 6);
  });

  it('does not slow down or lift off when the head is pitched', () => {
    // Looking 40° down. Unflattened this keeps only cos(40°) = 77% of its
    // length in the horizontal plane, and the walker crawls.
    const { camera } = rig(0, 0, -40 * (Math.PI / 180));
    const into = new Vector3();
    expect(groundDirection(...FORWARD, world(camera), into)).toBe(true);
    expect(into.y).toBe(0);
    expect(Math.hypot(into.x, into.z)).toBeCloseTo(1, 6);
    expect(into.z).toBeCloseTo(-1, 6);
  });

  it('refuses rather than guessing when the head looks straight down', () => {
    const { camera } = rig(0, 0, -Math.PI / 2);
    const into = new Vector3(9, 9, 9);
    expect(groundDirection(...FORWARD, world(camera), into)).toBe(false);
    // Left untouched, so a caller that ignores the result cannot silently
    // walk in whatever direction happened to be in the vector.
    expect(into.toArray()).toEqual([9, 9, 9]);
  });

  it('agrees with three.js, which is the point of writing the maths out', () => {
    const { camera } = rig(0.7, -1.1, 0.3);
    const quaternion = world(camera);
    const into = new Vector3();
    groundDirection(0.4, -0.6, quaternion, into);

    const expected = new Vector3(0.4, 0, -0.6).applyQuaternion(quaternion);
    expected.y = 0;
    expected.normalize();

    expect(into.x).toBeCloseTo(expected.x, 10);
    expect(into.z).toBeCloseTo(expected.z, 10);
  });
});

describe('pace from how far the stick is pushed', () => {
  it('stands still when the stick is only being rested on', () => {
    expect(paceFor(0)).toBe(0);
    expect(paceFor(0.05)).toBe(0);
    expect(paceFor(0.12)).toBe(0);
  });

  it('runs at exactly the run speed at the gate, and no faster past it', () => {
    expect(paceFor(1)).toBeCloseTo(RUN_MS, 10);
    // A diagonal push can report slightly over 1 on some hardware.
    expect(paceFor(1.08)).toBeCloseTo(RUN_MS, 10);
  });

  it('is walking pace at the knee, so the change of rate has no step in it', () => {
    expect(paceFor(0.85)).toBeCloseTo(WALK_MS, 10);
    // Either side of the join, approached from both directions.
    expect(paceFor(0.8499)).toBeCloseTo(WALK_MS, 2);
    expect(paceFor(0.8501)).toBeCloseTo(WALK_MS, 2);
  });

  it('gives most of the travel to speeds at or below walking', () => {
    // The point of the knee: half-stick is a stroll, not a jog.
    expect(paceFor(0.5)).toBeLessThan(WALK_MS);
    expect(paceFor(0.84)).toBeLessThan(WALK_MS);
  });

  it('never goes backwards as the stick is pushed further', () => {
    let previous = -1;
    for (let at = 0; at <= 1.0001; at += 0.01) {
      const pace = paceFor(at);
      expect(pace).toBeGreaterThanOrEqual(previous);
      previous = pace;
    }
  });

  it('refuses to be pushed backwards into a negative speed', () => {
    // Magnitude is always positive by construction, but a sign error
    // upstream must not turn into walking backwards at 5 m/s.
    expect(paceFor(-1)).toBe(0);
  });
});

describe('the fence around the model', () => {
  it('leaves a point inside untouched', () => {
    expect(insideBounds([10, 10], [0, 0], 100)).toEqual([10, 10]);
  });

  it('leaves a point exactly on the edge untouched', () => {
    expect(insideBounds([100, 0], [0, 0], 100)).toEqual([100, 0]);
  });

  it('pulls a point back onto the edge, along the way it went out', () => {
    const [e, n] = insideBounds([300, 400], [0, 0], 100);
    expect(Math.hypot(e, n)).toBeCloseTo(100, 10);
    // Same bearing: 3-4-5, so 60 and 80.
    expect(e).toBeCloseTo(60, 10);
    expect(n).toBeCloseTo(80, 10);
  });

  it('measures from the centre it is given, not from zero', () => {
    const [e, n] = insideBounds([1000, 500], [500, 500], 100);
    expect(e).toBeCloseTo(600, 10);
    expect(n).toBeCloseTo(500, 10);
  });

  it('does not divide by zero at the centre', () => {
    expect(insideBounds([5, 5], [5, 5], 0)).toEqual([5, 5]);
  });
});
