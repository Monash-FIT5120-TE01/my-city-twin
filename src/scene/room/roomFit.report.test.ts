/*
 * How often the flat fits in the real city — a report, not a test of behaviour.
 * Skipped unless ROOM_REPORT=1:  ROOM_REPORT=1 ROOM_REPORT_OUT=<file.json> npx vitest run src/scene/room/roomFit.report.test.ts
 *
 * For every building in the bundled snapshot that is 20 m or taller: floors 3, 6, 10 and 20 (where it has
 * them, at the assumed 3 m a storey) and each of its sides. Counts places the flat fits and, where it
 * does not, why; and how many buildings have at least one place.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { buildCityModel } from '../../data/adapter';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection } from '../../data/api-types';
import { facadesOf } from '../facades';
import { fitRoomInModel } from './roomPlacement';

const load = <T,>(name: string): T => JSON.parse(readFileSync(resolve(__dirname, '../../../public/data', name), 'utf-8'));

describe.skipIf(!process.env.ROOM_REPORT)('the flat in the real city', () => {
  it('counts where it fits', () => {
    const { model } = buildCityModel(
      load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
      load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
      'snapshot',
    );
    const byBuilding = new Map<string, typeof model.buildings>();
    for (const p of model.buildings) {
      const list = byBuilding.get(p.parentId) ?? [];
      list.push(p);
      byBuilding.set(p.parentId, list);
    }
    const reasons = new Map<string, number>();
    let tried = 0;
    let fits = 0;
    let buildingsWithAPlace = 0;
    let buildingsTried = 0;
    const examples: string[] = [];
    for (const [id, parts] of byBuilding) {
      const base = Math.min(...parts.map((p) => p.baseAhdM));
      const top = Math.max(...parts.map((p) => p.topAhdM));
      if (top - base < 20) continue;
      buildingsTried += 1;
      let any = false;
      for (const floor of [3, 6, 10, 20]) {
        const sill = base + 3 * (floor - 1) + 1.2;
        if (sill > top) continue;
        for (const f of facadesOf(parts, sill)) {
          tried += 1;
          const fit = fitRoomInModel(model.buildings, id, f.compass, floor, null);
          if (!fit) continue;
          if (fit.ok) {
            fits += 1;
            any = true;
            if (examples.length < 12) examples.push(`${id} floor ${floor} ${f.compass}`);
          } else {
            reasons.set(fit.problem, (reasons.get(fit.problem) ?? 0) + 1);
          }
        }
      }
      if (any) buildingsWithAPlace += 1;
    }
    const out = JSON.stringify({
      buildingsTried, buildingsWithAPlace, placesTried: tried, placesThatFit: fits,
      refused: Object.fromEntries([...reasons].sort((a, b) => b[1] - a[1])), examples,
    }, null, 1);
    // written to a file: the test runner keeps console output to itself
    writeFileSync(process.env.ROOM_REPORT_OUT ?? 'room-fit-report.json', out);
  }, 600_000);
});
