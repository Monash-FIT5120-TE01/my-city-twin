/*
 * The street activity's times and numbers in words, on a Melbourne clock
 * whatever the reader's own (see civilInZone for why).
 */
import { SITE } from '../scene/frame';
import { melbourneClock } from '../data/streetActivity';
import type { SimulationDate } from '../scene/solar';
import { formatNumber, getLocale, t } from '../i18n/i18n';
import { dayMonthLabel, weekdayNames } from '../i18n/format';

const DAY = new Intl.DateTimeFormat('en-AU', {
  timeZone: SITE.timeZone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** The weekday of a date, Monday to Sunday, in the language chosen (format.ts's names). */
function weekdayOf({ year, month, day }: SimulationDate): string {
  const sunday0 = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekdayNames()[(sunday0 + 6) % 7].name;
}

/** "Wed, 14 Oct". In another language, its own weekday and date (format.ts), still on Melbourne's clock. */
export function dayLabel(at: number): string {
  if (getLocale() !== 'en') {
    const { date } = melbourneClock(at);
    return t('activity.format.day', { weekday: weekdayOf(date), date: dayMonthLabel(date) });
  }
  // en-AU writes "Wed 14 Oct"; the design has the comma after the day.
  return DAY.format(new Date(at)).replace(/^(\w+),? /, '$1, ');
}

const CHIP = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });

/** "Fri 16": a day's button in the time bar, short enough for a row of eight or nine. */
export function dayChipLabel(date: SimulationDate): string {
  if (getLocale() !== 'en') return t('activity.format.dayChip', { weekday: weekdayOf(date), day: formatNumber(date.day) });
  return CHIP.format(new Date(Date.UTC(date.year, date.month - 1, date.day, 12))).replace(',', '');
}

/** The same, for a date rather than an instant: midday, safely inside it. */
export function dateLabelOf({ year, month, day }: SimulationDate): string {
  return dayLabel(Date.UTC(year, month - 1, day, 2));
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * "07:00" — and "02:00 (GMT+11)" for each of the two 02:00s on the night
 * daylight saving ends, so the weather card, the details, the day's bars
 * and the rail never show two different hours as the same one.
 */
export function hourLabel(at: number): string {
  const hour = melbourneClock(at).hour;
  const plain = `${String(hour).padStart(2, '0')}:00`;
  const twice = melbourneClock(at - HOUR_MS).hour === hour || melbourneClock(at + HOUR_MS).hour === hour;
  return twice ? `${plain} (${offsetLabel(at)})` : plain;
}

/** "Wed, 14 Oct · 07:00". */
export function whenLabel(at: number): string {
  return `${dayLabel(at)} · ${hourLabel(at)}`;
}

/** "2,861". Counts arrive as decimals ("143.5") from the forecast; people are whole. */
export function countLabel(count: number): string {
  return formatNumber(Math.round(count));
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
