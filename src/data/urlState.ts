import { DEFAULT_DATE, fromDateInput, toDateInput, type SimulationDate } from '../scene/solar';

/*
 * The whole of the view, in the address bar.
 *
 * Story C.1 asks that an area a resident cares about be "held without login,
 * as a shareable link or local state, so that returning costs one click
 * rather than one search". A URL is the cheapest possible version of that,
 * and it needs no backend: no account, nothing stored, nothing to leak.
 *
 * It also makes the thing demonstrable. Without it there is no way to send
 * someone the view you are looking at.
 *
 * The development is keyed by devKey, not devId. devKey is the planning
 * reference the council uses — short, meaningful, and stable across a
 * database reload in a way a generated UUID is not.
 */

export type ViewName = 'landing' | 'explore' | 'development' | 'sunlight';

const VIEWS: ViewName[] = ['landing', 'explore', 'development', 'sunlight'];

export interface UrlState {
  view: ViewName;
  devKey: string | null;
  date: SimulationDate;
  minutes: number;
  /** The measured spot, east/north metres, to one decimal place. */
  receptor: [number, number] | null;
}

export const DEFAULT_MINUTES = 15 * 60;

function clampMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  // Snap to the slider's own step so a hand-edited URL cannot land between
  // two positions and make the control look broken.
  const snapped = Math.round(value / 10) * 10;
  return Math.min(20 * 60, Math.max(6 * 60, snapped));
}

export function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);

  const view = params.get('view') as ViewName | null;

  return {
    view: view && VIEWS.includes(view) ? view : 'landing',
    devKey: params.get('dev'),
    date: fromDateInput(params.get('d') ?? '') ?? DEFAULT_DATE,
    // has() before Number(): a missing parameter converts to 0, which is
    // finite, so it survived the guard in clampMinutes and pinned the clock
    // to 06:00 instead of falling back to the default.
    minutes: params.has('t')
      ? clampMinutes(Number(params.get('t')), DEFAULT_MINUTES)
      : DEFAULT_MINUTES,
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
 */
export function writeUrlState(state: UrlState): void {
  const params = new URLSearchParams();

  if (state.view !== 'landing') params.set('view', state.view);
  if (state.devKey) params.set('dev', state.devKey);
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
