import { describe, expect, it } from 'vitest';
import { projectLonLat, unprojectMetric } from '../data/project';
import {
  groundPlacement,
  mercatorFromLonLat,
  mercatorMetresPerPixel,
  sceneToLonLat,
  sceneToMercator,
  staticImageUrl,
  textureCoordinate,
  zoomForGroundSpan,
} from './basemap';
import { LOCAL_ORIGIN_WGS84 } from './frame';

/*
 * Most of this file exists for one number: 1.25°.
 *
 * The scene's north is EPSG:7855 grid north; a Mapbox image's north is true
 * north; and at Melbourne those differ by the grid convergence. Nothing fails
 * if that is ignored — the map simply arrives turned by a degree, which at
 * the corner of a two-kilometre model is 44 m, and looks like the data being
 * slightly wrong rather than the image being placed wrong.
 */

const RAD = 180 / Math.PI;

/** Grid convergence from the closed form: (λ − λ₀)·sin φ, in degrees. */
const CONVERGENCE_DEG =
  (LOCAL_ORIGIN_WGS84.lon - 147) * Math.sin(LOCAL_ORIGIN_WGS84.lat / RAD);

describe('web mercator', () => {
  it('puts the origin of the projection at zero', () => {
    const [x, y] = mercatorFromLonLat(0, 0);
    expect(x).toBe(0);
    // Not exactly zero: tan(π/4) lands a rounding step below 1, and the log
    // of that is a nanometre of northing. Worth knowing it is there, and not
    // worth chasing.
    expect(y).toBeCloseTo(0, 6);
  });

  it('stretches the far south by 1/cos, which is why map metres are not ground metres', () => {
    // Half the placement arithmetic exists to undo this factor. Measured over
    // a small step, so the answer is the local stretch and not an average
    // across a wide band of latitude.
    const STEP = 0.001;
    const atEquator = mercatorFromLonLat(0, STEP)[1] - mercatorFromLonLat(0, 0)[1];
    const here =
      mercatorFromLonLat(0, LOCAL_ORIGIN_WGS84.lat + STEP)[1] -
      mercatorFromLonLat(0, LOCAL_ORIGIN_WGS84.lat)[1];

    expect(here / atEquator).toBeCloseTo(1 / Math.cos(LOCAL_ORIGIN_WGS84.lat / RAD), 3);
  });
});

describe('the scene on the globe', () => {
  it('puts the scene origin back where it came from', () => {
    const [lon, lat] = sceneToLonLat(0, 0);
    expect(lon).toBeCloseTo(LOCAL_ORIGIN_WGS84.lon, 9);
    expect(lat).toBeCloseTo(LOCAL_ORIGIN_WGS84.lat, 9);
  });

  it('undoes the projection exactly, both ways', () => {
    // The two directions are used in the same breath - forward to place the
    // model, back to place the map - so a disagreement between them would
    // show up as the map sliding against the buildings.
    for (const [dLon, dLat] of [
      [0, 0],
      [0.02, 0.02],
      [-0.02, 0.015],
    ]) {
      const lon = LOCAL_ORIGIN_WGS84.lon + dLon;
      const lat = LOCAL_ORIGIN_WGS84.lat + dLat;
      const [x, y] = projectLonLat(lon, lat);
      const [backLon, backLat] = unprojectMetric(x, y);
      expect(backLon).toBeCloseTo(lon, 9);
      expect(backLat).toBeCloseTo(lat, 9);
    }
  });

  it('finds grid north turned off true north by the convergence', () => {
    /*
     * This is the whole reason the ground is converted vertex by vertex. Walk
     * a kilometre along the scene's +north axis and see where that lands in
     * Web Mercator: if the two norths agreed, it would land straight up.
     */
    const [originX, originY] = sceneToMercator(0, 0);
    const [northX, northY] = sceneToMercator(0, 1000);

    const tiltDeg = Math.atan2(northX - originX, northY - originY) * RAD;

    /*
     * It lands 1.25° east of straight up: grid north points east of true
     * north on this side of the central meridian.
     *
     * The closed form is first order in (λ − λ₀) and comes out 0.005° away
     * from the projection's own answer. That gap is why the ground is
     * converted rather than rotated by the formula - but it is small enough
     * to confirm that what is being measured here is the convergence and not
     * some other mistake of about the same size.
     */
    expect(tiltDeg).toBeCloseTo(CONVERGENCE_DEG, 1);
    expect(Math.abs(tiltDeg - CONVERGENCE_DEG)).toBeLessThan(0.01);
    expect(tiltDeg).toBeGreaterThan(1.2);

    // What ignoring it would have cost, stated in metres so the size of the
    // mistake is on the page rather than in a comment.
    const errorAtCornerM = 2000 * Math.abs(Math.tan(tiltDeg / RAD));
    expect(errorAtCornerM).toBeGreaterThan(40);
  });
});

describe('fitting an image to the ground', () => {
  const placement = (spanM: number) => ({
    centre: LOCAL_ORIGIN_WGS84,
    zoom: zoomForGroundSpan(spanM, 1280, LOCAL_ORIGIN_WGS84.lat),
    widthPx: 1280,
    heightPx: 1280,
  });

  it('asks for a zoom that covers the ground it was given', () => {
    /*
     * Covers, not equals. The zoom is quantised down to the two decimal
     * places Mapbox keeps, so the image reaches slightly PAST the plane —
     * which is the safe direction. Rounding the other way would leave a rim
     * the texture never reaches, and the ground would smear its edge pixel
     * across it.
     */
    const SPAN_M = 4000;
    const covered =
      mercatorMetresPerPixel(placement(SPAN_M).zoom) *
      1280 *
      Math.cos(LOCAL_ORIGIN_WGS84.lat / RAD);

    expect(covered).toBeGreaterThanOrEqual(SPAN_M);
    // One step of the quantisation is 2^0.01, about 0.7%. More than that and
    // something other than the rounding has gone wrong.
    expect(covered).toBeLessThan(SPAN_M * 1.007);
  });

  it('reads the centre of the image at the centre of the texture', () => {
    const [u, v] = textureCoordinate(0, 0, placement(4000));
    expect(u).toBeCloseTo(0.5, 9);
    expect(v).toBeCloseTo(0.5, 9);
  });

  it('runs the texture up as north goes up', () => {
    // three.js addresses textures from the bottom left and an image from the
    // top left. Backwards, this mirrors the city north-to-south, which is
    // hard to see in a grid as regular as this one.
    const [, south] = textureCoordinate(0, -1000, placement(4000));
    const [, north] = textureCoordinate(0, 1000, placement(4000));
    expect(north).toBeGreaterThan(south);
  });

  it('carries the convergence into the texture coordinates, not just the maths', () => {
    /*
     * THE TEST THAT WAS MISSING, AND WHY IT MATTERS MOST.
     *
     * Everything above checks sceneToMercator, which is where the 1.25° lives
     * — and nothing checked that textureCoordinate actually goes through it.
     * An axis-aligned mapping, the exact shortcut this file warns against,
     * passed the entire suite. A reviewer substituted one and all fourteen
     * tests stayed green.
     *
     * So: walk due east in the scene. Under an axis-aligned mapping v cannot
     * change, because east is a pure u move. Through the real conversion the
     * image is turned beneath the walk and v must drop. The expected size is
     * the tangent of the convergence, and it is checked to a tenth of a
     * percent so that a mapping which merely wobbles cannot pass either.
     */
    const SPAN_M = 4000;
    const EAST_M = 1000;
    const place = placement(SPAN_M);

    const [uOrigin, vOrigin] = textureCoordinate(0, 0, place);
    const [uEast, vEast] = textureCoordinate(EAST_M, 0, place);

    expect(uEast).toBeGreaterThan(uOrigin);

    // Back into ground metres: the texture spans SPAN_M across its width.
    const acrossM = (uEast - uOrigin) * SPAN_M;
    const dropM = (vEast - vOrigin) * SPAN_M;

    expect(dropM).toBeLessThan(0);
    expect(Math.abs(dropM)).toBeCloseTo(acrossM * Math.tan(CONVERGENCE_DEG / RAD), 1);
    // Stated in metres as well, so the size of what is being protected is on
    // the page: about 22 m of sideways error per kilometre walked.
    expect(Math.abs(dropM)).toBeGreaterThan(20);
  });

  it('reaches the edge of the texture at the edge of the ground it covers', () => {
    const SPAN_M = 4000;
    const [u] = textureCoordinate(SPAN_M / 2, 0, placement(SPAN_M));
    // Not exactly 1: the scene axis is turned 1.25° off the image axis, so
    // the edge of the ground and the edge of the image are not the same
    // place. Within a percent is the conversion working, not failing.
    expect(u).toBeGreaterThan(0.99);
    expect(u).toBeLessThan(1.01);
  });
});

describe('sizing the ground and its image together', () => {
  // Roughly the real thing: the Hoddle Grid is about 2.1 km by 1.8 km, and
  // the model's origin sits inside it rather than at its middle.
  const extent = { minE: -781, minN: -889, maxE: 1326, maxN: 931 };
  const { centreE, centreN, size, placement } = groundPlacement(extent);

  it('centres the plane on the data, not on the scene origin', () => {
    expect(centreE).toBeCloseTo(272.5, 1);
    expect(centreN).toBeCloseTo(21, 1);
  });

  it('covers the whole plane with the image', () => {
    /*
     * The plane and the picture of it are sized by the same function so they
     * cannot disagree - this is what "cannot disagree" means in numbers. A
     * corner that fell outside 0..1 would be a corner where the texture had
     * run out and started smearing its edge pixel outwards.
     *
     * The margin is the 1.25° turn between the two norths: a square of ground
     * is not a square of image, so the corners come in a little short on one
     * diagonal and a little long on the other. Under 2% either way.
     */
    const half = size / 2;
    for (const [dE, dN] of [
      [-half, -half],
      [half, -half],
      [-half, half],
      [half, half],
    ]) {
      const [u, v] = textureCoordinate(centreE + dE, centreN + dN, placement);
      expect(u).toBeGreaterThan(-0.02);
      expect(u).toBeLessThan(1.02);
      expect(v).toBeGreaterThan(-0.02);
      expect(v).toBeLessThan(1.02);
    }
  });

  it('asks Mapbox for no more than it will serve', () => {
    // 1280 is the maximum the Static Images API accepts. Larger is not a
    // sharper map, it is a 422 and a city with no map at all.
    expect(placement.widthPx).toBeLessThanOrEqual(1280);
    expect(placement.heightPx).toBeLessThanOrEqual(1280);
  });
});

describe('the request', () => {
  const placement = {
    centre: LOCAL_ORIGIN_WGS84,
    zoom: 14.2,
    widthPx: 1280,
    heightPx: 1280,
  };

  it('asks for the placement it was given', () => {
    const url = staticImageUrl(placement, 'mapbox/light-v11', 'pk.test');
    expect(url).toContain('/styles/v1/mapbox/light-v11/static/');
    expect(url).toContain('144.9605,-37.8145,14.20,0');
    expect(url).toContain('/1280x1280@2x?');
  });

  it('asks for a zoom Mapbox will honour exactly', () => {
    /*
     * Mapbox keeps two decimal places of a fractional zoom and drops the
     * rest. Requesting 13.933842 gets an image drawn at 13.93 — while the
     * texture coordinates, computed from the unrounded figure, address it as
     * though it were not. That is a 0.27% scale disagreement, about 2.7 m a
     * kilometre out, which looks like the map being slightly the wrong size
     * rather than like a rounding rule.
     */
    const zoom = zoomForGroundSpan(4231.8, 1280, LOCAL_ORIGIN_WGS84.lat);
    expect(zoom).toBe(Math.round(zoom * 100) / 100);
  });

  it('turns off the credit it cannot legibly show', () => {
    // The image lies flat on the ground, so a logo in its corner would be
    // upside down half the time. Mapbox allows removing it only when the
    // credit appears elsewhere - see the attribution in the interface chrome.
    const url = staticImageUrl(placement, 'mapbox/light-v11', 'pk.test');
    expect(url).toContain('logo=false');
    expect(url).toContain('attribution=false');
  });
});
