/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE FLAT, IN ITS OWN COORDINATES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The one-bedroom flat the reader can step into (ProjectDoc/studio-room).
 * Its model — walls, floors, furniture, built in Blender and exported as
 * public/models/apartment/apartment.glb — and these numbers come from the
 * same source, ProjectDoc/studio-room/blender/build_apartment.py, so what is
 * drawn and what is cut out of the building agree.
 *
 * LOCAL AXES
 *   x east, y north, z up, metres; the origin is the inside south-west
 *   corner of the flat at floor level. The facade — the bedroom window and
 *   the living room's sliding door — is the EAST wall: its inside face at
 *   x = 7.3, its outside face at x = 7.5. The balcony stands out beyond it.
 *   Placing the flat in a building turns this frame so +x points out of the
 *   chosen side (roomPlacement.ts).
 */

/** Outside face of the facade wall, local x. */
export const FACADE_OUT_X = 7.5;
/** Middle of the facade's length, local y: the wall runs y -0.2 .. 7.0. */
export const FACADE_MID_Y = 3.4;
/** Length of facade the flat needs, outside to outside, metres. */
export const FACADE_LENGTH = 7.2;

/** Floor slab under the flat and ceiling slab over it, local z. */
export const SLAB_BOTTOM_Z = -0.3;
export const SLAB_TOP_Z = 3.0;

/**
 * The block cut out of the building's massing so the flat is not buried in
 * it: the flat's outside faces, a couple of centimetres inside them so the
 * flat's own walls cover the cut — except on the facade, where it runs 0.2 m
 * past the outside face. Stopping short there left the building's own outer
 * wall standing just in front of the flat's: unseen from inside (its back),
 * but a blank wall across the windows from the balcony (2026-10-17). The
 * balcony side is open air (roomPlacement.ts checks it), so nothing else is
 * taken. A clipping box has to be convex, so it is the flat's bounding
 * rectangle; the corner it takes that the flat does not fill (north of the
 * bathroom) is closed by NOTCH below.
 */
export const CUT_BOX = { x0: -0.18, x1: FACADE_OUT_X + 0.2, y0: -0.18, y1: 6.98, z0: -0.28, z1: 2.98 };

/** The bounding rectangle's corner the flat does not occupy: filled solid. */
export const NOTCH = { x0: -0.2, x1: 2.7, y0: 6.4, y1: 7.0, z0: SLAB_BOTTOM_Z, z1: SLAB_TOP_Z };
