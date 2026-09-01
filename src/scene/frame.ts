/*
 * The one place where coordinate conventions are decided.
 *
 * ── The frame everything else uses ──────────────────────────────
 * Local metric frame, metres:   +x EAST   +y NORTH   +z UP
 * Origin: LOCAL_ORIGIN below, in EPSG:7855 (GDA2020 / MGA zone 55).
 *
 * This matches the convention in sunlight-twin/contracts/01-buildings.md §5.
 * Geometry is never computed in latitude/longitude: at 37.8 °S one degree of
 * longitude and one of latitude differ by a factor of about 1.27, which tilts
 * every shadow by a consistent, invisible amount.
 *
 * ── three.js is Y-up ────────────────────────────────────────────
 * Rather than convert at every call site, the whole world lives inside a
 * single <WorldFrame> group rotated -90° about X. Inside that group, x/y/z
 * mean east/north/up. Nothing below it needs to know three.js is Y-up.
 *
 * There is exactly one conversion in this codebase, and it is that rotation.
 * If shadows point the wrong way, the bug is in the sun vector, not here —
 * which is the entire reason the conversion is kept to one place.
 */

/** Rotation that maps the east/north/up frame onto three.js's Y-up world. */
export const WORLD_FRAME_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];

/**
 * The same rotation, for the few things that live OUTSIDE <WorldFrame> and
 * still need to refer to a place in it — the camera and the orbit target.
 *
 * Rotating (x, y, z) by -90° about X gives (x, z, -y), so east/north/up
 * becomes (east, up, -north).
 */
export function enuToWorld([east, north, up]: [number, number, number]): [
  number,
  number,
  number,
] {
  return [east, up, -north];
}

/** EPSG:7855 — GDA2020 / MGA zone 55. Metres. Covers Melbourne. */
export const PROJECTED_CRS = 'EPSG:7855';
export const PROJECTED_CRS_DEF =
  '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

/** Source CRS of every geometry column in the backend ERD. */
export const SOURCE_CRS = 'EPSG:4326';

/**
 * Scene origin. Chosen near 435 Bourke Street so that coordinates inside the
 * scene stay small — large offsets cost float precision in the depth buffer
 * and show up as shadow acne.
 *
 * Replaced in A1 with the true centroid of the extracted precinct.
 */
export const LOCAL_ORIGIN_WGS84 = { lon: 144.9605, lat: -37.8145 } as const;

/** Melbourne, for solar position. Same point, named for its other use. */
export const SITE = {
  lon: 144.9605,
  lat: -37.8145,
  elevationM: 15,
  timeZone: 'Australia/Melbourne',
} as const;
