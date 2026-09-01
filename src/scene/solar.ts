import { Body, Equator, Horizon, Observer } from 'astronomy-engine';
import type { SunAngles } from './sun';

/*
 * Where the sun is, for a place and an instant.
 *
 * The output convention is fixed by
 * sunlight-twin/contracts/golden/solar_positions.json, which this module is
 * tested against: geometric altitude with NO atmospheric refraction, and
 * azimuth in degrees clockwise from north.
 *
 * Refraction is deliberately off. It lifts the apparent sun by roughly 0.06°
 * near the horizon, which would move a 200 m tower's shadow by metres — but
 * the golden vectors are geometric, and matching them is what proves the rest
 * of the pipeline. Refraction would be a separate, declared adjustment.
 */

export interface SiteLocation {
  lat: number;
  lon: number;
  elevationM: number;
}

export function solarPosition(instant: Date, site: SiteLocation): SunAngles {
  const observer = new Observer(site.lat, site.lon, site.elevationM);
  // `ofdate` equatorial coordinates are what Horizon expects; aberration on.
  const equatorial = Equator(Body.Sun, instant, observer, true, true);
  // Omitting the refraction argument is what asks for a geometric altitude;
  // 'normal' and 'jplhor' are the only values that bend the light. Passing it
  // explicitly rather than dropping the argument keeps the intent visible.
  const horizontal = Horizon(instant, observer, equatorial.ra, equatorial.dec, undefined);
  return {
    altitudeDeg: horizontal.altitude,
    azimuthDeg: horizontal.azimuth,
  };
}

/**
 * Offset of a named zone at a given instant, in milliseconds.
 *
 * Derived from Intl rather than assumed, because Victoria observes daylight
 * saving: the same clock reading is UTC+10 in June and UTC+11 in December,
 * and hard-coding either one silently moves every shadow by an hour for half
 * the year.
 */
function zoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Intl renders midnight as hour 24 in some engines.
  const hour = get('hour') % 24;

  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

/**
 * The instant at which a wall clock in `timeZone` reads the given civil time.
 *
 * Two passes: guess that the reading is UTC, look up the offset near that
 * guess, then re-check at the corrected instant. The second pass is what
 * makes the hours either side of a daylight-saving transition come out right.
 */
export function civilToInstant(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - zoneOffsetMs(timeZone, new Date(guess));
  const second = guess - zoneOffsetMs(timeZone, new Date(first));
  return new Date(second);
}

/** Any date the simulation can be run for. */
export interface SimulationDate {
  year: number;
  month: number;
  day: number;
}

export interface SeasonPreset {
  key: 'summer' | 'autumn' | 'winter' | 'spring';
  label: string;
  month: number;
  day: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "21 December" — the year is carried by the date control, not repeated here. */
export function dateLabel({ month, day }: SimulationDate): string {
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}

/** "2026-12-21", the value an <input type="date"> wants. */
export function toDateInput({ year, month, day }: SimulationDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parses what a date input gives back.
 *
 * Deliberately not `new Date(value)`: that reads a bare "2026-12-21" as UTC
 * midnight, and rendering it in a zone behind UTC hands back the day before.
 * The three numbers are all that is wanted, so they are taken literally.
 */
export function fromDateInput(value: string): SimulationDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Which preset, if any, this date is. */
export function matchingSeason(date: SimulationDate): SeasonPreset | null {
  return SEASONS.find((s) => s.month === date.month && s.day === date.day) ?? null;
}

/**
 * The four dates the sunlight panel offers. Solstices and equinoxes, because
 * they bound the year: nothing casts a longer shadow than 21 June, and
 * nothing casts a shorter one than 21 December.
 */
export const SEASONS: SeasonPreset[] = [
  { key: 'summer', label: 'Summer', month: 12, day: 21 },
  { key: 'autumn', label: 'Autumn', month: 3, day: 21 },
  { key: 'winter', label: 'Winter', month: 6, day: 21 },
  { key: 'spring', label: 'Spring', month: 9, day: 21 },
];

/** The date the simulation opens on. */
export const DEFAULT_DATE: SimulationDate = { year: 2026, month: 12, day: 21 };
