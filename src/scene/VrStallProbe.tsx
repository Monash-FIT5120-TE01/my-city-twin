/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE HEADSET STOPS — FOR THE ?vrdebug LOG ONLY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY
 *   The "Going to …" ring stops turning on the headset while a move is being
 *   prepared (2026-10-10): the page is busy and draws nothing. Which work
 *   holds it, and for how long, can only be measured on the headset; the
 *   emulator here runs on a desktop processor.
 *
 * WHAT IT WRITES
 *   Every frame that came later than STALL_MS after the one before, split
 *   into the two places the time can go:
 *
 *     drawing  — inside the renderer: compiling a shader for a material seen
 *                for the first time, uploading new geometry and textures.
 *                What was new is counted from the renderer's own tallies.
 *     the rest — everything between two drawings: React working out and
 *                committing the change, geometry being built, the map paths.
 *
 *   VrLoader adds "asked", "landed" and "gone" for each move, so a stall can
 *   be read against the move it belongs to.
 *
 * Mounted only in a session, and does nothing unless the log is listening
 * (vrMarks.ts) — without ?vrdebug it costs one check a frame.
 */

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Scene } from 'three';
import { vrMark, vrMarksOn } from './vrMarks';

/** A frame this much later than the one before is written down, ms. At 72 Hz a frame is 14 ms. */
const STALL_MS = 50;

/** Times the renderer through the scene's own hooks, chained onto whatever was there; returns the undo. */
function timeDrawing(scene: Scene, timing: { from: number; ms: number }) {
  const before = scene.onBeforeRender;
  const after = scene.onAfterRender;
  scene.onBeforeRender = (...args) => {
    timing.from = performance.now();
    before.apply(scene, args);
  };
  scene.onAfterRender = (...args) => {
    timing.ms = performance.now() - timing.from;
    after.apply(scene, args);
  };
  return () => {
    scene.onBeforeRender = before;
    scene.onAfterRender = after;
  };
}

export function VrStallProbe() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const last = useRef<{ at: number; programs: number; geometries: number; textures: number } | null>(null);
  const drawing = useRef({ from: 0, ms: 0 });

  // How long the renderer itself takes.
  useEffect(() => timeDrawing(scene, drawing.current), [scene]);

  useFrame(() => {
    if (!vrMarksOn()) return;
    const now = performance.now();
    const tally = {
      at: now,
      programs: gl.info.programs?.length ?? 0,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    };
    const was = last.current;
    last.current = tally;
    if (!was) return;
    const gap = now - was.at;
    if (gap < STALL_MS) return;
    const draw = drawing.current.ms;
    const news = [
      tally.programs > was.programs && `+${tally.programs - was.programs} shaders`,
      tally.geometries > was.geometries && `+${tally.geometries - was.geometries} geometries`,
      tally.textures > was.textures && `+${tally.textures - was.textures} textures`,
    ].filter(Boolean);
    vrMark(
      `STALL ${gap.toFixed(0)} ms: drawing ${draw.toFixed(0)} ms${news.length ? ` (${news.join(', ')})` : ''}, the rest ${Math.max(0, gap - draw).toFixed(0)} ms`,
    );
  });

  return null;
}
