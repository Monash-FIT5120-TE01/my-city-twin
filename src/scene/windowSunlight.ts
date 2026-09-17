/*
 * ─────────────────────────────────────────────────────────────────────────
 * A DAY OF SUN AT ONE WINDOW
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The day loop for a window, as opposed to sunlightAt.ts, which is the day
 *   loop for a spot on the ground. They ask different questions and must not
 *   be confused for one another.
 *
 * HOW IT DIFFERS FROM THE GROUND MEASUREMENT
 *   The ground measurement asks "what does THIS ONE PROPOSAL take from this
 *   spot", and tests the sun against that proposal alone. Everything already
 *   standing is ignored, which is fine for that question: the reader is
 *   comparing a street with and without a development.
 *
 *   A resident is not asking that. They are asking what reaches their window,
 *   and most of what does not reach it is the city that is already there. So
 *   this one tests against a SKYLINE — see skyline.ts — which is every
 *   building at once, and the proposal is an optional second skyline on top.
 *
 * WHAT THE NUMBERS MEAN, WHICH IS THE PART THAT MATTERS
 *   Three figures, and they are named for exactly what they are, because
 *   this interface has already once called a with-and-without figure "total
 *   daylight" and been wrong in a way nobody caught by reading the code.
 *
 *     sunAtWindowMin      the sun this window gets, the city as it stands
 *     sunWithProposalMin  the same, once the approved projects are built
 *                         AND the buildings they replace are taken down
 *     lostToProposalMin   the difference, which can fall either way
 *
 *   None of them is "daylight". A window in shade on an overcast day still
 *   has daylight; what is counted here is DIRECT sun, geometry only. No
 *   cloud, no reflection off the tower opposite, no curtains.
 */

import { civilToInstant, solarPosition, type SimulationDate } from './solar';
import { SITE } from './frame';
import { sunReaches, type Skyline } from './skyline';
import type { WindowPlace } from './facades';

/*
 * The same ten minutes the ground measurement uses, and the same reason: it
 * is fine enough that a sliver of sun between two towers is usually caught,
 * and coarse enough that a day is 85 samples rather than 840.
 *
 * Kept here rather than imported so the two can diverge if one of them ever
 * needs to, but they should be read together — a reader comparing a window
 * figure with a ground figure is entitled to assume they were sampled alike.
 */
export const WINDOW_STEP_MINUTES = 10;

/** Dawn to dusk at the latitude, with room to spare either side. */
const DAY_START_MIN = 3 * 60;
const DAY_END_MIN = 22 * 60;

/**
 * One day of sun at one window, in minutes, plus the words to describe it.
 *
 * Every figure counts DIRECT sun and nothing else: geometry against the sun's
 * position, sampled every stepMinutes. No cloud, no light bouncing off the
 * tower opposite, no curtains. A window with none of this still has daylight.
 */
export interface WindowSunlight {
  /** Minutes of direct sun at this window, with the city as it stands. */
  sunAtWindowMin: number;
  /**
   * Minutes the sun is above the horizon at all, on this date.
   *
   * The figure above means very little without it. "Four hours of sun" is
   * most of a midwinter day and a third of a midsummer one, and a reader
   * cannot tell which without being told how long the sun was up — so the
   * interface can say what the whole city, and the season, cost them.
   *
   * It is NOT "daylight": it is the time the sun is over the horizon.
   * Daylight starts before sunrise and outlasts sunset, and counting it
   * would overstate this by the best part of an hour.
   */
  sunUpMin: number;
  /** The same once the proposal is built. Null when no proposal is shown. */
  sunWithProposalMin: number | null;
  /**
   * The DIFFERENCE the proposals make, in minutes. Null when none is shown.
   *
   * Positive is sun lost, and negative is sun gained — which is not a
   * curiosity. The approved scenario takes down the buildings a proposal is
   * built on, so replacing something tall with something shorter genuinely
   * hands this window sun it does not have today. Anything reading this has
   * to look at the sign; "less" is not always the right word.
   */
  lostToProposalMin: number | null;
  /**
   * First and last SAMPLE with sun, as "08:20". Null if there is none.
   *
   * These are two facts, NOT a range, and the interface must not join them
   * with a dash. A south-facing window in Melbourne in December is lit from
   * 06:00 and again until 20:30 with nothing in between, because the sun
   * rises south of east, swings north across the middle of the day and sets
   * south of west. "06:00-20:30" would be a fourteen-hour lie.
   */
  firstSunLabel: string | null;
  lastSunLabel: string | null;
  /** True when the sun left and came back — see the note above. */
  brokenByShade: boolean;
  /** So the interface can say what the figure is worth. */
  stepMinutes: number;
}

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Walks the day in ten-minute steps and counts what reaches the window.
 *
 * Both skylines are built by the caller and reused across dates — that is the
 * whole point of them, and rebuilding one here per call would throw the
 * saving away. `withProposal` is the skyline built from the city PLUS the
 * proposal; pass null when nothing is proposed, and the two comparison
 * figures come back null rather than zero. Zero would read as "this project
 * costs you nothing", which is a claim, not an absence.
 */
export function sunlightAtWindow(
  place: WindowPlace,
  cityAsItStands: Skyline,
  withProposal: Skyline | null,
  date: SimulationDate,
): WindowSunlight {
  let sunAtWindowMin = 0;
  let sunUpMin = 0;
  let sunWithProposalMin = 0;
  let firstSun: number | null = null;
  let lastSun: number | null = null;
  let gaps = 0;
  let wasLit = false;

  for (let minutes = DAY_START_MIN; minutes < DAY_END_MIN; minutes += WINDOW_STEP_MINUTES) {
    const sun = solarPosition(
      civilToInstant(
        SITE.timeZone,
        date.year,
        date.month,
        date.day,
        Math.floor(minutes / 60),
        minutes % 60,
      ),
      { lat: SITE.lat, lon: SITE.lon, elevationM: SITE.elevationM },
    );

    if (sun.altitudeDeg <= 0) continue;
    sunUpMin += WINDOW_STEP_MINUTES;

    const lit = sunReaches(cityAsItStands, sun, place.facingDeg);
    if (lit) {
      sunAtWindowMin += WINDOW_STEP_MINUTES;
      if (firstSun === null) firstSun = minutes;
      // A lit sample after a dark one, when it has been lit before, is the
      // sun coming back: the window's day has a hole in it.
      if (!wasLit && lastSun !== null) gaps++;
      lastSun = minutes;
    }
    wasLit = lit;

    if (withProposal && sunReaches(withProposal, sun, place.facingDeg)) {
      sunWithProposalMin += WINDOW_STEP_MINUTES;
    }
  }

  return {
    sunAtWindowMin,
    sunUpMin,
    sunWithProposalMin: withProposal ? sunWithProposalMin : null,
    lostToProposalMin: withProposal ? sunAtWindowMin - sunWithProposalMin : null,
    firstSunLabel: firstSun === null ? null : clock(firstSun),
    lastSunLabel: lastSun === null ? null : clock(lastSun),
    brokenByShade: gaps > 0,
    stepMinutes: WINDOW_STEP_MINUTES,
  };
}
