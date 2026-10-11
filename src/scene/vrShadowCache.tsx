/*
 * ─────────────────────────────────────────────────────────────────────────
 * SHADOWS DRAWN WHEN THEY CHANGE, NOT EVERY FRAME — IN THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY
 *   The sun's shadow map covers the whole city at 4096 x 4096, and three.js
 *   redraws it every frame: about 260,000 triangles of buildings drawn once
 *   more, before the city is drawn for each eye. On the headset that was the
 *   largest share of every frame (2026-10-09) and a likely cause of the lag
 *   people felt.
 *
 *   Only buildings and proposals cast shadows (trams and street furniture do
 *   not — see streetscape/), and they stand still. So the shadow only
 *   changes when the sun moves, when what is shown changes, or when the
 *   player is moved; this redraws it then, for a few frames to catch things
 *   that mount a moment later, and otherwise every couple of seconds as a
 *   safety net for anything the key does not name.
 *
 * Only while a session runs; on a desktop the map is redrawn every frame as
 * before.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { WebGLRenderer } from 'three';

/** Frames to keep redrawing after something changed: proposals and their outlines mount a moment later. */
const SETTLE_FRAMES = 4;
/** Seconds between safety redraws when nothing named in the key has changed. */
const SAFETY_S = 2;

function setAutoUpdate(gl: WebGLRenderer, on: boolean) {
  gl.shadowMap.autoUpdate = on;
}

function redraw(gl: WebGLRenderer) {
  gl.shadowMap.needsUpdate = true;
}

export function VrShadowCache({ shadowKey }: { shadowKey: string }) {
  const gl = useThree((state) => state.gl);
  const owed = useRef(SETTLE_FRAMES);
  const since = useRef(0);

  useEffect(() => {
    setAutoUpdate(gl, false);
    redraw(gl);
    return () => setAutoUpdate(gl, true);
  }, [gl]);

  useEffect(() => {
    owed.current = SETTLE_FRAMES;
  }, [shadowKey]);

  useFrame((_, delta) => {
    since.current += delta;
    if (owed.current > 0 || since.current > SAFETY_S) {
      redraw(gl);
      if (owed.current > 0) owed.current -= 1;
      since.current = 0;
    }
  });

  return null;
}
