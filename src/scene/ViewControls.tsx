// oxlint-disable react/immutability -- writing to the ref IS this component's
// output. It is a post box handed down by the owner for exactly this purpose:
// the camera lives inside the canvas and the buttons are DOM outside it, and
// a callback prop would have to be recreated whenever the camera changed,
// re-running the effect that registers it. StreetView carries the same
// exemption for the same underlying reason — a renderer is mutable.
/*
 * ─────────────────────────────────────────────────────────────────────────
 * ZOOM, WITHOUT A MOUSE WHEEL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY IT EXISTS
 *   Scrolling is the only way to change how close the city is, and it is the
 *   one gesture this view needs that a trackpad, a touchscreen and a headset
 *   controller each do differently or not at all. Two buttons and a reset
 *   work the same on all of them.
 *
 * WHY IT IS SPLIT IN TWO
 *   The buttons are DOM and the camera is inside the canvas, and the two
 *   cannot see each other. `ViewControlsBridge` goes inside <Canvas>, where
 *   `state.controls` exists, and hands a plain function outward through a
 *   ref. The buttons below are ordinary HTML that call it.
 *
 *   A ref rather than React state, deliberately: the camera moves every frame
 *   during a drag, and nothing about it should cause a render. This is the
 *   same reasoning CameraRig's header sets out at greater length.
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

/** What the buttons can ask for. Null until the canvas has mounted. */
export type ViewCommands = {
  /** Multiply the distance to the target. Below 1 moves closer. */
  dolly: (factor: number) => void;
  /**
   * Swing the camera around the target, in radians. Positive goes one way,
   * negative the other; which is which is decided by the buttons.
   *
   * WHY THIS EXISTS AS A BUTTON AT ALL
   *   Orbiting is on the RIGHT mouse button here, because this view is panned
   *   far more often than it is spun and a mouse has two buttons to spend.
   *   That is a reasonable choice and it is also the opposite of what every
   *   other 3D tool does — so a first-time reader tries a left drag, sees the
   *   city slide instead of turn, and concludes it cannot be turned at all.
   *
   *   The mapping is not the problem; the dead end is. A visible control
   *   makes the capability reachable without knowing any mapping, and leaves
   *   the mouse exactly as it was for anyone who does.
   */
  orbit: (radians: number) => void;
} | null;

export interface ViewControlsRef {
  current: ViewCommands;
}

interface OrbitLike {
  target: Vector3;
  update: () => void;
  minDistance: number;
  maxDistance: number;
  /** OrbitControls extends EventDispatcher; CameraRig listens for 'start'. */
  dispatchEvent: (event: { type: 'start' }) => void;
}

/**
 * Lives inside the canvas and publishes the camera to the buttons outside it.
 */
export function ViewControlsBridge({ commands }: { commands: ViewControlsRef }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitLike | null;

  useEffect(() => {
    /*
     * Only the orbiting controls. `state.controls` is whatever last declared
     * itself default, and while somebody is walking that is
     * PointerLockControls, which has no target to dolly towards — the same
     * trap that took the whole canvas down once before. See CameraRig.
     */
    if (!controls?.target) {
      commands.current = null;
      return;
    }

    commands.current = {
      dolly: (factor) => {
        /*
         * Say the person is driving, before moving anything.
         *
         * CameraRig abandons a flight when OrbitControls fires 'start', which
         * a drag or a wheel does and a method call does not. Without this the
         * flight simply overwrites the zoom on the next frame, and the button
         * looks broken for as long as the journey lasts — which is exactly
         * when somebody is most likely to press it, having just been flown
         * somewhere they did not choose.
         */
        controls.dispatchEvent({ type: 'start' });

        const offset = camera.position.clone().sub(controls.target);
        const distance = offset.length();
        // Held inside the same limits the wheel obeys, or the buttons could
        // put the camera somewhere dragging can never recover from.
        const next = Math.min(
          controls.maxDistance,
          Math.max(controls.minDistance, distance * factor),
        );
        camera.position.copy(controls.target).add(offset.multiplyScalar(next / distance));
        controls.update();
      },

      orbit: (radians) => {
        // Same reason as the dolly above: say the person is driving first.
        controls.dispatchEvent({ type: 'start' });

        /*
         * Around the world's vertical axis, through the target.
         *
         * Not around the camera's own up, which tilts with it — swinging
         * about a tilted axis rolls the horizon, and a city that comes back
         * from a turn not level is disorienting in a way that is hard to
         * name and easy to notice.
         *
         * The elevation is untouched: this is the half of orbiting a button
         * can do well. Raising and lowering the eye has a floor and a
         * ceiling and wants a continuous gesture, which is what the drag is
         * still for.
         */
        const offset = camera.position.clone().sub(controls.target);
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const x = offset.x * cos + offset.z * sin;
        const z = -offset.x * sin + offset.z * cos;
        offset.x = x;
        offset.z = z;
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
    };

    return () => {
      commands.current = null;
    };
  }, [camera, controls, commands]);

  return null;
}
