/*
 * ─────────────────────────────────────────────────────────────────────────
 * SEARCHING THE CITY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   One function that turns what somebody typed into a ranked list of places
 *   in the model — both the 49 approved projects and the 1,328 existing
 *   buildings that carry an address.
 *
 * WHY IT IS NOT JUST `includes()`
 *   Addresses arrive as "319-323 Swanston Street MELBOURNE VIC 3000", and
 *   sometimes with a building name in front. Somebody typing "swanston" or
 *   "319 swanston" should find it; somebody typing "3000" should not get all
 *   1,328 of them, because the postcode is on every single one.
 *
 * WHAT IS DELIBERATELY MISSING
 *   220 of the 1,548 buildings have no address at all — the property register
 *   could not be matched to their outline. They cannot be found by searching,
 *   and the interface says so rather than letting the gap read as a broken
 *   query.
 */

import type { CityModel, Development, SearchableBuilding } from './model';

export type SearchHit =
  | { kind: 'development'; development: Development; label: string; detail: string }
  | { kind: 'building'; building: SearchableBuilding; label: string; detail: string };

/** Below this a query matches half the city and the list is meaningless. */
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;

/**
 * Parts of every Melbourne address that carry no information, because they
 * are on all of them. Left in the haystack, "3000" would match everything.
 */
const NOISE = /\b(melbourne|vic|victoria|3000|3008|australia)\b/gi;

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** The address minus the parts every address shares. */
const searchableText = (address: string) => normalise(address.replace(NOISE, ' '));

/** The part worth showing: "319-323 Swanston Street", not the postcode. */
export function shortAddress(address: string): string {
  return address.replace(NOISE, '').replace(/\s{2,}/g, ' ').replace(/[,\s]+$/, '').trim();
}

/**
 * Ranks a match so the obvious answer comes first.
 *
 * Typing "319 swanston" should put 319-323 Swanston Street above the other
 * forty buildings on that street, and a street name alone should return the
 * street's landmarks before its car parks — which is why the building list
 * arrives already sorted by height.
 */
function score(haystack: string, needle: string): number {
  const at = haystack.indexOf(needle);
  if (at === -1) {
    // Every word present but not adjacent — "swanston 319" still finds it.
    const words = needle.split(' ').filter(Boolean);
    if (words.length > 1 && words.every((word) => haystack.includes(word))) return 40;
    return -1;
  }
  if (at === 0) return 100;
  // A match at a word boundary beats one buried inside another word.
  return haystack[at - 1] === ' ' ? 80 : 60;
}

export function searchCity(model: CityModel, query: string): SearchHit[] {
  const needle = normalise(query);
  if (needle.length < MIN_QUERY_LENGTH) return [];

  const hits: { hit: SearchHit; score: number }[] = [];

  // Approved projects first at equal score: somebody searching an address
  // that has a proposal on it almost certainly means the proposal.
  for (const development of model.developments) {
    const points = score(searchableText(development.streetAddress), needle);
    if (points < 0) continue;
    hits.push({
      score: points + 10,
      hit: {
        kind: 'development',
        development,
        label: shortAddress(development.streetAddress),
        detail: `Approved development · ${development.maxHeightM.toFixed(0)} m`,
      },
    });
  }

  for (const building of model.searchable) {
    const points = score(searchableText(building.streetAddress), needle);
    if (points < 0) continue;
    hits.push({
      score: points,
      hit: {
        kind: 'building',
        building,
        label: shortAddress(building.streetAddress),
        detail: `Existing building · ${building.heightM.toFixed(0)} m`,
      },
    });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((entry) => entry.hit);
}
