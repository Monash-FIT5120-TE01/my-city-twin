/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHICH LANDMARKS THE FLAT MAP NAMES, AT WHICH ZOOM
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Fifty-one names do not fit on the whole CBD. So the map shows a few,
 * spread evenly, and more the nearer it is — the major places first.
 *
 * HOW (2026-10-15, agreed with the reader)
 *   1. An order: the major places (MAJOR) as listed, by importance; then
 *      the theatres, the big shops and the large public buildings (SECOND),
 *      then the rest — each of those two farthest-first, every next pick
 *      the place farthest from all picked before it, so any first few of
 *      them are spread across the city rather than bunched.
 *   2. At a zoom, go down that order and name a place if it is at least
 *      SPACING_PX on screen from every place already named. The major ones
 *      take their seats first; the rest fill the gaps between them at the
 *      same spacing. Zoomed out, a few; zoomed in, more.
 *   No two names on screen are closer than SPACING_PX, and the same zoom
 *   always names the same places, wherever the map is moved to.
 *
 *   (A first version kept each place's distance to the ones picked before
 *   it and named those far enough out at the zoom. A major place next to
 *   another then had a short distance and vanished, while an isolated
 *   minor one far away was named: the CBD zoomed out showed Victoria Police
 *   and not Federation Square.)
 *
 * The data carries no ranking of its own; the tiers are ours, by name.
 */

/** The major places, in the order they are picked. */
export const MAJOR = [
  'Flinders Street Railway Station',
  'Federation Square',
  'Melbourne Town Hall',
  'State Library Victoria',
  'Melbourne Central',
  'Queen Victoria Market',
  'St Pauls Cathedral',
  'Parliament Railway Station',
  'Immigration Museum',
  'Melbourne Aquarium',
  'RMIT University',
  'Old Melbourne Gaol Crime & Justice Experience',
] as const;

/** The theatres, the big shops and the large public buildings. */
export const SECOND = [
  'Regent Theatre',
  'Princess Theatre',
  "Her Majesty's Theatre",
  'Forum Theatre',
  'Comedy Theatre',
  'Athanaeum Theatre',
  'Myer',
  'David Jones',
  'Supreme Court',
  'Australian Centre For The Moving Image (ACMI)',
  'The Ian Potter Centre: NGV Australia',
  'Flagstaff Railway Station',
  'Melbourne Central Railway Station',
  'Scots Church',
  'St Francis Church',
] as const;

/** Two names on screen are at least this far apart, CSS pixels. */
export const SPACING_PX = 140;

export interface Spread<T> {
  item: T;
  /** Metres to the nearest place picked before it; Infinity for the first. */
  spacingM: number;
}

const tierOf = (name: string) =>
  (MAJOR as readonly string[]).includes(name) ? 0 : (SECOND as readonly string[]).includes(name) ? 1 : 2;

/**
 * The landmarks in the order the map names them, each with its spacing.
 * Deterministic: equal distances go to the earlier name in the tier lists,
 * then alphabetically.
 */
export function spreadLandmarks<T extends { name: string; en: [number, number] }>(items: readonly T[]): Spread<T>[] {
  const listed = (name: string) => {
    const t = tierOf(name);
    const list: readonly string[] = t === 0 ? MAJOR : t === 1 ? SECOND : [];
    const i = list.indexOf(name);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const remaining = [...items].sort(
    (a, b) => tierOf(a.name) - tierOf(b.name) || listed(a.name) - listed(b.name) || a.name.localeCompare(b.name),
  );
  const picked: Spread<T>[] = [];
  const nearest = new Map<T, number>(remaining.map((r) => [r, Infinity]));
  for (let tier = 0; tier < 3; tier++) {
    let pool = remaining.filter((r) => tierOf(r.name) === tier);
    while (pool.length > 0) {
      // The major places in their listed order; the others the farthest from everything picked so far.
      let best = pool[0];
      if (tier > 0) for (const r of pool) if ((nearest.get(r) as number) > (nearest.get(best) as number)) best = r;
      picked.push({ item: best, spacingM: nearest.get(best) as number });
      pool = pool.filter((r) => r !== best);
      for (const r of remaining) {
        const d = Math.hypot(r.en[0] - best.en[0], r.en[1] - best.en[1]);
        if (d < (nearest.get(r) as number)) nearest.set(r, d);
      }
    }
  }
  return picked;
}

/** The ones to name at this scale (pixels per metre), in their order: each at least `spacingPx` from all named before it. */
export function landmarksAtScale<T extends { en: [number, number] }>(
  spread: readonly Spread<T>[],
  scale: number,
  spacingPx = SPACING_PX,
): T[] {
  const apartM = spacingPx / scale;
  const named: T[] = [];
  for (const { item } of spread) {
    if (named.every((n) => Math.hypot(n.en[0] - item.en[0], n.en[1] - item.en[1]) >= apartM)) named.push(item);
  }
  return named;
}
