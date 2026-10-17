/*
 * Where the flat gets the most direct sun — for picking the places the shadows are checked at (stage 4,
 * ProjectDoc/studio-room/PLAN.md 7.2). A report, not a test of behaviour.
 * Skipped unless ROOM_SUNNY=1:  ROOM_SUNNY=1 ROOM_REPORT_OUT=<file.json> npx vitest run src/scene/room/roomSunny.report.test.ts
 *
 * For every place the flat fits (the same places as roomFit.report.test.ts), the minutes between 7 am and
 * 5 pm on the two solstices when the sun is in front of the facade and nothing in the city stands between
 * it and the middle of the balcony, half a metre above its floor.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { buildCityModel } from '../../data/adapter';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection } from '../../data/api-types';
import { facadesOf } from '../facades';
import { groundElevationOf } from '../massing';
import { SITE } from '../frame';
import { civilToInstant, solarPosition } from '../solar';
import { blockedBySubject } from '../sunlightAt';
import { fitRoomInModel, toEN } from './roomPlacement';

const load = <T,>(name: string): T => JSON.parse(readFileSync(resolve(__dirname, '../../../public/data', name), 'utf-8'));

describe.skipIf(!process.env.ROOM_SUNNY)('the flat in the sun', () => {
  it('finds the sunniest places', () => {
    const { model } = buildCityModel(
      load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
      load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
      'snapshot',
    );
    const ground = groundElevationOf(model.buildings);
    const days = { june: [2026, 6, 21], december: [2026, 12, 21] } as const;
    const suns = Object.fromEntries(Object.keys(days).map((k) => [k, [] as { t: number; altitudeDeg: number; azimuthDeg: number }[]]));
    for (const [k, [y, m, d]] of Object.entries(days)) {
      for (let t = 420; t < 1020; t += 30) {
        const s = solarPosition(civilToInstant(SITE.timeZone, y, m, d, Math.floor(t / 60), t % 60), { lat: SITE.lat, lon: SITE.lon, elevationM: SITE.elevationM });
        if (s.altitudeDeg > 3) suns[k].push({ t, ...s });
      }
    }
    const ids = [...new Set(model.buildings.map((b) => b.parentId))];
    const rows: { id: string; floor: number; side: string; june: number[]; december: number[] }[] = [];
    for (const id of ids) {
      const parts = model.buildings.filter((b) => b.parentId === id);
      const base = Math.min(...parts.map((p) => p.baseAhdM));
      const top = Math.max(...parts.map((p) => p.topAhdM));
      if (top - base < 20) continue;
      for (const floor of [3, 6, 10, 20]) {
        const sill = base + 3 * (floor - 1) + 1.2;
        if (sill > top) continue;
        for (const f of facadesOf(parts, sill)) {
          const fit = fitRoomInModel(model.buildings, id, f.compass, floor, null);
          if (!fit?.ok) continue;
          const p = fit.placement;
          const at = toEN(p, 8.4, 1.75);
          const z = p.floorAhdM + 0.5;
          const out = [Math.cos(p.angle), Math.sin(p.angle)];
          const row = { id, floor, side: p.side, june: [] as number[], december: [] as number[] };
          for (const k of ['june', 'december'] as const) {
            for (const s of suns[k]) {
              const towards = [Math.sin((s.azimuthDeg * Math.PI) / 180), Math.cos((s.azimuthDeg * Math.PI) / 180)];
              if (towards[0] * out[0] + towards[1] * out[1] < 0.3) continue;   // the sun behind or along the wall
              if (!blockedBySubject(at, z, ground, s, model.buildings)) row[k].push(s.t);
            }
          }
          rows.push(row);
        }
      }
    }
    rows.sort((a, b) => b.june.length + b.december.length - (a.june.length + a.december.length));
    writeFileSync(process.env.ROOM_REPORT_OUT ?? 'room-sunny-report.json', JSON.stringify(rows.slice(0, 25), null, 1));
  }, 600_000);
});
