/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE PLACE CARD SAYS ABOUT A BUILDING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The card that opens beside a chosen building (PlaceCard) carries a line
 * saying what it is, and up to three figures. These functions decide them
 * from the records, and claim nothing the records do not hold: a figure the
 * record lacks is left out rather than shown as a dash, because an empty
 * cell beside full ones reads as a number that failed to load.
 */

import type { Development, LandUse } from '../data/model';
import type { BuildingDetail } from '../data/useBuildingDetail';

/** One figure on the card: the number, and what it counts. */
export interface Figure {
  value: string;
  label: string;
}

export interface PlaceFacts {
  /** The stage, or "Existing building" — always written, never colour alone. */
  kind: string;
  /** What it is for, when that is recorded: "Office + Retail", "Mainly office". */
  use: string | null;
  /** At most three. */
  figures: Figure[];
}

const STAGE: Record<string, string> = {
  APPROVED: 'Approved',
  APPLIED: 'Applied for',
  'UNDER CONSTRUCTION': 'Under construction',
};

/**
 * Area uses and counted uses, told apart by their unit.
 *
 * They are read differently: 7,743 m² of office is a floor area, and 72
 * bike spaces is a count. The test is the unit, not the name, because the
 * vocabulary of use types comes from the planning records.
 */
export function splitUses(development: Pick<Development, 'landUses'>): {
  area: LandUse[];
  counted: LandUse[];
} {
  // The records write it "sq.m"; "m2", "m²" and "sqm" are allowed for too.
  const area = development.landUses.filter((use) => /m2|m²|sq\.?\s*m/i.test(use.unit ?? ''));
  const counted = development.landUses
    .filter((use) => !area.includes(use))
    .sort((a, b) => b.quantity - a.quantity);
  return { area, counted };
}

/**
 * An approved or under-construction project: its height, its storeys once
 * the details record has answered, and its largest use — a floor area if it
 * has one, otherwise the largest count.
 */
export function developmentFacts(
  development: Pick<Development, 'status' | 'parts' | 'landUses'>,
  storeys?: number,
): PlaceFacts {
  const tallest = development.parts.reduce((a, b) => (a.heightM > b.heightM ? a : b));
  const figures: Figure[] = [{ value: `${tallest.heightM.toFixed(0)} m`, label: 'Height' }];
  if (storeys && Number.isFinite(storeys)) {
    figures.push({ value: String(storeys), label: 'Storeys' });
  }
  const { area, counted } = splitUses(development);
  const largestArea = [...area].sort((a, b) => b.quantity - a.quantity)[0];
  if (largestArea) {
    figures.push({ value: `${largestArea.quantity.toLocaleString('en-AU')} m²`, label: largestArea.useType });
  } else if (counted[0]) {
    figures.push({ value: counted[0].quantity.toLocaleString('en-AU'), label: counted[0].useType });
  }

  const uses = development.landUses
    .map((use) => use.useType)
    .filter((use, i, all) => all.indexOf(use) === i);
  return {
    kind: STAGE[development.status] ?? 'Approved',
    use: uses.length > 0 ? uses.slice(0, 2).join(' + ') : null,
    figures: figures.slice(0, 3),
  };
}

/**
 * A building that stands today: its height (from the model, always known),
 * its storeys and the year it was built — or refurbished, when that is all
 * the record has — when the property record holds them.
 */
export function buildingFacts(heightM: number, detail: BuildingDetail | null): PlaceFacts {
  const figures: Figure[] = [{ value: `${heightM.toFixed(0)} m`, label: 'Height' }];
  if (detail?.floorsAboveGround) {
    figures.push({ value: String(detail.floorsAboveGround), label: 'Storeys' });
  }
  if (detail?.constructionYear) {
    figures.push({ value: String(detail.constructionYear), label: 'Built' });
  } else if (detail?.refurbishedYear) {
    figures.push({ value: String(detail.refurbishedYear), label: 'Refurbished' });
  }
  return {
    kind: 'Existing building',
    use: detail?.predominantUse ? `Mainly ${detail.predominantUse.toLowerCase()}` : null,
    figures,
  };
}
