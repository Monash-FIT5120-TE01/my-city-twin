/*
 * The solar panel check for one building, against the city as it stands and
 * once the approved developments are built (the buildings they replace taken
 * down), and what the screen and the scene need from the two:
 *
 *   - the second run only when something that changes is near enough to shade
 *     the roof (possibleShaders), and only after the first is done;
 *   - which developments to name: anything that could shade the roof at all is
 *     "near" (down to 2 degrees, kilometres off for a tower), so the ones named
 *     rise at least NAME_ABOVE_DEG above the roof from its middle, on the sun's
 *     side of the sky, highest first;
 *   - the roof lost to them, to hatch (LostRoof.tsx).
 */
import { useMemo } from 'react';
import type { Massing } from '../data/model';
import { LIGHT_MIN } from './panelLayout';
import { possibleShaders } from './solarShade';
import { useSolarCheck, type SolarCheck } from './useSolarCheck';

/** An approved development: its parts, and the buildings (parentIds) it takes down. */
export interface PlannedDevelopment { address: string; parts: Massing[]; replaces: string[] }

/** What the scene draws on the roof (SolarOnRoof.tsx). */
export interface SolarScene { check: SolarCheck; lost: SolarCheck['pieces']; showPanels: boolean }

export interface SolarComparison {
  /** The check to show: with the developments when they are switched on, change the roof, and have started. */
  check: SolarCheck | null;
  now: SolarCheck | null;
  planned: SolarCheck | null;
  /** How many developments could shade the roof, and the ones worth naming. */
  nearby: number; named: string[];
  /** The roof lost to the developments, while they are shown. */
  lost: SolarCheck['pieces'];
  /** The building is itself replaced by a development: nothing to compare. */
  plansBlocked: boolean;
  /** The developments are switched on and count for this building. */
  usesPlans: boolean;
  /** Every building any development takes down. */
  replaced: Set<string>;
}

/** A development is named as shading the roof when it rises at least this far above it, degrees. */
const NAME_ABOVE_DEG = 5;
/** Bearings (from north, clockwise) the sun never reaches at Melbourne: it rises and sets no further south than about 118 and 242 degrees. */
const SUNLESS_DEG = [120, 240] as const;
/** Points along each outline this far apart at most, m, when looking for how high a part rises over the roof. */
const ALONG_M = 2;

/**
 * How high a part rises over the roof seen from (e, n) at height `top`, degrees: the highest of the
 * points along all its outlines (every ALONG_M), leaving out those in the south where the sun never is.
 */
export function highestOver(p: Massing, e: number, n: number, top: number): number {
  let best = -90;
  for (const poly of p.footprint) for (const ring of poly) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[i + 1], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / ALONG_M));
      for (let k = 0; k <= steps; k++) {
        const x = ax + ((bx - ax) * k) / steps, y = ay + ((by - ay) * k) / steps;
        const bearing = ((Math.atan2(x - e, y - n) * 180) / Math.PI + 360) % 360;
        if (bearing > SUNLESS_DEG[0] && bearing < SUNLESS_DEG[1]) continue;
        best = Math.max(best, (Math.atan2(p.topAhdM - top, Math.max(Math.hypot(x - e, y - n), 1)) * 180) / Math.PI);
      }
    }
  }
  return best;
}

/** The pieces kept for panels now and lost with the developments (the same roof, so the same blocks). */
export function lostPieces(now: SolarCheck, planned: SolarCheck): SolarCheck['pieces'] {
  if (!now.blockSun || !planned.blockSun) return [];
  const lost = now.blockSun.map((s, b) => s.energy >= LIGHT_MIN && planned.blockSun![b].energy < LIGHT_MIN);
  return now.pieces.filter((p) => p.block !== undefined && lost[p.block]);
}

/**
 * `parts` is the chosen building (null when none, or when the check is not wanted yet); `standing` the
 * city as it is; `developments` the approved ones.
 */
export function useSolarComparison(
  parts: Massing[] | null, standing: Massing[], developments: PlannedDevelopment[], year: number, withPlans: boolean,
): SolarComparison {
  const replaced = useMemo(() => new Set(developments.flatMap((d) => d.replaces)), [developments]);
  const plannedCity = useMemo(
    () => [...standing.filter((p) => !replaced.has(p.parentId)), ...developments.flatMap((d) => d.parts)],
    [standing, developments, replaced],
  );
  const some = parts && parts.length ? parts : null;
  const plansBlocked = !!some && replaced.has(some[0].parentId);
  const usesPlans = withPlans && !plansBlocked;

  const now = useSolarCheck(some, standing, year);
  // each development with the buildings it takes down: either changes the roof's sun
  const changes = useMemo(
    () => developments.map((d) => ({ d, parts: [...d.parts, ...standing.filter((p) => d.replaces.includes(p.parentId))] })),
    [developments, standing],
  );
  const near = useMemo(() => {
    const blocks = now?.roofBlocks;
    if (!blocks || plansBlocked) return [];
    return changes.filter((c) => possibleShaders(blocks, c.parts).length > 0);
  }, [changes, now?.roofBlocks, plansBlocked]);
  const named = useMemo(() => {
    const blocks = now?.roofBlocks;
    if (!blocks?.length) return [];
    const e = blocks.reduce((t, b) => t + b.centre[0], 0) / blocks.length, n = blocks.reduce((t, b) => t + b.centre[1], 0) / blocks.length;
    const top = Math.min(...blocks.map((b) => b.topAhdM));
    return near
      .map((c) => ({ address: c.d.address, deg: Math.max(...c.parts.map((p) => highestOver(p, e, n, top))) }))
      .filter((x) => x.deg >= NAME_ABOVE_DEG)
      .sort((a, b) => b.deg - a.deg)
      .map((x) => x.address);
  }, [near, now?.roofBlocks]);

  const affects = near.length > 0;
  const planned = useSolarCheck(affects && now?.done ? some : null, plannedCity, year);
  const check = usesPlans && affects && planned ? planned : now;
  const lost = useMemo(() => (usesPlans && now?.done && planned?.done ? lostPieces(now, planned) : []), [usesPlans, now, planned]);
  return { check, now, planned, nearby: near.length, named, lost, plansBlocked, usesPlans, replaced };
}
