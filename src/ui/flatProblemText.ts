/*
 * Why the example flat cannot be stood in behind this side, on this floor — in words, for the sunlight
 * panel and the building card alike (ProjectDoc/studio-room/PLAN.md 3.7). One sentence each, saying what
 * is in the way rather than that something failed.
 */
import type { RoomProblem } from '../scene/room/roomPlacement';
import { getLocale, t } from '../i18n/i18n';
import { intlOf } from '../i18n/locales';
import type { MessageKey } from '../i18n/en';

const TEXT: Record<RoomProblem, MessageKey> = {
  'no-such-floor': 'flat.problemNoSuchFloor',
  'no-such-side': 'flat.problemNoSuchSide',
  'wall-too-short': 'flat.problemWallTooShort',
  'building-too-shallow': 'flat.problemBuildingTooShallow',
  'window-moved': 'flat.problemWindowMoved',
  'ceiling-too-low': 'flat.problemCeilingTooLow',
  'above-the-roof': 'flat.problemAboveTheRoof',
  'next-building-in-the-way': 'flat.problemNextBuilding',
  'balcony-in-the-way': 'flat.problemBalcony',
  'outlook-blocked': 'flat.problemOutlookBlocked',
  'below-the-street': 'flat.problemBelowStreet',
};

export function flatProblemText(problem: RoomProblem): string {
  return t(TEXT[problem]);
}

/*
 * The compass sides a wall can face (scene/facades.ts names them in English, and those names stay the
 * values the code compares): the word shown for each, in the language chosen.
 */
const COMPASS: Record<string, MessageKey> = {
  North: 'flat.compassNorth',
  'North-east': 'flat.compassNorthEast',
  East: 'flat.compassEast',
  'South-east': 'flat.compassSouthEast',
  South: 'flat.compassSouth',
  'South-west': 'flat.compassSouthWest',
  West: 'flat.compassWest',
  'North-west': 'flat.compassNorthWest',
};

/** "North-east", as the language says it; a side this list does not know is shown as it is. */
export function compassWord(compass: string): string {
  const key = COMPASS[compass];
  return key ? t(key) : compass;
}

/** The same in lower case, for the middle of a sentence ("Floor 4, north-east side"). */
export function compassWordInSentence(compass: string): string {
  return compassWord(compass).toLocaleLowerCase(intlOf(getLocale()));
}
