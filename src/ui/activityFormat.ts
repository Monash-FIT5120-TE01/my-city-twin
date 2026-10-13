/*
 * The street activity's times and numbers in words, on a Melbourne clock
 * whatever the reader's own (see civilInZone for why).
 */
import { SITE } from '../scene/frame';
import { melbourneClock } from '../data/streetActivity';
import type { SimulationDate } from '../scene/solar';

const DAY = new Intl.DateTimeFormat('en-AU', {
  timeZone: SITE.timeZone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** "Wed, 14 Oct". */
export function dayLabel(at: number): string {
  // en-AU writes "Wed 14 Oct"; the design has the comma after the day.
  return DAY.format(new Date(at)).replace(/^(\w+),? /, '$1, ');
}

/** The same, for a date rather than an instant: midday, safely inside it. */
export function dateLabelOf({ year, month, day }: SimulationDate): string {
  return dayLabel(Date.UTC(year, month - 1, day, 2));
}

/** "07:00". */
export function hourLabel(at: number): string {
  return `${String(melbourneClock(at).hour).padStart(2, '0')}:00`;
}

/** "Wed, 14 Oct · 07:00". */
export function whenLabel(at: number): string {
  return `${dayLabel(at)} · ${hourLabel(at)}`;
}

/** "2,861". Counts arrive as decimals ("143.5") from the forecast; people are whole. */
export function countLabel(count: number): string {
  return Math.round(count).toLocaleString('en-AU');
}

/** "2026-10-14": a date as a key and an <option> value. */
export function dateKey({ year, month, day }: SimulationDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const OFFSET = new Intl.DateTimeFormat('en-AU', { timeZone: SITE.timeZone, timeZoneName: 'shortOffset' });

/**
 * "GMT+11". Said only where one clock hour happens twice — 02:00 on the
 * night daylight saving ends — so the two can be told apart.
 */
export function offsetLabel(at: number): string {
  return OFFSET.formatToParts(new Date(at)).find((p) => p.type === 'timeZoneName')?.value ?? '';
}
