/*
 * "Now", as the simulation can state it.
 *
 * The sunlight screen asks for a date and a time and shows where the sun is.
 * This turns the present moment into that pair, so a reader can start from
 * what is happening outside rather than from a solstice they have to imagine.
 *
 * TWO THINGS IT HAS TO BE HONEST ABOUT
 *
 *   Whose clock. The instant comes from the reader's device and is then read
 *   off a Melbourne clock — see civilInZone, which is where that argument is
 *   made. A reader in Melbourne notices no difference; anyone else would
 *   otherwise be shown a sun that is not the one over the city.
 *
 *   The time control stops at 06:00 and 20:00, and Melbourne spends a large
 *   part of the year outside that. Half past eleven at night is not 20:00,
 *   and quietly showing 20:00 would be the app stating something false about
 *   the sun on a screen whose whole purpose is to be trusted about the sun.
 *   So the clock reading is returned alongside the clamped one, and the
 *   caller is expected to say so.
 */

import { SITE } from '../scene/frame';
import { civilInZone, type SimulationDate } from '../scene/solar';

/**
 * The window the time control can express, in minutes since midnight.
 *
 * Lives here rather than with the URL state because "now" is the thing that
 * keeps running into it: Melbourne spends a large part of the year outside
 * these hours, and this file is where that is reckoned with.
 */
export const EARLIEST_MINUTES = 6 * 60;
export const LATEST_MINUTES = 20 * 60;

/**
 * Into the window, without rounding.
 *
 * Kept apart from the snapping below because the two answer different
 * questions, and conflating them told the reader a lie: 15:03 snaps to 15:00,
 * which is not "outside the hours this simulation covers", but a single
 * "did it move?" flag could not tell the two apart and said it anyway.
 */
export function intoWindow(minutes: number): number {
  return Math.min(LATEST_MINUTES, Math.max(EARLIEST_MINUTES, minutes));
}

export function clampMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  // Snap to the slider's own step so a hand-edited URL cannot land between
  // two positions and make the control look broken.
  return intoWindow(Math.round(value / 10) * 10);
}

export interface PresentMoment {
  date: SimulationDate;
  /** What the time control will be set to. */
  minutes: number;
  /** What the Melbourne clock actually reads, before the control's limits. */
  clockMinutes: number;
  /** Whether those two differ — the clock is outside what can be shown. */
  clamped: boolean;
}

/**
 * The present moment in Melbourne, as a simulation date and time.
 *
 * The instant is a parameter so the awkward moments — either side of a
 * daylight-saving change, the middle of the night — can be tested at fixed
 * points rather than whenever the suite happens to run.
 */
export function presentMoment(instant: Date): PresentMoment {
  const { date, minutes: clockMinutes } = civilInZone(SITE.timeZone, instant);
  /*
   * `clamped` reports the window ONLY — not the ten-minute snap the slider
   * also applies. Reported together, every clock reading that was not a
   * multiple of ten minutes claimed to be outside the hours on offer, which
   * since the app started opening on the present moment meant most visits
   * began with a sentence that was not true.
   */
  const held = intoWindow(clockMinutes);
  return {
    date,
    minutes: clampMinutes(clockMinutes, clockMinutes),
    clockMinutes,
    clamped: held !== clockMinutes,
  };
}

/** "23:31" — the Melbourne clock, for saying what could not be shown. */
export function clockLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * What to tell the reader, or nothing when the moment shows as it is.
 *
 * Worded around the control rather than around the sun: this file knows the
 * clock is past 20:00, and does not know whether the sun had set — in June it
 * would have been down for hours by 20:00, in January it would still be up.
 */
export function outsideWindowNote(moment: PresentMoment): string | null {
  if (!moment.clamped) return null;
  const edge = moment.clockMinutes < EARLIEST_MINUTES ? EARLIEST_MINUTES : LATEST_MINUTES;
  return `It is ${clockLabel(moment.clockMinutes)} in Melbourne — outside the hours this
    simulation covers. Showing ${clockLabel(edge)}.`.replace(/\s+/g, ' ');
}
