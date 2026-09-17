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
/** What a wall clock in `timeZone` reads at `instant`. */
function zonedParts(timeZone: string, instant: Date) {
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
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Intl renders midnight as hour 24 in some engines.
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function zoneOffsetMs(timeZone: string, instant: Date): number {
  const { year, month, day, hour, minute, second } = zonedParts(timeZone, instant);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
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

/**
 * What the clock in `timeZone` reads at an instant, as the simulation states
 * time: a civil date plus minutes since its midnight.
 *
 * WHOSE CLOCK, AND WHY IT IS NOT THE READER'S
 *   "Now" is a single instant, and the sun is doing one thing over Melbourne
 *   at it. That instant comes from the reader's device — every device knows
 *   the instant correctly, wherever it is — but it is then read off a
 *   MELBOURNE clock, not theirs.
 *
 *   Taking the reader's civil reading instead would put the sun at 3 p.m.
 *   Melbourne because it happened to be 3 p.m. in Tokyo, which is a different
 *   moment and a different sun. For a reader in Melbourne the two agree and
 *   the distinction costs nothing; for anyone else, including whoever marks
 *   this, only one of them is true.
 *
 * The instant is a parameter rather than read from the clock inside, so the
 * daylight-saving cases can be tested at fixed moments instead of whenever
 * the suite happens to run.
 */
export function civilInZone(
  timeZone: string,
  instant: Date,
): { date: SimulationDate; minutes: number } {
  const { year, month, day, hour, minute } = zonedParts(timeZone, instant);
  return { date: { year, month, day }, minutes: hour * 60 + minute };
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

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "21 December" — the year is carried by the date control, not repeated here. */
export function dateLabel({ month, day }: SimulationDate): string {
  return `${day} ${MONTH_NAMES[month - 1] ?? ''}`;
}

/** "2026-12-21", the value an <input type="date"> wants. */
export function toDateInput({ year, month, day }: SimulationDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * How many days the given month has, February included.
 *
 * Day zero of the NEXT month is the last day of this one — the same UTC date
 * arithmetic monthGrid and shiftDay use, rather than a second copy of the
 * calendar written out as a table and a leap-year rule. One mechanism for
 * calendar facts in this file means one place for them to be wrong.
 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Parses what a date input gives back.
 *
 * Deliberately not `new Date(value)`: that reads a bare "2026-12-21" as UTC
 * midnight, and rendering it in a zone behind UTC hands back the day before.
 * The three numbers are all that is wanted, so they are taken literally.
 *
 * THE DAY IS CHECKED AGAINST ITS OWN MONTH, not against 31.
 *   The address bar is an input like any other, and a date that got as far
 *   as here is one the interface will print. Accepting "2026-02-31" put
 *   "31 February" on screen while civilToInstant quietly rolled it forward
 *   to 3 March — so the label and the sun disagreed, and the label was the
 *   one a reader could see. Rejecting it falls back to the opening date,
 *   which is a day that exists.
 */
export function fromDateInput(value: string): SimulationDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Which preset, if any, this date is. */
/**
 * Which season button, if any, the date on screen belongs to.
 *
 * BY MONTH, NOT BY EXACT DAY.
 *   The buttons used to set the 21st and this used to require it, so a
 *   reader who stepped one day off a solstice saw every button go unselected
 *   — the control claimed none of the four was showing while one of them
 *   plainly was. Now the buttons keep the day they were given, so the month
 *   is the whole of what they change and the whole of what identifies them.
 */
export function matchingSeason(date: SimulationDate): SeasonPreset | null {
  return SEASONS.find((s) => s.month === date.month) ?? null;
}

/**
 * The same day of the month, in another month — with the day pulled back if
 * that month is too short for it.
 *
 * The 31st of a 31-day month has no counterpart in a 30-day one, and a date
 * built from it silently becomes the 1st of the month after. Clamping keeps
 * the answer inside the month that was asked for.
 */
export function sameDayInMonth(
  date: SimulationDate,
  month: number,
): SimulationDate {
  const lastOfMonth = new Date(Date.UTC(date.year, month, 0)).getUTCDate();
  return { year: date.year, month, day: Math.min(date.day, lastOfMonth) };
}

/**
 * The four months the sunlight panel offers, a quarter of a year apart.
 *
 * WHAT THE `day` IS STILL FOR
 *   Only DEFAULT_DATE, and the tests. The buttons no longer use it: pressing
 *   one keeps whatever day is on screen and changes the month, so comparing
 *   summer with winter compares the SAME DATE in two seasons rather than
 *   jumping to a solstice.
 *
 *   That was the previous behaviour and it read as a bug: every press
 *   produced the 21st of something, which looks like a default that got
 *   stuck. The four days it produced were the solstices and the equinoxes —
 *   real, but never said anywhere, and not what somebody looking at their
 *   own date wants to be moved off.
 *
 *   The cost is about a fifth of a degree of solar declination between the
 *   17th and the 21st of December, which is smaller than the ten-minute
 *   sampling step this model already rounds to.
 */
export const SEASONS: SeasonPreset[] = [
  { key: 'summer', label: 'Summer', month: 12, day: 21 },
  { key: 'autumn', label: 'Autumn', month: 3, day: 21 },
  { key: 'winter', label: 'Winter', month: 6, day: 21 },
  { key: 'spring', label: 'Spring', month: 9, day: 21 },
];

/**
 * When the sun is above the horizon on a given day, in minutes since
 * midnight, local civil time.
 *
 * WHY THE TIME BAR WANTS THIS
 *   The bar runs from 06:00 to 20:00 because those are the hours the model
 *   covers — not because the sun does anything at either end. Drawn as a
 *   plain track it says the day is a featureless fourteen hours, and the
 *   reader dragging through it has no idea they have just passed sunset
 *   until the shadows vanish.
 *
 *   With the two crossings marked, the track becomes a small diagram of the
 *   day: this is when it gets light, this is when it stops. On 21 June in
 *   Melbourne that band is four and a half hours shorter than on 21
 *   December, and seeing that is most of the point of a seasonal control.
 *
 * HOW IT IS FOUND
 *   By sampling, then bisecting. The altitude is a smooth function crossing
 *   zero twice a day, so a coarse scan finds the two brackets and eight
 *   halvings pin each to under a minute — which is finer than the ten-minute
 *   step the control moves in.
 *
 *   Null when the sun does not cross within the window at all. Melbourne
 *   never sees that, but a rule that only holds for one latitude is a rule
 *   waiting to be broken by a change of site.
 */
export function daylightWindow(
  date: SimulationDate,
  fromMinutes: number,
  toMinutes: number,
  /*
   * The zone and the place, handed in separately because they are separate
   * facts — SiteLocation is a point on the globe and carries no clock. Every
   * other caller of civilToInstant passes them apart for the same reason.
   */
  timeZone: string,
  site: SiteLocation,
): { rise: number | null; set: number | null } {
  const altitudeAt = (minutes: number) =>
    solarPosition(
      civilToInstant(timeZone, date.year, date.month, date.day, 0, minutes),
      site,
    ).altitudeDeg;

  /** The minute where the altitude crosses zero between two samples. */
  const crossing = (low: number, high: number): number => {
    let a = low;
    let b = high;
    for (let i = 0; i < 8; i++) {
      const mid = (a + b) / 2;
      if (altitudeAt(a) < 0 === altitudeAt(mid) < 0) a = mid;
      else b = mid;
    }
    return Math.round((a + b) / 2);
  };

  const STEP = 20;
  let rise: number | null = null;
  let set: number | null = null;
  let previous = altitudeAt(fromMinutes);

  for (let at = fromMinutes + STEP; at <= toMinutes; at += STEP) {
    const here = altitudeAt(at);
    if (previous < 0 && here >= 0 && rise === null) rise = crossing(at - STEP, at);
    if (previous >= 0 && here < 0 && set === null) set = crossing(at - STEP, at);
    previous = here;
  }

  return { rise, set };
}

/**
 * The weeks of one month, as a grid, including the days either side of it
 * that share a week with it.
 *
 * WHY THE NEIGHBOURING DAYS ARE IN IT AND NOT BLANKS
 *   A calendar that leaves the first row half empty makes the reader count
 *   columns to find where the month starts. Showing the tail of the previous
 *   month keeps every row full and every column under its own weekday, and
 *   the days that are not this month's are drawn faintly and say so.
 *
 * WHY THE WEEK STARTS ON MONDAY
 *   It is what the calendar in the city this models uses. It also puts the
 *   two weekend days together at the end, which matters for a tool about
 *   sunlight on public space: "is it sunny there on a Saturday" is a
 *   question people actually have, and a grid that splits the weekend across
 *   both edges makes it one nobody can answer at a glance.
 *
 * Always six rows. A month needs five or six depending on where it starts,
 * and a grid that changes height as you page through it moves everything
 * under it — including the button you are pressing to page with.
 */
export interface GridDay {
  date: SimulationDate;
  /** False for the days of the months either side. */
  inMonth: boolean;
}

export function monthGrid(year: number, month: number): GridDay[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay is 0 for Sunday; shift so Monday is 0.
  const lead = (first.getUTCDay() + 6) % 7;

  const weeks: GridDay[][] = [];
  for (let week = 0; week < 6; week++) {
    const row: GridDay[] = [];
    for (let column = 0; column < 7; column++) {
      const offset = week * 7 + column - lead;
      const at = new Date(Date.UTC(year, month - 1, 1 + offset));
      row.push({
        date: {
          year: at.getUTCFullYear(),
          month: at.getUTCMonth() + 1,
          day: at.getUTCDate(),
        },
        inMonth: at.getUTCMonth() + 1 === month && at.getUTCFullYear() === year,
      });
    }
    weeks.push(row);
  }
  return weeks;
}

/** Whether two civil dates are the same day. */
export function sameDay(a: SimulationDate, b: SimulationDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * The day before or after, carried across months and years.
 *
 * WHY IT GOES THROUGH Date AND NOT ARITHMETIC
 *   Adding one to `day` is right about 96% of the time, and the other 4% is
 *   month ends, February, and leap years — three rules nobody gets right by
 *   hand and none of which this file should be in the business of knowing.
 *
 *   UTC, not local: these are civil dates with no time in them, and a local
 *   constructor near midnight in a zone behind UTC lands on the day before.
 */
export function shiftDay({ year, month, day }: SimulationDate, by: number): SimulationDate {
  const at = new Date(Date.UTC(year, month - 1, day));
  at.setUTCDate(at.getUTCDate() + by);
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth() + 1,
    day: at.getUTCDate(),
  };
}

/** The date the simulation opens on. */
export const DEFAULT_DATE: SimulationDate = { year: 2026, month: 12, day: 21 };
