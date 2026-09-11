/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE VIEW, WRITTEN INTO THE ADDRESS BAR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Two functions. `readUrlState` turns the query string into the state the
 *   app should start in; `writeUrlState` does the reverse whenever
 *   something changes.
 *
 *   A finished URL looks like this:
 *
 *     ?view=sunlight&dev=X0015700&d=2026-06-21&t=900&at=-532.4,-198.1
 *      │            │            │            │      └ the measured spot
 *      │            │            │            └ minutes since midnight
 *      │            │            └ the simulated date
 *      │            └ which development
 *      └ which screen
 *
 *   An existing building takes `bldg=<id>` in place of `dev=`. Until it did,
 *   half of what the search can find was not linkable at all: sending
 *   somebody a proposal worked, sending them a building silently reopened
 *   on the landing screen.
 *
 * WHY IT MATTERS
 *   User story C.1 asks that somebody be able to come back to a place they
 *   care about "without repeating the same search", and specifically without
 *   an account. A URL does that for nothing: no login, no database, no
 *   personal data to store or lose. Send the link and the other person sees
 *   what you saw.
 *
 * WHY replaceState AND NOT pushState
 *   Dragging the time slider changes the state a hundred times. With
 *   pushState each drag would become a history entry and the browser's back
 *   button would take a hundred presses to leave the page.
 */

import { fromDateInput, toDateInput, type SimulationDate } from '../scene/solar';
import { clampMinutes, outsideWindowNote, presentMoment } from './now';

export type ViewName = 'landing' | 'explore' | 'development' | 'building' | 'sunlight';

const VIEWS: ViewName[] = ['landing', 'explore', 'development', 'building', 'sunlight'];

export interface UrlState {
  view: ViewName;
  devKey: string | null;
  /** An existing building, when that is what was chosen instead. */
  buildingId: string | null;
  date: SimulationDate;
  minutes: number;
  /** Said when the app picked the time and had to clamp it. */
  nowNote: string | null;
  /** The measured spot, east/north metres, to one decimal place. */
  receptor: [number, number] | null;
}

/**
 * The hour the simulation falls back to when the present moment cannot be
 * shown — the middle of the afternoon, when there is a shadow to look at.
 */
export const DEFAULT_MINUTES = 15 * 60;

/**
 * A URL names ONE place.
 *
 * Both parameters at once is not a state the app can hold. The panels, the
 * camera, the marker and the measurement all prefer the building, while the
 * 3D view went on drawing the development — so a hand-edited or stale link
 * produced a screen titled after one building and showing the other one's
 * shadow, on a page whose whole purpose is to isolate a single shadow.
 *
 * A page that is about a particular kind of subject settles it. Anywhere
 * else the building wins, because that is the precedence everything
 * downstream already applies.
 *
 * Pure and exported so the rule can be tested without a document.
 */
export function chooseSubject(
  view: ViewName,
  devKey: string | null,
  buildingId: string | null,
): { devKey: string | null; buildingId: string | null } {
  if (!devKey || !buildingId) return { devKey, buildingId };
  if (view === 'development') return { devKey, buildingId: null };
  return { devKey: null, buildingId };
}

/**
 * The state to open in.
 *
 * THE DEFAULT IS NOW, NOT A SOLSTICE
 *   It used to open on 21 December at three in the afternoon — the shortest
 *   shadow of the year, which is the right frame for assessing a worst case
 *   and the wrong one for somebody asking what is happening to their street.
 *   A date the reader has to imagine their way into is a date they have to
 *   translate before the picture means anything.
 *
 *   Opening on the present moment costs nothing: the four solstice and
 *   equinox presets are still one press away, so the worst case has not gone
 *   anywhere. It is simply no longer what a visitor is shown first.
 *
 * WHAT THE URL STILL WINS
 *   Anything the address bar states. A shared link is somebody saying "look
 *   at this, at this hour", and the present moment must not overrule it, or
 *   the link stops meaning what its sender meant.
 *
 * The instant is a parameter so the tests can fix it. Read from the clock
 * inside, every test of this function would depend on the hour it ran at.
 */
export function readUrlState(now: Date = new Date()): UrlState {
  const params = new URLSearchParams(window.location.search);

  const view = params.get('view') as ViewName | null;
  const resolved: ViewName = view && VIEWS.includes(view) ? view : 'landing';

  const subject = chooseSubject(resolved, params.get('dev'), params.get('bldg'));

  const moment = presentMoment(now);
  const statedDate = fromDateInput(params.get('d') ?? '');
  const statedTime = params.has('t');

  return {
    view: resolved,
    devKey: subject.devKey,
    buildingId: subject.buildingId,
    date: statedDate ?? moment.date,
    // has() before Number(): a missing parameter converts to 0, which is
    // finite, so it survived the guard in clampMinutes and pinned the clock
    // to 06:00 instead of falling back to the default.
    minutes: statedTime
      ? clampMinutes(Number(params.get('t')), DEFAULT_MINUTES)
      : moment.minutes,
    /*
     * Said only when the app chose the time AND could not show it as it is.
     * A link that states an hour is not the reader's "now", so there is
     * nothing to apologise for.
     */
    nowNote: statedTime ? null : outsideWindowNote(moment),
    receptor: readReceptor(params.get('at')),
  };
}

/** "at=-532.4,-198.1" — two finite numbers or nothing. */
function readReceptor(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const [east, north] = raw.split(',').map(Number);
  if (!Number.isFinite(east) || !Number.isFinite(north)) return null;
  return [east, north];
}

/**
 * Writes the state back without adding a history entry.
 *
 * replaceState rather than pushState: dragging the time slider would
 * otherwise stack a hundred entries and make the browser's back button
 * useless for leaving the page.
 *
 * `nowNote` is excluded by the type rather than merely ignored. It is not
 * state — it is a remark about how the state was arrived at, it means nothing
 * to whoever opens the link, and it has no business in an address bar.
 */
export function writeUrlState(state: Omit<UrlState, 'nowNote'>): void {
  const params = new URLSearchParams();

  if (state.view !== 'landing') params.set('view', state.view);
  if (state.devKey) params.set('dev', state.devKey);
  if (state.buildingId) params.set('bldg', state.buildingId);
  if (state.view === 'sunlight') {
    params.set('d', toDateInput(state.date));
    params.set('t', String(state.minutes));
    if (state.receptor) {
      params.set('at', `${state.receptor[0].toFixed(1)},${state.receptor[1].toFixed(1)}`);
    }
  }

  const query = params.toString();
  // Keep the fragment: rebuilding from pathname alone silently dropped it.
  const next =
    (query ? `${window.location.pathname}?${query}` : window.location.pathname) +
    window.location.hash;
  if (next === window.location.pathname + window.location.search + window.location.hash) {
    return;
  }

  window.history.replaceState(null, '', next);
}
