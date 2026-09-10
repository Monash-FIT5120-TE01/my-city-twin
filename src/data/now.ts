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
import { clampMinutes, EARLIEST_MINUTES, LATEST_MINUTES } from './urlState';

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
  const minutes = clampMinutes(clockMinutes, clockMinutes);
  return { date, minutes, clockMinutes, clamped: minutes !== clockMinutes };
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
