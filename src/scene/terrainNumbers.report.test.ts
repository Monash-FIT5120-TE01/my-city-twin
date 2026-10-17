/*
 * What the real ground changes in the figures — a report, not a test of behaviour (terrain.ts, 2026-10-18).
 * Skipped unless TERRAIN_REPORT=1:  TERRAIN_REPORT=1 ROOM_REPORT_OUT=<file.json> npx vitest run src/scene/terrainNumbers.report.test.ts
 *
 * Spots: for each proposal, a point 40 m south of its middle (the shadow side at noon), on 21 June. What
 * the proposal takes from it, measured as before (the spot and the ground on one flat plane at the median
 * of every roof plane's base, 29.5 m) and now (the spot on the real ground, the proposal reaching down to it).
 *
 * Windows: for tall buildings, floor 3 on each side, on 21 June: direct sun at the window with the city as
 * it stands, its floor counted as the deployed app counted it (from the recorded base: the count from the
 * flat plane lasted only a day, a2b5bfa) and now (from the building's ground on the real ground, with the
 * ground's own horizon). Each version chooses its sides at its own height; a side only one of them has
 * is left out of the comparison.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { buildCityModel } from '../data/adapter';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection } from '../data/api-types';
import { clearOfBuildings, facadesOf, floorAhdM, windowPlace } from './facades';
import { buildSkyline, groundHorizon, withGroundHorizon } from './skyline';
import { sunlightAtPoint } from './sunlightAt';
import { buildingGroundAhdM, heightAt, terrainOf } from './terrain';
import { sunlightAtWindow } from './windowSunlight';

const load = <T,>(name: string): T => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));
const DATE = { year: 2026, month: 6, day: 21 };

describe.skipIf(!process.env.TERRAIN_REPORT)('the figures on real ground', () => {
  it('before and after', () => {
    const { model } = buildCityModel(
      load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
      load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
      'snapshot',
    );
    const t = terrainOf(model);
    const allBases = model.buildings.map((b) => b.baseAhdM).sort((a, b) => a - b);
    const oldPlane = allBases[Math.floor(allBases.length / 2)];

    const spots: { dev: string; groundNow: number; lostBefore: number; lostNow: number }[] = [];
    for (const d of model.developments) {
      const ring = d.parts[0]?.footprint[0]?.[0];
      if (!ring) continue;
      const ce = ring.reduce((s, p) => s + p[0], 0) / ring.length;
      const cn = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const at: [number, number] = [ce, cn - 40];
      const before = sunlightAtPoint(at, oldPlane, oldPlane, d.parts, DATE);
      const z = heightAt(t, at[0], at[1]);
      const now = sunlightAtPoint(at, z, t, d.parts, DATE, groundHorizon(at, z, (e, n) => heightAt(t, e, n)));
      spots.push({ dev: d.streetAddress, groundNow: +heightAt(t, at[0], at[1]).toFixed(1), lostBefore: before.lostMin, lostNow: now.lostMin });
    }

    const byBuilding = new Map<string, typeof model.buildings>();
    for (const p of model.buildings) byBuilding.set(p.parentId, [...(byBuilding.get(p.parentId) ?? []), p]);
    const windows: { id: string; side: string; heightBefore: number; heightNow: number; sunBefore: number; sunNow: number }[] = [];
    const skipped: { id: string; side: string; why: string }[] = [];
    for (const [id, parts] of byBuilding) {
      const base = Math.min(...parts.map((p) => p.baseAhdM));
      if (Math.max(...parts.map((p) => p.topAhdM)) - base < 40) continue;
      if (windows.length >= 120) break;
      const ground = buildingGroundAhdM(parts, t);
      const levelNow = floorAhdM(parts, 3, null, ground);
      const levelBefore = floorAhdM(parts, 3, null);
      if (levelNow === null || levelBefore === null) continue;
      const others = model.buildings.filter((b) => b.parentId !== id);
      const sidesBefore = new Map(facadesOf(parts, levelBefore).map((f) => [f.compass, f]));
      for (const f of facadesOf(parts, levelNow)) {
        const fb = sidesBefore.get(f.compass);
        if (!fb) continue;
        // chosen the way the app chooses them: moved clear of the buildings, and (now) not under the street
        const placedBefore = windowPlace(parts, fb, 3, null);
        const placedNow = windowPlace(parts, f, 3, null, ground);
        const underStreet = (w: { en: [number, number]; ahdM: number }) => heightAt(t, w.en[0], w.en[1]) > w.ahdM - 1.2 + 0.15;
        // the app refuses a floor under the street before moving the point clear, and again after
        if (placedNow && underStreet(placedNow)) {
          skipped.push({ id, side: f.compass, why: 'below the street now' });
          continue;
        }
        const before = placedBefore && clearOfBuildings(placedBefore, parts, others);
        const now = placedNow && clearOfBuildings(placedNow, parts, others);
        if (!before || !now) {
          skipped.push({ id, side: f.compass, why: 'inside a building' });
          continue;
        }
        if (underStreet(now)) {
          skipped.push({ id, side: f.compass, why: 'below the street now' });
          continue;
        }
        // the whole city, the building's own other wings included, as the app's skyline has it
        const sunBefore = sunlightAtWindow(before, buildSkyline(before.en, before.ahdM, model.buildings), null, DATE).sunAtWindowMin;
        const skyNow = withGroundHorizon(buildSkyline(now.en, now.ahdM, model.buildings), now.en, now.ahdM, (e, n) => heightAt(t, e, n));
        const sunNow = sunlightAtWindow(now, skyNow, null, DATE).sunAtWindowMin;
        windows.push({ id, side: f.compass, heightBefore: +before.ahdM.toFixed(1), heightNow: +now.ahdM.toFixed(1), sunBefore, sunNow });
      }
    }

    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const spotDiff = spots.map((s) => s.lostNow - s.lostBefore);
    const winDiff = windows.map((w) => w.sunNow - w.sunBefore);
    const summary = {
      oldPlaneAhdM: oldPlane,
      spots: {
        count: spots.length,
        lostBeforeMedianMin: median(spots.map((s) => s.lostBefore)),
        lostNowMedianMin: median(spots.map((s) => s.lostNow)),
        changedBy30MinOrMore: spotDiff.filter((d) => Math.abs(d) >= 30).length,
        biggestIncrease: spots.reduce((a, b) => (b.lostNow - b.lostBefore > a.lostNow - a.lostBefore ? b : a), spots[0]),
      },
      windows: {
        count: windows.length,
        heightChangeMedianM: median(windows.map((w) => w.heightNow - w.heightBefore)),
        sunBeforeMedianMin: median(windows.map((w) => w.sunBefore)),
        sunNowMedianMin: median(windows.map((w) => w.sunNow)),
        changedBy30MinOrMore: winDiff.filter((d) => Math.abs(d) >= 30).length,
        notCompared: skipped.length,
        notComparedBelowTheStreet: skipped.filter((x) => x.why.startsWith('below')).length,
      },
      spotsDetail: spots,
      windowsDetail: windows,
    };
    writeFileSync(process.env.ROOM_REPORT_OUT ?? 'terrain-report.json', JSON.stringify(summary, null, 1));
  }, 600_000);
});
