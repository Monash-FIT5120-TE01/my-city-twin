/*
 * ─────────────────────────────────────────────────────────────────────────
 * PUTTING A REAL MAP UNDER THE MODEL
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Where a Mapbox image sits on the ground. It answers one question, for
 *   every corner of the ground plane: which pixel of the map is here?
 *
 * THE TRAP: NORTH IS NOT NORTH
 *   The scene is in EPSG:7855, a transverse Mercator grid whose central
 *   meridian is 147°E. Melbourne is at 144.96°E, two degrees west of it, and
 *   on a transverse Mercator that means grid north and true north differ by
 *   the grid convergence — about 1.25° here.
 *
 *   A Mapbox image is Web Mercator, where true north is straight up. Laid on
 *   the scene axis-aligned it therefore arrives turned by 1.25°: 44 m at the
 *   corner of a two-kilometre model, most of a block. Every street would sit
 *   beside its painted surface rather than on it, and it would read as the
 *   data being slightly wrong rather than the image being placed wrong.
 *
 * WHY EVERY VERTEX IS CONVERTED, RATHER THAN THE PLANE BEING ROTATED
 *   The obvious economy is to measure the rotation and scale once and apply
 *   them to the whole plane. It was tried. Both projections are conformal, so
 *   a rotation and a scale ought to be the whole story — but only in the
 *   limit, and the scene is 4 km across. Measured across that, the leftover
 *   reached 6 m, and a Hoddle Grid lane is 10 m wide.
 *
 *   So each vertex goes back through the projection instead: scene metres →
 *   EPSG:7855 → longitude and latitude → Web Mercator → pixel. There is no
 *   approximation left to bound. It costs 4,225 conversions once, inside the
 *   memo that already builds the ground.
 */

import { projectLonLat, unprojectMetric } from '../data/project';
import { LOCAL_ORIGIN_WGS84 } from './frame';

/**
 * The radius Web Mercator is defined on. Not the radius of the Earth: the
 * projection is defined on a sphere of exactly this size even though the data
 * going into it sits on an ellipsoid, and a truer figure here would put the
 * image in the wrong place.
 */
const MERCATOR_RADIUS_M = 6378137;
const MERCATOR_CIRCUMFERENCE_M = 2 * Math.PI * MERCATOR_RADIUS_M;

/** Mapbox serves 512-pixel tiles, so a whole world is 512·2^zoom pixels. */
const TILE_PX = 512;

const DEG = Math.PI / 180;

/** Where the scene's (0, 0) sits in EPSG:7855, so local metres can be undone. */
const ORIGIN_EN = projectLonLat(LOCAL_ORIGIN_WGS84.lon, LOCAL_ORIGIN_WGS84.lat);

/** Web Mercator, in metres on that sphere. */
export function mercatorFromLonLat(lon: number, lat: number): [number, number] {
  return [
    lon * DEG * MERCATOR_RADIUS_M,
    Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) * MERCATOR_RADIUS_M,
  ];
}

/** A scene point, as somewhere on the globe. */
export function sceneToLonLat(east: number, north: number): [number, number] {
  return unprojectMetric(east + ORIGIN_EN[0], north + ORIGIN_EN[1]);
}

/** A scene point, in Web Mercator metres. */
export function sceneToMercator(east: number, north: number): [number, number] {
  const [lon, lat] = sceneToLonLat(east, north);
  return mercatorFromLonLat(lon, lat);
}

/**
 * Which piece of the world one Mapbox image covers.
 *
 * `widthPx` and `heightPx` are the LOGICAL size asked of the API. Requesting
 * it at @2x returns twice as many pixels covering exactly the same ground, so
 * the density changes and none of the arithmetic here does.
 */
export interface ImagePlacement {
  readonly centre: { readonly lon: number; readonly lat: number };
  readonly zoom: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Mercator metres per logical pixel. */
export function mercatorMetresPerPixel(zoom: number): number {
  return MERCATOR_CIRCUMFERENCE_M / (TILE_PX * 2 ** zoom);
}

/**
 * The zoom at which an image `widthPx` across covers `groundM` of ground.
 *
 * Mercator metres are not ground metres — the projection stretches by
 * 1/cos(latitude), a factor of 1.27 here. Choosing a zoom from Mercator
 * figures alone returns an image a quarter too small, which looks like the
 * model being too big for its map rather than like a unit mistake.
 */
export function zoomForGroundSpan(groundM: number, widthPx: number, latitude: number): number {
  const mercatorSpan = groundM / Math.cos(latitude * DEG);
  const exact = Math.log2((MERCATOR_CIRCUMFERENCE_M * widthPx) / (TILE_PX * mercatorSpan));
  /*
   * Rounded to the precision Mapbox itself keeps.
   *
   * A fractional zoom in the request is honoured to two decimal places and no
   * further. Asking for 13.933842 and then computing texture coordinates from
   * 13.933842 means the image is drawn at 13.93 and read as though it were
   * not — a scale disagreement of about 0.27%, which is 2.7 m a kilometre out
   * from the centre. Quantising here makes the request and the arithmetic
   * refer to the same map.
   *
   * DOWN rather than to the nearest. A lower zoom covers more ground, so the
   * image is guaranteed to reach past the plane it is laid on; rounding up
   * would leave a rim the texture does not reach, and the ground would smear
   * its edge pixel outwards there.
   */
  return Math.floor(exact * 100) / 100;
}

/**
 * Texture coordinates for a scene point.
 *
 * Returned with three.js's convention, origin at the BOTTOM left — which is
 * upside down from how an image is addressed, and is the sort of thing that
 * mirrors the city north-to-south without looking like an error in a grid
 * this regular.
 *
 * Values outside 0..1 mean the point lies off the image. They are returned
 * unclamped so the caller can decide; the ground plane lets them run and
 * relies on its own fade to have finished by the time they do.
 */
export function textureCoordinate(
  east: number,
  north: number,
  placement: ImagePlacement,
): [number, number] {
  const [x, y] = sceneToMercator(east, north);
  const [centreX, centreY] = mercatorFromLonLat(placement.centre.lon, placement.centre.lat);
  const perPixel = mercatorMetresPerPixel(placement.zoom);

  return [
    0.5 + (x - centreX) / (placement.widthPx * perPixel),
    0.5 + (y - centreY) / (placement.heightPx * perPixel),
  ];
}

/**
 * Logical width asked of the Static Images API. 1280 is its maximum, and at
 * @2x that is 2,560 real pixels over the whole plane — a little over two
 * metres each. Enough at the distance the city is normally seen from, and
 * visibly soft for anyone who flies down to a doorway.
 */
const IMAGE_PX = 1280;

/**
 * How big the ground is, and the image that covers it.
 *
 * One function, called by both the plane and the thing that fetches its
 * picture, so the two cannot come to different answers about how far the
 * ground reaches — which would show as a map sliding off its own edge.
 */
export function groundPlacement(extent: {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}): {
  centreE: number;
  centreN: number;
  /** Across the data itself. */
  span: number;
  /** Across the plane, which carries the fade past the last building. */
  size: number;
  placement: ImagePlacement;
} {
  const centreE = (extent.minE + extent.maxE) / 2;
  const centreN = (extent.minN + extent.maxN) / 2;
  const span = Math.max(extent.maxE - extent.minE, extent.maxN - extent.minN);
  const size = span * 2.4;

  /*
   * One image for the whole plane rather than a sharper one over the middle.
   * A smaller image has to stop somewhere, and a texture that stops repeats
   * its edge pixel outwards in long streaks — which reads as a fault in the
   * map, where the plain fade reads as the edge of what is known.
   */
  const [lon, lat] = sceneToLonLat(centreE, centreN);

  return {
    centreE,
    centreN,
    span,
    size,
    placement: {
      centre: { lon, lat },
      zoom: zoomForGroundSpan(size, IMAGE_PX, lat),
      widthPx: IMAGE_PX,
      heightPx: IMAGE_PX,
    },
  };
}

/**
 * The Mapbox Static Images request for a placement.
 *
 * `logo` and `attribution` are off because the image is laid flat on the
 * ground, where both would be illegible and would turn with the camera.
 * Mapbox permits that only if the credit appears elsewhere, which is why it
 * is in the interface chrome instead — taking it out of there is a licensing
 * change, not a design one.
 */
export function staticImageUrl(
  placement: ImagePlacement,
  style: string,
  token: string,
): string {
  const { lon, lat } = placement.centre;
  const position = `${lon},${lat},${placement.zoom.toFixed(2)},0`;
  const size = `${Math.round(placement.widthPx)}x${Math.round(placement.heightPx)}@2x`;
  const query = new URLSearchParams({
    access_token: token,
    logo: 'false',
    attribution: 'false',
  });
  return `https://api.mapbox.com/styles/v1/${style}/static/${position}/${size}?${query}`;
}
