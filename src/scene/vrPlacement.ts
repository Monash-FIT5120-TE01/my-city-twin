/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE A HEADSET PUTS SOMEBODY DOWN, AND WHERE ITS PANEL APPEARS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The sums behind the three places a person can be in VR — above the city,
 *   above a chosen place, and in the street — plus the one that puts the
 *   panel in front of them. Pure functions, so they can be checked without a
 *   headset, which is the only way most of the VR path can be checked at all.
 *
 * WHY THERE IS AN "ABOVE" AT ALL
 *   The first VR build could only be entered from the street, and the street
 *   could only be reached through the 2D page: choose a place, open its
 *   sunlight, arm the ground, click, "Stand here", then Enter VR. On a Quest
 *   that is five screens of pointing at a flat browser before the headset
 *   does anything a monitor cannot. Somebody arriving in a headset now
 *   starts where the desktop view starts — looking at the whole city — and
 *   chooses from there.
 *
 *   It is the desktop's opening shot turned into somewhere to stand: the
 *   same bearing (150°, south-south-east of the subject), so the two views
 *   of a place look at it from the same side and the shadows fall the same
 *   way on both. Only the distances differ. The desktop frames with a 30°
 *   lens from two kilometres out; a headset has a field of view near 100°,
 *   and from that far the tallest tower would be a matchstick.
 *
 * THE FRAME
 *   Placements are east/north/up, like everything that describes the city.
 *   The one number that is not is the yaw, which is a rotation of the
 *   player's origin in three.js — outside <WorldFrame>, like VrWalk — and so
 *   it is derived through enuToWorld rather than written out by hand. See
 *   frame.ts: the conversion lives in one place.
 */

import { enuToWorld } from './frame';

/** Where the player's floor goes, and which way it faces. */
export interface VrPlacement {
  /** The floor's east/north position, metres. */
  en: [number, number];
  /** The floor's height, metres AHD. Street level, or a platform in the air. */
  floorAhdM: number;
  /** Rotation of the origin about three.js +Y, radians. 0 faces north. */
  yawRad: number;
}

/** Compass bearing from the subject to the viewer, degrees. The desktop's. */
export const OVERLOOK_BEARING_DEG = 150;

/**
 * Height of the platform over the whole city, above the ground plane.
 *
 * Above everything in the model with room to spare — the highest roof in the
 * extract is about 257 m above the ground plane, and the tallest approved
 * proposal 234 m — so looking down never means looking into a roof.
 */
export const CITY_OVERLOOK_HEIGHT_M = 340;

/** Horizontal distance from the city's centre to the platform over it. */
export const CITY_OVERLOOK_DISTANCE_M = 760;

/**
 * The rotation that turns the origin's forward (three.js −Z) to face along
 * an east/north direction.
 *
 * Returns 0 for a zero-length direction. Standing exactly on the thing to be
 * faced is the one case with no answer, and north is as good as any.
 */
export function yawToward(fromEN: [number, number], toEN: [number, number]): number {
  const dE = toEN[0] - fromEN[0];
  const dN = toEN[1] - fromEN[1];
  if (Math.hypot(dE, dN) < 1e-9) return 0;
  // A rotation θ about +Y takes (0, 0, −1) to (−sin θ, 0, −cos θ).
  const [x, , z] = enuToWorld([dE, dN, 0]);
  return Math.atan2(-x, -z);
}

/**
 * The platform, placed to look at a subject.
 *
 * `subjectHeightM` null means there is no subject: the whole city is framed
 * from the south-south-east. Otherwise the distance and height grow with the
 * building, clamped so a four-storey block is not examined from a
 * helicopter and a 250 m tower is not examined from its own balcony.
 */
export function overlookFor(
  targetEN: [number, number],
  subjectHeightM: number | null,
  groundAhdM: number,
): VrPlacement {
  const distance =
    subjectHeightM === null
      ? CITY_OVERLOOK_DISTANCE_M
      : clamp(subjectHeightM * 1.6 + 120, 180, 600);
  const height =
    subjectHeightM === null ? CITY_OVERLOOK_HEIGHT_M : clamp(subjectHeightM + 60, 120, 400);

  const bearing = OVERLOOK_BEARING_DEG * (Math.PI / 180);
  const en: [number, number] = [
    targetEN[0] + distance * Math.sin(bearing),
    targetEN[1] + distance * Math.cos(bearing),
  ];
  return { en, floorAhdM: groundAhdM + height, yawRad: yawToward(en, targetEN) };
}

/**
 * On the footpath, turned to face the subject.
 *
 * Facing it matters more in a headset than on a monitor: arriving with your
 * back to the building you asked about means turning round to find it, and
 * turning is the movement most likely to make somebody feel unwell.
 */
export function streetPlacement(
  standEN: [number, number],
  faceEN: [number, number],
  groundAhdM: number,
): VrPlacement {
  return { en: standEN, floorAhdM: groundAhdM, yawRad: yawToward(standEN, faceEN) };
}

/** How far in front of the eyes the panel appears, metres. */
export const PANEL_DISTANCE_M = 0.85;
/** How far below eye level its centre sits, metres. */
export const PANEL_DROP_M = 0.18;

/**
 * Where the panel goes when it is called up, in the ORIGIN's own space.
 *
 * The head arrives as the XR camera's local position and rotation — local to
 * the origin, because the camera is the origin's child (VrWalk explains why
 * that matters). The panel is placed as a child of the same origin, so both
 * are in one space and no world matrix is needed.
 *
 * Only the head's heading is used, not its pitch or roll. A person looking
 * at their feet when they press the button still wants the panel ahead of
 * them, upright, not lying on the floor.
 *
 * The panel's face points back along the heading, so it is read square-on.
 */
export function panelPose(
  headLocal: [number, number, number],
  headForwardLocal: [number, number, number],
): { position: [number, number, number]; yawRad: number } {
  let [fx, , fz] = headForwardLocal;
  const flat = Math.hypot(fx, fz);
  if (flat < 1e-6) {
    // Looking straight up or down: no heading to read. Straight ahead of
    // the origin is the least surprising guess.
    fx = 0;
    fz = -1;
  } else {
    fx /= flat;
    fz /= flat;
  }
  return {
    position: [
      headLocal[0] + fx * PANEL_DISTANCE_M,
      headLocal[1] - PANEL_DROP_M,
      headLocal[2] + fz * PANEL_DISTANCE_M,
    ],
    yawRad: Math.atan2(-fx, -fz),
  };
}

/**
 * Where the ORIGIN has to go so that the HEAD lands on a placement.
 *
 * The origin is the player's floor, not the player. Anybody who has taken a
 * step across their room, or turned their body, is somewhere on that floor
 * other than its middle and facing some way other than its forward. Moving
 * the origin straight to the placement would put their head a metre or two
 * off it — inside a wall, at street level — and facing wherever they
 * happened to be facing.
 *
 * So the head's current offset and heading within the origin are read back
 * from their world values, and the origin is set so that the same offset,
 * rotated, ends on the target and the same heading ends facing it. Height is
 * left to the headset: the origin goes to the placement's floor and the
 * person stands on it at whatever height they are.
 *
 * Everything in and out is three.js world space except the placement, which
 * is converted through enuToWorld like every other position that crosses
 * the frame.
 */
export function originFor(
  placement: VrPlacement,
  origin: { position: [number, number, number]; yawRad: number },
  headWorld: [number, number, number],
  headForwardWorld: [number, number, number],
): { position: [number, number, number]; yawRad: number } {
  const [tx, ty, tz] = enuToWorld([placement.en[0], placement.en[1], placement.floorAhdM]);

  // The head's heading, and so its heading relative to the floor it is on.
  const [fx, , fz] = headForwardWorld;
  const headYaw = Math.hypot(fx, fz) < 1e-6 ? origin.yawRad : Math.atan2(-fx, -fz);
  const yawRad = placement.yawRad - (headYaw - origin.yawRad);

  // The head's horizontal offset in the floor's own axes: undo the floor's
  // current rotation, then apply the new one.
  const [lx, lz] = rotateY(
    headWorld[0] - origin.position[0],
    headWorld[2] - origin.position[2],
    -origin.yawRad,
  );
  const [ox, oz] = rotateY(lx, lz, yawRad);

  return { position: [tx - ox, ty, tz - oz], yawRad };
}

/** (x, z) turned by θ about +Y, the way three.js turns it. */
function rotateY(x: number, z: number, radians: number): [number, number] {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [x * c + z * s, -x * s + z * c];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
