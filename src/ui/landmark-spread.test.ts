import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { landmarksAtScale, MAJOR, SECOND, SPACING_PX, spreadLandmarks } from './landmarkSpread';
import { buildCityModel } from '../data/adapter';
import { placeLandmarks } from '../data/landmarks';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection, ApiLandmark } from '../data/api-types';

/* Against the real 51, as the map gets them. */
const load = <T,>(name: string): T => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));
const { model } = buildCityModel(
  load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
  load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
  'snapshot',
);
const landmarks = placeLandmarks(load<ApiLandmark[]>('landmarks.json'), model);
const spread = spreadLandmarks(landmarks);

describe('which landmarks the flat map names', () => {
  it('knows every name in its tiers', () => {
    const names = new Set(landmarks.map((l) => l.name));
    for (const n of [...MAJOR, ...SECOND]) expect(names.has(n)).toBe(true);
  });

  it('keeps every landmark, the major ones first, then the second tier', () => {
    expect(spread).toHaveLength(landmarks.length);
    const order = spread.map((s) => s.item.name);
    const lastMajor = Math.max(...MAJOR.map((n) => order.indexOf(n)));
    const firstSecond = Math.min(...SECOND.map((n) => order.indexOf(n)));
    expect(lastMajor).toBeLessThan(firstSecond);
    expect(order[0]).toBe(MAJOR[0]);
  });

  it('never puts two named places closer than the spacing on screen', () => {
    for (const scale of [0.15, 0.3, 0.42, 0.8, 1.5, 3]) {
      const shown = landmarksAtScale(spread, scale);
      for (let i = 0; i < shown.length; i++)
        for (let j = i + 1; j < shown.length; j++) {
          const d = Math.hypot(shown[i].en[0] - shown[j].en[0], shown[i].en[1] - shown[j].en[1]) * scale;
          expect(d).toBeGreaterThanOrEqual(SPACING_PX - 1e-6);
        }
    }
  });

  it('names more the nearer the map is, a few on the whole CBD and nearly all up close', () => {
    const counts = [0.2, 0.42, 1, 6].map((s) => landmarksAtScale(spread, s).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    expect(counts[1]).toBeGreaterThan(3);
    expect(counts[1]).toBeLessThan(20);
    // Up close, all but the few that stand within a few metres of another.
    expect(counts.at(-1)).toBeGreaterThanOrEqual(landmarks.length - 3);
  });

  it('seats the major places first: zoomed out, the first named is a major one, and no major one is passed over for a nearer minor one', () => {
    for (const scale of [0.2, 0.42, 1]) {
      const shown = landmarksAtScale(spread, scale);
      expect(MAJOR as readonly string[]).toContain(shown[0].name);
      const apart = SPACING_PX / scale;
      for (const major of landmarks.filter((l) => (MAJOR as readonly string[]).includes(l.name))) {
        if (shown.includes(major)) continue;
        // Left out only for a major place already named near it.
        const blocker = shown.find((n) => Math.hypot(n.en[0] - major.en[0], n.en[1] - major.en[1]) < apart);
        expect(MAJOR as readonly string[]).toContain(blocker?.name);
      }
    }
  });

  it('names the same places at the same zoom, every time', () => {
    expect(spreadLandmarks(landmarks).map((s) => s.item.name)).toEqual(spread.map((s) => s.item.name));
    expect(spreadLandmarks([...landmarks].reverse()).map((s) => s.item.name)).toEqual(spread.map((s) => s.item.name));
  });
});
