/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE SUN IS, AS A DIRECTION
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Small conversions between how astronomers describe the sun's position
 *   and what a 3D scene needs. solar.ts works out the angles; this turns
 *   them into arrows and distances.
 *
 * THE TWO ANGLES
 *
 *   ALTITUDE   how high, in degrees. 0 is the horizon, 90 is overhead.
 *              In Melbourne it never quite reaches 76.
 *
 *   AZIMUTH    which way, in degrees clockwise from north.
 *              0 = north, 90 = east, 180 = south, 270 = west.
 *
 * THE SOUTHERN HEMISPHERE
 *   Melbourne is at latitude −37.8, so the sun crosses the sky to the NORTH
 *   and shadows point SOUTH. Northern-hemisphere intuition is exactly
 *   backwards here, and code written on that intuition produces shadows
 *   that look completely convincing and are reversed. Every function below
 *   is tested against reference data for this reason.
 *
 * WHY SHADOW LENGTH IS height / tan(altitude)
 *   The sun, the top of the building and the tip of its shadow make a right
 *   triangle. The height is the opposite side, the shadow is the adjacent
 *   side, and the angle between the ground and the sunlight is the altitude.
 *   tan = opposite / adjacent, so adjacent = opposite / tan. As the sun
 *   drops, tan shrinks and the shadow runs away: at 45° it equals the
 *   height, at 5° it is eleven times it.
 */

export interface SunAngles {
  /** Degrees above the horizon. Negative when the sun is down. */
  altitudeDeg: number;
  /** Degrees clockwise from north. */
  azimuthDeg: number;
}

/** A unit vector in the local east/north/up frame. */
export interface Vec3ENU {
  east: number;
  north: number;
  up: number;
}

const DEG = Math.PI / 180;

/**
 * Direction FROM the site TOWARDS the sun, in the east/north/up frame.
 * Place the directional light along this vector; light then travels back
 * along it, which is what casts the shadow.
 */
export function sunDirectionENU({ altitudeDeg, azimuthDeg }: SunAngles): Vec3ENU {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  const horizontal = Math.cos(alt);
  return {
    east: horizontal * Math.sin(az),
    north: horizontal * Math.cos(az),
    up: Math.sin(alt),
  };
}

/** Where to put the directional light so it shines from the sun's direction. */
export function sunLightPosition(angles: SunAngles, distanceM: number): [number, number, number] {
  const d = sunDirectionENU(angles);
  return [d.east * distanceM, d.north * distanceM, d.up * distanceM];
}

/**
 * Horizontal distance a shadow reaches from an obstruction of a given height.
 * This is the "≈79 m" measurement on the Impact Interpretation screen.
 * Undefined when the sun is at or below the horizon.
 */
export function shadowReachM(heightM: number, altitudeDeg: number): number | null {
  if (altitudeDeg <= 0) return null;
  return heightM / Math.tan(altitudeDeg * DEG);
}

/** Compass label for the sun-direction chip: "FROM EAST", "FROM NORTH-WEST". */
export function compassLabel(azimuthDeg: number): string {
  const points = [
    'NORTH',
    'NORTH-EAST',
    'EAST',
    'SOUTH-EAST',
    'SOUTH',
    'SOUTH-WEST',
    'WEST',
    'NORTH-WEST',
  ];
  const index = Math.round(((azimuthDeg % 360) + 360) % 360 / 45) % 8;
  return points[index];
}
