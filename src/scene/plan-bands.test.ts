import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PolygonEN } from '../data/model';
import { landmarkEN } from '../data/landmarks';
import { PLACED_NAMES, planPlaceFor } from '../ui/planPlaces';
import { obstaclesOf, openQuads, type BandSegment, type Quad } from './planBands';

/** Points spread over a rectangle, edges included. */
function samples([a, b, , d]: Quad, step = 0.5): [number, number][] {
  const along = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const across = Math.hypot(d[0] - a[0], d[1] - a[1]);
  const out: [number, number][] = [];
  for (let t = 0; t <= along + 1e-6; t += Math.min(step, along)) {
    for (let s = 0; s <= across + 1e-6; s += Math.min(step, across)) {
      const ft = along ? t / along : 0;
      const fs_ = across ? s / across : 0;
      out.push([a[0] + (b[0] - a[0]) * ft + (d[0] - a[0]) * fs_, a[1] + (b[1] - a[1]) * ft + (d[1] - a[1]) * fs_]);
    }
  }
  return out;
}

describe('openQuads', () => {
  it('cuts a band out of a building it crosses, and keeps the ground either side', () => {
    const building: PolygonEN = [[[40, -20], [60, -20], [60, 20], [40, 20]]];
    const obstacles = obstaclesOf([building]);
    const band: BandSegment = { from: [0, 0], to: [100, 0], widthM: 10 };
    const quads = openQuads([band], obstacles);
    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) for (const [e, n] of samples(quad)) expect(obstacles.inside(e, n)).toBe(false);
    const reach = quads.flatMap((quad) => quad.map(([e]) => e));
    expect(Math.min(...reach)).toBeLessThan(5);
    expect(Math.max(...reach)).toBeGreaterThan(95);
  });
});

describe('the plans’ bands against the real footprints', () => {
  it('leave no part of any band inside a building', () => {
    const doc = JSON.parse(fs.readFileSync('public/data/building-footprints.json', 'utf8'));
    const footprints: PolygonEN[] = [];
    for (const feature of doc.features) {
      const g = feature.geometry;
      const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const polygon of polygons) {
        footprints.push([polygon[0].map(([lon, lat]: number[]) => landmarkEN({ longitude: String(lon), latitude: String(lat) }))]);
      }
    }
    const obstacles = obstaclesOf(footprints);
    let banded = 0;
    for (const name of PLACED_NAMES) {
      const place = planPlaceFor({ id: 0, name, topic: '' });
      if (!place.onMap || place.shapes.length === 0) continue;
      banded++;
      const segments: BandSegment[] = place.shapes.flatMap((shape) => {
        const points = shape.kind === 'ring' ? [...shape.points, shape.points[0]] : shape.points;
        const widthM = shape.kind === 'ring' ? 14 : shape.widthM;
        return points.slice(1).map((to, i) => ({ from: points[i], to, widthM }));
      });
      const quads = openQuads(segments, obstacles);
      expect(quads.length, name).toBeGreaterThan(0);
      let inside = 0;
      for (const quad of quads) for (const [e, n] of samples(quad, 1)) if (obstacles.inside(e, n)) inside++;
      expect(inside, name).toBe(0);
    }
    expect(banded).toBeGreaterThan(0);
  }, 120000);
});
