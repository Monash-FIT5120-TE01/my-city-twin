/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE AM I, AND WHERE AM I HEADING — IN THE STREET, IN THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY
 *   Walking the city in a headset, nobody could tell which street they were
 *   on (2026-10-10): the names on the desktop map are not drawn in VR, and
 *   the streets look alike. This answers three questions from the reader's
 *   position and the way their head points:
 *
 *     which street   — "Swanston Street", or "Near …" just off it
 *     which way      — "heading south"
 *     what is next   — the next street they will cross, and how far; and a
 *                      landmark straight ahead, if there is one
 *
 * FROM WHAT
 *   The grid in streets.ts — fitted, not surveyed, so a street's line can be
 *   a few metres from the drawn road — and the map's landmarks. Only the
 *   grid's named streets: lanes have no names here, and off the grid this
 *   gives the heading alone rather than a name it does not know.
 */

import { GRID_DIRECTIONS, gridStreets, type GridStreet } from './streets';
import type { Landmark } from './vrLandmarks';

/** On a street: within this of its centre line. Main streets are 30 m wide. */
const ON_M = 18;
/** "Near" a street, out to this. */
const NEAR_M = 60;
/** A crossing closer than this is the one being stood in, not the next. */
const NEXT_FROM_M = 12;
const NEXT_UP_TO_M = 500;
/** Walking at a shallower angle than this to a street never meets it in any useful sense. */
const MEETS_COS = 0.35;
/** A landmark is "ahead" within this many degrees of the heading, out to this far. */
const AHEAD_DEG = 22;
const AHEAD_UP_TO_M = 1500;

const WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const LETTERS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export interface Wayfinding {
  /** The street, or null off the grid. */
  street: string | null;
  /** True when on it; false when only near it. */
  onStreet: boolean;
  /** "south-east", and "SE" for the badge. */
  heading: string;
  headingLetters: string;
  next: { name: string; distanceM: number } | null;
  ahead: { name: string; distanceM: number } | null;
}

/** The direction a street runs, and the direction its offset is measured along. */
function linesOf(street: GridStreet) {
  const run = street.axis === 'long' ? GRID_DIRECTIONS.long : GRID_DIRECTIONS.cross;
  const across = street.axis === 'long' ? GRID_DIRECTIONS.cross : GRID_DIRECTIONS.long;
  return { run, across };
}

const dot = (a: readonly [number, number], b: readonly [number, number]) => a[0] * b[0] + a[1] * b[1];

/** Rounded as a person would say it: to 10 m (100 m past a kilometre), and never "0 m". */
export function roughMetres(metres: number): number {
  return metres < 1000 ? Math.max(10, Math.round(metres / 10) * 10) : Math.round(metres / 100) * 100;
}

/**
 * `en` east/north metres from the scene origin; `headingRad` a compass
 * heading, clockwise from north.
 */
export function wayfind(en: [number, number], headingRad: number, landmarks: readonly Landmark[]): Wayfinding {
  const sector = ((Math.round(headingRad / (Math.PI / 4)) % 8) + 8) % 8;
  const facing: [number, number] = [Math.sin(headingRad), Math.cos(headingRad)];
  const streets = gridStreets();

  // Which street: the nearest line, if the point is within its length. At a
  // crossing both are near; the one being walked along is the one the head follows.
  const placed = streets
    .map((street) => {
      const { run, across } = linesOf(street);
      const along = dot(en, run);
      const within = along >= street.fromM - ON_M && along <= street.toM + ON_M;
      return { street, off: Math.abs(dot(en, across) - street.offsetM), within, follows: Math.abs(dot(facing, run)) };
    })
    .filter((candidate) => candidate.within && candidate.off <= NEAR_M);
  const on = placed.filter((candidate) => candidate.off <= ON_M).sort((a, b) => b.follows - a.follows)[0];
  const near = on ?? [...placed].sort((a, b) => a.off - b.off)[0];

  // The next street crossed, walking the way the head points.
  let next: { name: string; distanceM: number } | null = null;
  for (const street of streets) {
    if (on && street === on.street) continue;
    const { run, across } = linesOf(street);
    const rate = dot(facing, across);
    if (Math.abs(rate) < MEETS_COS) continue;
    const t = (street.offsetM - dot(en, across)) / rate;
    if (t < NEXT_FROM_M || t > NEXT_UP_TO_M) continue;
    const along = dot([en[0] + facing[0] * t, en[1] + facing[1] * t], run);
    if (along < street.fromM || along > street.toM) continue;
    if (!next || t < next.distanceM) next = { name: street.name, distanceM: t };
  }

  // A landmark straight ahead: the one nearest the line of sight.
  let ahead: { name: string; distanceM: number; off: number } | null = null;
  for (const landmark of landmarks) {
    const de = landmark.en[0] - en[0];
    const dn = landmark.en[1] - en[1];
    const distanceM = Math.hypot(de, dn);
    if (distanceM < 1 || distanceM > AHEAD_UP_TO_M) continue;
    const bearing = Math.atan2(de, dn);
    const off = Math.abs(Math.atan2(Math.sin(bearing - headingRad), Math.cos(bearing - headingRad)));
    if (off > (AHEAD_DEG * Math.PI) / 180) continue;
    if (!ahead || off < ahead.off) ahead = { name: landmark.name, distanceM, off };
  }

  return {
    street: near ? near.street.name : null,
    onStreet: Boolean(on),
    heading: WORDS[sector],
    headingLetters: LETTERS[sector],
    next: next && { name: next.name, distanceM: roughMetres(next.distanceM) },
    ahead: ahead && { name: ahead.name, distanceM: roughMetres(ahead.distanceM) },
  };
}

/** The two lines the bar shows. */
export function wayfindingWords(w: Wayfinding): { main: string; sub: string } {
  const main = w.street ? `${w.onStreet ? '' : 'Near '}${w.street}, heading ${w.heading}` : `Heading ${w.heading}`;
  const parts = [w.next && `Next: ${w.next.name} in ${w.next.distanceM} m`, w.ahead && `${w.ahead.name} ahead`].filter(Boolean);
  return { main, sub: parts.length ? parts.join('  ·  ') : w.street ? '' : 'Off the street grid' };
}

/** Every crossing of two named streets that both run through it: where the corner signs stand. */
export function gridCrossings(): { en: [number, number]; long: string; cross: string }[] {
  const streets = gridStreets();
  const out: { en: [number, number]; long: string; cross: string }[] = [];
  for (const long of streets.filter((street) => street.axis === 'long')) {
    for (const cross of streets.filter((street) => street.axis === 'cross')) {
      // The point whose cross-axis coordinate is the long street's offset, and the other way round.
      const [ce, cn] = GRID_DIRECTIONS.cross;
      const [le, ln] = GRID_DIRECTIONS.long;
      const en: [number, number] = [ce * long.offsetM + le * cross.offsetM, cn * long.offsetM + ln * cross.offsetM];
      const alongLong = dot(en, GRID_DIRECTIONS.long);
      const alongCross = dot(en, GRID_DIRECTIONS.cross);
      if (alongLong < long.fromM || alongLong > long.toM || alongCross < cross.fromM || alongCross > cross.toM) continue;
      out.push({ en, long: long.name, cross: cross.name });
    }
  }
  return out;
}
