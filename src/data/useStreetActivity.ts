/*
 * ─────────────────────────────────────────────────────────────────────────
 * GETTING THE STREET ACTIVITY, THE SAME WAY THE CITY ARRIVES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Snapshot first, live API behind it (useCityModel, useLandmarks), so a
 * demonstration without a network still has a street to show. Unlike the
 * city, these numbers go stale by the hour, so the state says which of the
 * two is on screen and when the snapshot was taken, and the screen says it
 * too.
 *
 * Nothing is fetched until the screen first opens: a quarter of a megabyte
 * nobody on the sunlight screen asked for. After that the answer is kept,
 * and "Refresh" asks the live API again — the counts change once an hour.
 *
 * THE ORDER THINGS FINISH IN
 *   A refresh can be pressed before the snapshot has arrived, and either can
 *   fail. So the sequencing lives in createStreetActivityLoader, outside
 *   React, where the test can finish the calls in any order it likes:
 *     - a live answer is never replaced by the older snapshot;
 *     - two live calls at once are one call;
 *     - "failed" means both have finished and nothing reached the screen.
 */

import { useEffect, useRef, useState } from 'react';
import { bundled } from './bundled';
import { fetchJsonWithProgress } from './fetchWithProgress';
import { buildStreetActivity, looksLikeAnswers, type StreetActivity, type StreetActivityAnswers } from './streetActivity';
import { API_BASE } from './useCityModel';

const SNAPSHOT = bundled('data/street-activity.json');
const LIVE = (part: keyof StreetActivityAnswers) => `${API_BASE}/api/pedestrian-activities/${part}`;
const PARTS: (keyof StreetActivityAnswers)[] = ['sensors', 'recent', 'history', 'forecast'];

/** Give up on the live API and stay where we are after this long. */
const LIVE_TIMEOUT_MS = 20_000;

export interface StreetActivityData {
  activity: StreetActivity | null;
  /** Which of the two is on screen. */
  source: 'snapshot' | 'live' | null;
  /** When the snapshot was taken; null when the live answer is on screen. */
  takenAt: number | null;
  /** True while the live API is being asked. */
  refreshing: boolean;
  /** True when both have finished and neither answered. */
  failed: boolean;
}

export interface StreetActivityState extends StreetActivityData {
  refresh: () => void;
}

const EMPTY: StreetActivityData = { activity: null, source: null, takenAt: null, refreshing: false, failed: false };

export interface LoaderDeps {
  loadSnapshot: () => Promise<unknown>;
  loadLive: (signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
}

/** The sequencing, without React. `emit` is called with every new state. */
export function createStreetActivityLoader(deps: LoaderDeps, emit: (state: StreetActivityData) => void) {
  let state = EMPTY;
  let liveShown = false;
  let snapshotSettled = false;
  let inFlight: Promise<void> | null = null;

  const set = (patch: Partial<StreetActivityData>) => {
    state = { ...state, ...patch };
    emit(state);
  };

  const live = (): Promise<void> => {
    if (inFlight) return inFlight;
    set({ refreshing: true });
    inFlight = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? LIVE_TIMEOUT_MS);
      try {
        const answers = await deps.loadLive(controller.signal);
        if (looksLikeAnswers(answers) && answers.sensors.length > 0) {
          liveShown = true;
          set({ activity: buildStreetActivity(answers), source: 'live', takenAt: null, failed: false });
        }
      } catch {
        // Staying on what is already on screen is the normal outcome offline.
      } finally {
        clearTimeout(timer);
        inFlight = null;
        set({ refreshing: false, failed: snapshotSettled && state.activity === null });
      }
    })();
    return inFlight;
  };

  const start = async () => {
    try {
      const snapshot = await deps.loadSnapshot();
      if (!liveShown && looksLikeAnswers(snapshot)) {
        const taken = Date.parse((snapshot as { takenAt?: string }).takenAt ?? '');
        set({
          activity: buildStreetActivity(snapshot),
          source: 'snapshot',
          takenAt: Number.isFinite(taken) ? taken : null,
          failed: false,
        });
      }
    } catch {
      // No snapshot is not a broken screen: the live call follows.
    }
    snapshotSettled = true;
    await live();
  };

  return { start, refresh: live, get state() { return state; } };
}

async function fetchLive(signal: AbortSignal): Promise<unknown> {
  const parts = await Promise.all(PARTS.map((part) => fetchJsonWithProgress<unknown>(LIVE(part), () => {}, signal)));
  return Object.fromEntries(PARTS.map((part, i) => [part, parts[i]]));
}

export function useStreetActivity(enabled: boolean): StreetActivityState {
  const [data, setData] = useState<StreetActivityData>(EMPTY);
  const loader = useRef<ReturnType<typeof createStreetActivityLoader> | null>(null);
  loader.current ??= createStreetActivityLoader(
    { loadSnapshot: () => fetchJsonWithProgress<unknown>(SNAPSHOT, () => {}), loadLive: fetchLive },
    setData,
  );
  const started = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice; see useCityModel for why a flag and not a cancel.
    if (!enabled || started.current) return;
    started.current = true;
    void loader.current?.start();
  }, [enabled]);

  return { ...data, refresh: () => void loader.current?.refresh() };
}
