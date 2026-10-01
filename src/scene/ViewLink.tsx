/*
 * ─────────────────────────────────────────────────────────────────────────
 * TWO VIEWS THAT MOVE TOGETHER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The comparison screen draws the city twice — today, and with every
 *   approved project built — in two canvases side by side. They are only a
 *   comparison if they are looked at from the same place, so this ties
 *   their cameras together: move either, and the other follows.
 *
 * HOW
 *   The two share one plain object, a `CameraLink`: where the camera is,
 *   what it looks at, which view last wrote it, which view is being
 *   operated, and a counter. Each canvas mounts a ViewLink with its own id.
 *
 *     - SEEDING. The view already on screen ("today", the main canvas)
 *       `publish`es its pose the moment it joins, so the comparison opens
 *       from wherever the reader was looking. The view that joins it
 *       ("after", a fresh canvas) `adopt`s that pose on its first frame and
 *       ignores its own camera until then — its CameraRig places it at an
 *       opening shot as it mounts, and that must not be what both show.
 *     - OWNERSHIP. A drag or a wheel that begins in a view makes it the
 *       owner (OrbitControls' "start"). Only the owner writes when its
 *       controls change — the drag, the glide after it, a CameraRig flight.
 *     - FOLLOWING. Every frame, if the counter has moved on and the last
 *       writer was the other view, the pose is copied into this camera and
 *       controls. While copying, this view's own "change" is ignored, so the
 *       pose is not handed straight back.
 *
 * WHY TWO CAMERAS
 *   Each canvas has its own renderer, projection and GPU copies of the
 *   city, and draws through its own camera; keeping two cameras in step is
 *   a few numbers a frame.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Vector3 } from 'three';
import type { CameraLink } from './cameraLink';

/** The parts of OrbitControls this needs. */
interface OrbitLike {
  target: Vector3;
  update: () => void;
  addEventListener: (type: 'change' | 'start', handler: () => void) => void;
  removeEventListener: (type: 'change' | 'start', handler: () => void) => void;
}

/**
 * Ties this canvas's camera to the link. `seed` says how it joins: the view
 * already on screen publishes its pose; the one that joins it adopts it.
 */
export function ViewLink({
  link,
  id,
  seed,
}: {
  link: CameraLink;
  id: string;
  seed: 'publish' | 'adopt';
}) {
  const controls = useThree((state) => state.controls) as OrbitLike | null;
  const camera = useThree((state) => state.camera);
  /** The last counter value this view has caught up with. */
  const seen = useRef(0);
  /** True while copying the other view's pose in, so it is not echoed back. */
  const applying = useRef(false);
  /** False until this view has joined: published its pose, or adopted one. */
  const joined = useRef(false);

  useEffect(() => {
    if (!controls?.target) return;
    // The view on screen already: its pose is the one to compare from.
    if (seed === 'publish' && !joined.current) {
      link.claim(id);
      seen.current = link.write(camera.position, controls.target, id);
      joined.current = true;
    }
    const write = () => {
      if (applying.current || !joined.current) return;
      if (link.owner !== id) return;
      seen.current = link.write(camera.position, controls.target, id);
    };
    // A drag or a wheel beginning here makes this the view being operated.
    const take = () => link.claim(id);
    controls.addEventListener('change', write);
    controls.addEventListener('start', take);
    return () => {
      controls.removeEventListener('change', write);
      controls.removeEventListener('start', take);
    };
  }, [controls, camera, link, id, seed]);

  useFrame((state) => {
    const orbit = state.controls as OrbitLike | null;
    if (!orbit?.target) return;
    const behind = link.stamp !== seen.current && link.from !== id && link.from !== '';
    if (!behind) {
      // Nothing to adopt yet: a view that adopts waits for the pose it joins.
      if (seed === 'adopt' && link.from === '') return;
      joined.current = true;
      return;
    }
    applying.current = true;
    state.camera.position.copy(link.position);
    orbit.target.copy(link.target);
    orbit.update();
    applying.current = false;
    seen.current = link.stamp;
    joined.current = true;
  });

  return null;
}
