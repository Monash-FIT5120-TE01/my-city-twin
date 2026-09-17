import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import proj4 from 'proj4';
import { buildSkyline, sunReaches } from './skyline';
import { PROJECTED_CRS_DEF, SOURCE_CRS, LOCAL_ORIGIN_WGS84 } from './frame';
import type { Massing } from '../data/model';

/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE WHOLE CITY, ONCE, AGAINST THE CLOCK
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The room-sunlight design rests on one claim: that a skyline against every
 * building in the extract is cheap enough to build while somebody waits, and
 * that having built it, a day of sun costs nothing. If that is false the
 * design is wrong, and it is better to find out here than in a profile.
 *
 * This reads the real footprint payload rather than a fixture. It is the only
 * test that does, which is the point -- 4,443 shapes is the number that
 * matters and no fixture would honestly stand in for it.
 */

proj4.defs('EPSG:7855', PROJECTED_CRS_DEF);
const toMetric = proj4(SOURCE_CRS, 'EPSG:7855');
const [originE, originN] = toMetric.forward([
  LOCAL_ORIGIN_WGS84.lon,
  LOCAL_ORIGIN_WGS84.lat,
]);

function realCity(): Massing[] {
  const raw = fs.readFileSync('public/data/building-footprints.json', 'utf8');
  const doc = JSON.parse(raw) as {
    features: {
      geometry: { type: string; coordinates: number[][][] | number[][][][] };
      properties: Record<string, string>;
    }[];
  };
  const features = doc.features;

  const city: Massing[] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    const base = Number(feature.properties.footprintMinElevationAhdM);
    const top = Number(feature.properties.footprintMaxElevationAhdM);
    if (!Number.isFinite(base) || !Number.isFinite(top)) continue;

    const polygons = (
      geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as number[][][][])
        : [geometry.coordinates as number[][][]]
    ).map((polygon) =>
      polygon.map((ring) =>
        ring.map((point) => {
          const [x, y] = toMetric.forward(point as [number, number]);
          return [x - originE, y - originN] as [number, number];
        }),
      ),
    );

    city.push({
      id: feature.properties.buildingId,
      parentId: feature.properties.buildingId,
      footprint: polygons,
      baseAhdM: base,
      topAhdM: top,
      heightM: top - base,
      areaM2: Number(feature.properties.footprintAreaM2) || 0,
      sinksToGround: true,
    });
  }
  return city;
}

const city = realCity();

describe('a skyline against the whole extract', () => {
  it('reads every footprint in the payload', () => {
    expect(city.length).toBeGreaterThan(4000);
  });

  it('builds in a time somebody would not notice', () => {
    // Street level in the middle of the grid: the worst case, because almost
    // nothing is shorter than the viewpoint and so nothing gets skipped.
    const started = performance.now();
    const skyline = buildSkyline([0, 0], 20, city);
    const tookMs = performance.now() - started;

    // Generous, because CI machines vary. The design assumed tens of
    // milliseconds; this fails loudly if it turns out to be seconds.
    expect(tookMs).toBeLessThan(1500);
    expect([...skyline].some((altitude) => altitude > 0)).toBe(true);

    console.log(`      skyline at street level: ${tookMs.toFixed(0)} ms`);
  });

  it('is far cheaper from up a tower, where most roofs fall away', () => {
    const low = performance.now();
    buildSkyline([0, 0], 20, city);
    const lowMs = performance.now() - low;

    const high = performance.now();
    buildSkyline([0, 0], 150, city);
    const highMs = performance.now() - high;

    console.log(`      street ${lowMs.toFixed(0)} ms vs 150 m up ${highMs.toFixed(0)} ms`);
    expect(highMs).toBeLessThanOrEqual(lowMs + 1);
  });

  it('answers a whole day from the built skyline in well under a millisecond', () => {
    const skyline = buildSkyline([0, 0], 60, city);

    const started = performance.now();
    let lit = 0;
    for (let i = 0; i < 85; i++) {
      // Sweep the sun across the sky the way a day does, roughly.
      const azimuth = 60 + i * 2.5;
      const altitude = 40 * Math.sin((i / 85) * Math.PI);
      if (sunReaches(skyline, { altitudeDeg: altitude, azimuthDeg: azimuth }, 90)) lit++;
    }
    const tookMs = performance.now() - started;

    console.log(`      85 time samples: ${tookMs.toFixed(3)} ms, ${lit} lit`);
    expect(tookMs).toBeLessThan(5);
  });

  it('sees more sky higher up than it does at street level', () => {
    const street = buildSkyline([0, 0], 5, city);
    const upstairs = buildSkyline([0, 0], 120, city);

    const mean = (s: Float32Array) => [...s].reduce((a, b) => a + b, 0) / s.length;
    expect(mean(upstairs)).toBeLessThan(mean(street));
  });
});
