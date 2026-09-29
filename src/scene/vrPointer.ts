/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE LASER IS, AND WHAT IS DRAWN OVER WHAT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * THE BUG THIS EXISTS FOR
 *   On the headset, the laser and its cursor vanished the moment they
 *   reached the panel — so nobody could see which button they were about
 *   to press. The panel is drawn last and through everything (renderOrder
 *   5000, no depth test) so that a wall at street level cannot swallow it;
 *   the library's laser and cursor were drawn at the default order, BEFORE
 *   it, and the panel painted straight over both.
 *
 *   So the order is written down here, once, and the pointer goes after the
 *   panel. The emulator never showed this: its pointers were being moved by
 *   script, and nobody was looking for a cursor.
 *
 * THE CURSOR
 *   The library's own, drawn by the library's own shader — with two changes:
 *   it is never depth-tested, so a wall nearer than the panel cannot hide it,
 *   and it is dark and fully opaque instead of a 40% white haze, because the
 *   panel it is mostly seen on is white.
 *
 *   A cursor with a shader of our own (a white dot in a dark ring) was used
 *   for one build, and was taken out: the headset went dark from the build
 *   that introduced it, and though nothing in it was shown to be the cause,
 *   a proven shader is one suspect fewer for a failure no emulator shows.
 */

import { PointerCursorMaterial } from '@pmndrs/xr';

/** The panel: over the city, whatever is nearer. */
export const PANEL_RENDER_ORDER = 5_000;

/** The laser and its cursor: over the panel. */
export const POINTER_RENDER_ORDER = 6_000;

/** The cursor's size across, metres — at the panel's 85 cm, about 2°. */
export const CURSOR_SIZE_M = 0.03;

/** The cursor's colour: the panel's ink, 17.9:1 on its white. */
export const CURSOR_COLOR = '#16181a';

/** The library's cursor, drawn through anything in front of it. */
export class OnTopCursorMaterial extends PointerCursorMaterial {
  constructor() {
    super();
    this.depthTest = false;
  }
}
