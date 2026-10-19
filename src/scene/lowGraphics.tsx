/*
 * The low graphics / energy saving setting (settings/display.ts), the parts of it that live in the canvas:
 *
 *   FrameCap          at most `fps` frames a second, instead of one for every refresh of the screen. The
 *                     canvas is set to draw nothing by itself (frameloop "never") and this asks for a frame
 *                     when one is due.
 *   LowShadowCache    the shadow map redrawn only when what casts the shadows has changed — the sun, the
 *                     buildings shown — and then no more than every THROTTLE_MS while that keeps changing
 *                     (the hour being dragged); the last change is always drawn, so the shadows are exact
 *                     again the moment the handle is let go.
 *
 * Neither is used in a headset, which paces itself and has its own shadow cache (vrShadowCache.tsx).
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

export function FrameCap({ fps }: { fps: number }) {
  const advance = useThree((state) => state.advance);
  useEffect(() => {
    const every = 1000 / fps;
    let id = 0;
    let last = 0;
    const step = (now: number) => {
      id = window.requestAnimationFrame(step);
      // a couple of ms early is still this frame's turn: refresh times wobble
      if (now - last < every - 2) return;
      last = now;
      advance(now);
    };
    id = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(id);
  }, [advance, fps]);
  return null;
}

/** The fewest milliseconds between two redraws of the shadow map while what casts it keeps changing. */
const THROTTLE_MS = 250;

export function LowShadowCache({ shadowKey }: { shadowKey: string }) {
  const gl = useThree((state) => state.gl);
  /** The key last drawn, and when. */
  const drawn = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useFrame(() => {
    const now = performance.now();
    if (shadowKey === drawn.current.key || now - drawn.current.at < THROTTLE_MS) return;
    gl.shadowMap.needsUpdate = true;
    drawn.current = { key: shadowKey, at: now };
  });
  return null;
}
