/*
 * ─────────────────────────────────────────────────────────────────────────
 * TRAVELLING TO A PLACE, RATHER THAN APPEARING AT IT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The only thing that moves the camera between places. Everything else
 *   states WHERE the camera should be; this decides how it gets there.
 *
 * THE PROBLEM IT SOLVES
 *   Searching an address used to teleport the view. One frame you were
 *   looking at the whole grid, the next you were beside a tower — with
 *   nothing in between to say which direction it was in or how far you had
 *   come. The city is the argument this product makes, and arriving by
 *   teleport throws away the one thing a 3D view offers over a list: you
 *   can see where a place IS.
 *
 * WHY THE CAMERA IS DRIVEN IMPERATIVELY
 *   The obvious approach — animate the numbers in React state and pass them
 *   down — re-renders the whole scene sixty times a second to move one
 *   object. This runs in the frame loop instead and touches nothing but the
 *   camera and the orbit target, so a flight costs no React work at all.
 *
 *   It also means the Canvas must be given a camera position ONCE and never
 *   again, and OrbitControls must not be given a `target` prop. Either would
 *   be re-applied on the next render and snap the camera back mid-flight,
 *   which looks exactly like the teleport this file exists to remove.
 *
 * INTERRUPTION IS NOT AN EDGE CASE
 *   A flight that ignores the mouse is worse than no flight. OrbitControls
 *   fires `start` the moment a drag or a wheel begins, and that abandons the
 *   journey where it stands. The person is now driving; the destination was
 *   only ever a suggestion.
 *
 * WHAT IT WILL NOT DO
 *   It never touches the sun, the light, or any geometry — only the camera.
 *   Nothing here can change what a shadow does, only where you watch it from.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

/**
 * The parts of OrbitControls this needs.
 *
 * R3F types `state.controls` as a bare event dispatcher, because it could be
 * any controls implementation. Naming the three members used here is honest
 * about the dependency without pretending to type the whole class.
 */
interface OrbitLike {
  target: Vector3;
  update: () => void;
  addEventListener: (type: 'start', handler: () => void) => void;
  removeEventListener: (type: 'start', handler: () => void) => void;
}

interface Journey {
  fromPosition: Vector3;
  fromTarget: Vector3;
  toPosition: Vector3;
  toTarget: Vector3;
  /** Seconds elapsed. */
  elapsed: number;
  /** Seconds the whole trip should take. */
  duration: number;
}

/**
 * Fast at first, settling at the end — the shape of something arriving
 * rather than something being thrown. A linear flight reads as mechanical
 * and makes the stop feel like a collision.
 */
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Below this, the move is too small to be worth animating. Metres. */
const NEGLIGIBLE_M = 1;

/**
 * How long a trip takes, scaled to how far it goes.
 *
 * A fixed duration is wrong at both ends: it crawls across a short hop and
 * races a journey over the whole CBD. The clamp keeps even the longest
 * flight brief — this is orientation, not cinema.
 */
function durationFor(distanceM: number): number {
  return Math.min(1.0, Math.max(0.45, distanceM / 2200));
}

export function CameraRig({
  position,
  target,
  animate,
}: {
  /** Where the camera should end up, in three.js world coordinates. */
  position: [number, number, number];
  /** What it should be looking at, in three.js world coordinates. */
  target: [number, number, number];
  /** False under reduced motion: arrive immediately instead. */
  animate: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitLike | null;

  const journey = useRef<Journey | null>(null);
  /** False until the camera has been placed once, which is never a flight. */
  const placed = useRef(false);

  /*
   * Depends on the six numbers rather than the two arrays. The arrays are
   * rebuilt on every render, so an identity comparison would restart the
   * journey every frame and the camera would never arrive.
   */
  const [px, py, pz] = position;
  const [tx, ty, tz] = target;

  useEffect(() => {
    if (!controls) return;

    const toPosition = new Vector3(px, py, pz);
    const toTarget = new Vector3(tx, ty, tz);

    // The opening shot, and every move under reduced motion: just be there.
    if (!placed.current || !animate) {
      camera.position.copy(toPosition);
      controls.target.copy(toTarget);
      controls.update();
      placed.current = true;
      journey.current = null;
      return;
    }

    // A render that recomputed the same destination is not a journey.
    const distance = camera.position.distanceTo(toPosition);
    if (distance < NEGLIGIBLE_M && controls.target.distanceTo(toTarget) < NEGLIGIBLE_M) {
      return;
    }

    journey.current = {
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition,
      toTarget,
      elapsed: 0,
      duration: durationFor(distance),
    };
  }, [px, py, pz, tx, ty, tz, animate, camera, controls]);

  // The moment the person touches the controls, they are driving.
  useEffect(() => {
    if (!controls) return;
    const abandon = () => {
      journey.current = null;
    };
    controls.addEventListener('start', abandon);
    return () => controls.removeEventListener('start', abandon);
  }, [controls]);

  /*
   * Runs after drei's own controls update, which sits at priority -1. Setting
   * the camera last means this frame shows the position this file chose,
   * rather than one damping has already pulled away from it.
   */
  useFrame((_, delta) => {
    const trip = journey.current;
    if (!trip || !controls) return;

    trip.elapsed += delta;
    const progress = Math.min(1, trip.elapsed / trip.duration);
    const eased = easeOut(progress);

    camera.position.lerpVectors(trip.fromPosition, trip.toPosition, eased);
    controls.target.lerpVectors(trip.fromTarget, trip.toTarget, eased);
    controls.update();

    if (progress >= 1) journey.current = null;
  });

  return null;
}
