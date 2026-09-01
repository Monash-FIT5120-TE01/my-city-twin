/*
 * Sun geometry.
 *
 * Angle conventions follow sunlight-twin/contracts/golden/solar_positions.json
 * so the implementation can be checked against those 36 pvlib-generated
 * samples rather than by eye:
 *
 *   altitude  degrees above the horizon, geometric (no atmospheric refraction)
 *   azimuth   degrees CLOCKWISE FROM NORTH — 0 = N, 90 = E, 180 = S, 270 = W
 *
 * Southern-hemisphere note: at this latitude the sun transits to the NORTH,
 * so azimuth passes through 0/360 near solar noon and shadows point SOUTH.
 * A northern-hemisphere assumption here produces shadows that look plausible
 * and are reversed — the failure this file exists to prevent.
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
