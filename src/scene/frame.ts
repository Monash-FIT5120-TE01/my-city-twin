/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHICH WAY IS UP  (read this before touching anything in scene/)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * TWO CONVENTIONS, AND THE ONE PLACE THEY MEET
 *
 *   This app        +x EAST   +y NORTH   +z UP      metres
 *   three.js        +x right  +y UP      +z toward the viewer
 *
 *   Surveying puts up on Z. 3D graphics puts up on Y. Both are correct and
 *   they disagree, so somewhere the two have to be reconciled.
 *
 * WHERE IT HAPPENS: EXACTLY ONCE
 *   <WorldFrame> is a group rotated -90° about X, and the entire city lives
 *   inside it. Within that group, x/y/z mean east/north/up and no file needs
 *   to know three.js thinks otherwise. Buildings, roads, parks, the sun and
 *   its arrow are all inside.
 *
 *   A few things cannot be: the camera, and the labels that are really HTML.
 *   Those call `enuToWorld` to state a position in the outer frame.
 *
 * THE RULE, AND WHY IT IS TESTED
 *   Inside the frame, never convert. Outside the frame, always convert.
 *
 *   Breaking it does not cause a crash or a type error — both sides are
 *   three numbers — it just puts something in the wrong place, or on its
 *   side. It has happened twice: the street names ended up face-down under
 *   the road, and the measurement ring stood on its edge in mid-air. Both
 *   times the cause was copying a component from the other side of the
 *   boundary. frame-boundary.test.ts now checks it mechanically.
 *
 * WHY NOT JUST WORK IN THREE.JS'S FRAME
 *   Because every input is surveyed data — eastings, northings and heights
 *   above sea level — and every output is a claim about a real place. Doing
 *   the arithmetic in the frame the data arrives in means the numbers in the
 *   code can be checked against the numbers on a map.
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
