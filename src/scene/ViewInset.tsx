/*
 * ─────────────────────────────────────────────────────────────────────────
 * FRAMING THE CITY IN THE PART OF THE SCREEN THAT SHOWS IT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The front page covers the left of the screen with its words and the
 *   bottom with its three steps, and leaves the city a window in the upper
 *   right. The canvas still fills the whole screen underneath. This moves the
 *   centre of the picture into that window, so the city sits in the middle
 *   of the part anybody can see rather than behind the words.
 *
 * WHAT IT DOES
 *   - ScreenInset: the shape of a report — how far the page covers the
 *     canvas from the left, top and bottom, and whether to follow at once.
 *   - ViewInset: reads the latest report every frame, eases the lens
 *     towards it (or snaps, while the page is being scrolled) and shifts the
 *     camera's projection to match.
 *   - Tells SceneCanvas when the lens leaves the centre and when it is back,
 *     so the street names can stand aside in between.
 *
 * WHY THE CANVAS IS NOT SIMPLY MADE SMALLER
 *   Leaving the front page would then resize the canvas: one frame the city
 *   is in a window, the next it fills the screen at a different size, with
 *   the camera re-fitted in between. Here the canvas never changes. Only the
 *   lens moves — eased, so leaving the page is the city sliding to the
 *   middle of the screen rather than jumping there.
 *
 * HOW
 *   `setViewOffset` tells the camera that the picture it would normally
 *   draw is the size of the window and sits at the window's corner, and that
 *   the canvas is a larger view around it. The camera's own framing — the
 *   distance CameraRig chose, the 30° lens — lands inside the window exactly
 *   as it would fill the whole screen, so nothing else has to know.
 *
 *   The picking ray, drei's pinned labels and the pointer all read the same
 *   projection matrix, so they move with it. The street names do not: they
 *   are CSS 3D, which takes only the field of view from the matrix and
 *   ignores the shift. SceneCanvas hides them while the front page is up and
 *   until the lens has settled back in the middle.
 *
 * WHY THE WINDOW IS READ FROM A BOX, NOT A PROP
 *   The front page reports its window on every scroll event. Through React
 *   state that would re-render the whole app, the scene included, sixty
 *   times a second to move three numbers. App writes the report into a ref
 *   instead, and the frame loop here reads it.
 *
 * IN A HEADSET
 *   Nothing. The device owns the projection there, and the camera this would
 *   change is not the one being drawn.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';

/** How much of the canvas is covered, in CSS pixels from each edge. */
export interface ScreenInset {
  left: number;
  top: number;
  bottom: number;
  /**
   * Follow at once rather than easing. Set while the page is being
   * scrolled: the window is moving under the reader's own hand, and a lens
   * that eased after it would leave the city lagging behind its frame.
   */
  snap?: boolean;
}

const NONE: ScreenInset = { left: 0, top: 0, bottom: 0 };

/**
 * How quickly the lens follows a change, per second.
 *
 * About as long as a panel takes to arrive (--dur-panel): the window and the
 * city in it should settle together.
 */
const FOLLOW_RATE = 7;

/**
 * Keeps the camera's picture centred in the part of the canvas the page
 * leaves uncovered. Renders nothing; it works on the camera in the frame
 * loop.
 */
export function ViewInset({
  source,
  on,
  animate,
  onShifted,
}: {
  /**
   * The front page's latest report, read every frame rather than taken as
   * a prop — see WHY THE WINDOW IS READ FROM A BOX above.
   */
  source: { current: ScreenInset | null };
  /** False when the front page is not up, whatever the box last held. */
  on: boolean;
  /** False under a reduced-motion preference: every change is then a jump. */
  animate: boolean;
  /**
   * Told when the lens moves off centre and when it is back — not every
   * frame. The street names need the second: they cannot follow a shifted
   * lens, and `on` going false only says the shift has STARTED to clear.
   */
  onShifted?: (shifted: boolean) => void;
}) {
  /** Where the lens is now, which trails the report while it eases. */
  const now = useRef<ScreenInset>({ ...NONE });
  /*
   * False until the first frame. The first report is taken as it is rather
   * than eased from zero: the city's first frame should already be in its
   * window, not slide into it from behind the words.
   */
  const started = useRef(false);
  /** What onShifted was last told, so it hears only of changes. */
  const reported = useRef(false);
  /** What was last applied, so a still frame costs nothing. */
  const applied = useRef('');

  /*
   * Everything read from the frame's own state rather than from useThree,
   * because the camera is changed here: an object handed back by a hook is
   * one React expects to be left alone.
   */
  useFrame(({ camera, size, gl }, delta) => {
    if (gl.xr.isPresenting) return;
    const lens = camera as PerspectiveCamera;
    if (!lens.isPerspectiveCamera) return;

    const goal = (on && source.current) || NONE;
    const step =
      animate && started.current && !goal.snap ? 1 - Math.exp(-delta * FOLLOW_RATE) : 1;
    started.current = true;
    const c = now.current;
    for (const edge of ['left', 'top', 'bottom'] as const) {
      c[edge] += (goal[edge] - c[edge]) * step;
      // Half a pixel is invisible; stopping there lets the offset clear.
      if (Math.abs(goal[edge] - c[edge]) < 0.5) c[edge] = goal[edge];
    }

    const shifted = c.left !== 0 || c.top !== 0 || c.bottom !== 0;
    if (shifted !== reported.current) {
      reported.current = shifted;
      onShifted?.(shifted);
    }

    const { width, height } = size;
    const key = `${c.left}|${c.top}|${c.bottom}|${width}|${height}`;
    /*
     * The canvas resizing sets the camera's aspect back to the whole
     * canvas's, so a resize must be answered even when the inset is still.
     * The key includes the size for that reason.
     */
    if (key === applied.current && lens.aspect === expectedAspect(c, width, height)) return;
    applied.current = key;

    if (c.left === 0 && c.top === 0 && c.bottom === 0) {
      lens.clearViewOffset();
      lens.aspect = width / height;
      lens.updateProjectionMatrix();
      return;
    }

    const shownWidth = Math.max(1, width - c.left);
    const shownHeight = Math.max(1, height - c.top - c.bottom);
    lens.aspect = shownWidth / shownHeight;
    // Also updates the projection matrix.
    lens.setViewOffset(shownWidth, shownHeight, -c.left, -c.top, width, height);
  });

  return null;
}

/**
 * The aspect the camera should have for this inset. Compared every frame,
 * because a canvas resize quietly resets the aspect to the whole canvas's
 * even when the inset has not moved.
 */
function expectedAspect(c: ScreenInset, width: number, height: number): number {
  if (c.left === 0 && c.top === 0 && c.bottom === 0) return width / height;
  return Math.max(1, width - c.left) / Math.max(1, height - c.top - c.bottom);
}
