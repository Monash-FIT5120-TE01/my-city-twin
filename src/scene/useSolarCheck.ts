/*
 * The solar panel check for one building: the roof a panel could go on
 * (roofParts.ts), then how much of it is shaded for too much of the year
 * (solarShade.ts), both worked out in workers off the page's thread
 * (solarWorkers.ts).
 *
 * A result belongs to the roof, the city and the year it was worked out for;
 * when any of them changes, the old one is not shown as finished while the
 * new one is measured. Results for the roof are kept per city and year, so
 * going back to one already measured (the city with and without the approved
 * developments) shows it at once.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Massing } from '../data/model';
import type { RoofBlock, RoofPiece, RoofResult } from './roofParts';
import { layOut, pairFacing, type RoofLayout } from './panelLayout';
import { SHADE_LIMIT, yearLight, type BlockSun } from './solarShade';
import { roofOffThread, shadeBlocksOffThread } from './solarWorkers';

/** The panel assumed, laid east-west at 10 degrees with walkways (ProjectDoc/solar, report Table 1). */
export const PANEL_W = 445;
export const ARRAY_M2_PER_PANEL = 2.62;
/** Modelled yield for that layout in Melbourne, kWh per kW per year (PVGIS 5.3, east and west 10 degrees, unshaded). */
export const KWH_PER_KW = 1250;
/** Shade blocks, m. */
const BLOCK_M = 1;

/**
 * How good a place for a panel each piece of roof is, by the share of an unshaded panel's year of
 * light it keeps (BlockSun.energy): 4 at LEVEL_FLOORS[0] or more, 3 at [1], 2 at [2], 1 below. 0 while
 * not yet measured. Apart from the rule's test (SHADE_LIMIT), which the panels are also laid out by for
 * comparison: in the CBD most roof that fails it keeps 60 to 90% of the energy, and the levels show that.
 * The panels themselves go where the light is enough (panelLayout.ts, LIGHT_MIN).
 */
export const LEVEL_FLOORS = [0.9, 0.8, 0.6] as const;
export function levelOf(sun: BlockSun): 1 | 2 | 3 | 4 {
  return sun.energy >= LEVEL_FLOORS[0] ? 4 : sun.energy >= LEVEL_FLOORS[1] ? 3 : sun.energy >= LEVEL_FLOORS[2] ? 2 : 1;
}

export interface SolarCheck {
  /** Still finding the roof: nothing below is known yet. */
  finding: boolean;
  /** Roof seen from above, and what the geometric rules leave (m²). */
  roofM2: number; candidateM2: number;
  /** While measuring: the share done. */
  progress: number; done: boolean;
  /** Once done: the candidate roof shaded for more than SHADE_LIMIT of daylight, and what is left. */
  shadedM2: number; sunnyM2: number;
  /**
   * Once done: the panels laid out where every cell keeps enough light (panelLayout.ts), and how many
   * the NCC's shade rule would allow laid out the same way. An upper figure: plant the massing does not
   * have and the roof's structure are not taken off.
   */
  panels: number; panelsByRule: number;
  /** Once done: the layout to draw, and its year's generation (kWh), each panel by the light it keeps. */
  layout: RoofLayout | null; kwhYear: number;
  /** Pieces to draw, each with whether it is (so far) in the sun, and its level (levelOf; 0 not yet measured). */
  pieces: RoofPiece[]; sunny: boolean[]; levels: number[];
  /** Once done: the candidate roof at each level, m² (index 1 to 4; 0 unused). */
  levelM2: number[];
  /** The roof's blocks once found, and each one's sun once measured (the same blocks for the same building). */
  roofBlocks: RoofBlock[] | null; blockSun: BlockSun[] | null;
}

/** Roofs found, by the parts they were found for. */
const roofsFound = new WeakMap<Massing[], RoofResult>();

export function useSolarCheck(parts: Massing[] | null, city: Massing[], year: number): SolarCheck | null {
  // the roof, found in a worker; kept with the parts it was found for
  const [found, setFound] = useState<{ parts: Massing[] | null; roof: RoofResult | null }>({ parts: null, roof: null });
  useEffect(() => {
    if (!parts || !parts.length) return;
    // found once for the parts: two checks of the same building (two cities) share it, blocks and all
    const known = roofsFound.get(parts);
    if (known) { queueMicrotask(() => setFound({ parts, roof: known })); return; }
    let stop = false;
    roofOffThread(parts, { blockM: BLOCK_M }, () => stop).then((roof) => {
      if (!roof) return;
      roofsFound.set(parts, roof);
      if (!stop) setFound({ parts, roof });
    });
    return () => { stop = true; };
  }, [parts]);
  const roof = found.parts === parts ? found.roof : null;

  // the shade, kept with the roof, city and year it was measured for
  type Shares = { roof: RoofResult | null; city: Massing[] | null; year: number; values: BlockSun[] | null; progress: number };
  const [shares, setShares] = useState<Shares>({ roof: null, city: null, year: 0, values: null, progress: 0 });
  // finished results for this roof, by city and year
  const kept = useRef<{ roof: RoofResult | null; byCity: WeakMap<Massing[], Map<number, BlockSun[]>> }>({ roof: null, byCity: new WeakMap() });
  useEffect(() => {
    if (!roof || !roof.blocks) return;
    if (kept.current.roof !== roof) kept.current = { roof, byCity: new WeakMap() };
    const known = kept.current.byCity.get(city)?.get(year);
    if (known) {
      // already measured: shown straight away (a microtask, so not a state change inside the effect itself)
      queueMicrotask(() => setShares({ roof, city, year, values: known, progress: 1 }));
      return;
    }
    let stop = false;
    shadeBlocksOffThread(roof.blocks, city, year, roof.grid ? pairFacing(roof.grid) : 90,
      (progress) => { if (!stop) setShares({ roof, city, year, values: null, progress }); },
      () => stop,
    ).then((values) => {
      if (!values) return;
      const byYear = kept.current.byCity.get(city) ?? new Map<number, BlockSun[]>();
      byYear.set(year, values); if (kept.current.roof === roof) kept.current.byCity.set(city, byYear);
      if (!stop) setShares({ roof, city, year, values, progress: 1 });
    });
    return () => { stop = true; };
  }, [roof, city, year]);
  const current = shares.roof === roof && shares.city === city && shares.year === year ? shares : null;
  const values = current?.values ?? null;

  /*
   * Which pieces are in the sun changes once, when the measuring ends, not with every step of the
   * progress: kept apart so the roof's drawing (SolarRoof) is rebuilt only then.
   */
  const lit = useMemo(() => {
    if (!roof || !roof.blocks) return null;
    const blockSunny = values ? values.map((v) => v.shaded <= SHADE_LIMIT) : null;
    const blockLevel = values ? values.map(levelOf) : null;
    const layout = values && roof.grid && parts?.length ? layOut(roof.grid, values, parts, 'light') : null;
    const rule = values && roof.grid && parts?.length ? layOut(roof.grid, values, parts, 'rule') : null;
    let shadedM2 = 0;
    const levelM2 = [0, 0, 0, 0, 0];
    if (blockSunny && blockLevel) roof.blocks.forEach((b, i) => { if (!blockSunny[i]) shadedM2 += b.areaM2; levelM2[blockLevel[i]] += b.areaM2; });
    return {
      shadedM2, levelM2,
      layout, panelsByRule: rule?.panels ?? 0,
      sunny: roof.pieces.map((p) => (blockSunny && p.block !== undefined ? blockSunny[p.block] : true)),
      levels: roof.pieces.map((p) => (blockLevel && p.block !== undefined ? blockLevel[p.block] : 0)),
    };
  }, [roof, values, parts]);

  const progress = current?.progress ?? 0;
  return useMemo(() => {
    if (!parts || !parts.length) return null;
    if (!roof || !lit) {
      return { finding: true, roofM2: 0, candidateM2: 0, progress: 0, done: false, shadedM2: 0, sunnyM2: 0, panels: 0, panelsByRule: 0, layout: null, kwhYear: 0, pieces: [], sunny: [], levels: [], levelM2: [0, 0, 0, 0, 0], roofBlocks: null, blockSun: null };
    }
    return {
      finding: false,
      roofM2: roof.openM2, candidateM2: roof.areaM2,
      progress, done: !!values,
      shadedM2: lit.shadedM2, sunnyM2: values ? roof.areaM2 - lit.shadedM2 : roof.areaM2,
      panels: lit.layout?.panels ?? 0, panelsByRule: lit.panelsByRule, layout: lit.layout,
      // PVGIS's yield is for pairs facing due east and west; turned with the building, scaled by the light on them
      kwhYear: lit.layout && roof.grid
        ? (lit.layout.lightSum * PANEL_W * KWH_PER_KW * (yearLight(year, pairFacing(roof.grid)) / yearLight(year, 90))) / 1000
        : 0,
      pieces: roof.pieces, sunny: lit.sunny, levels: lit.levels, levelM2: lit.levelM2,
      roofBlocks: roof.blocks ?? null, blockSun: values,
    };
  }, [parts, roof, lit, values, progress, year]);
}
