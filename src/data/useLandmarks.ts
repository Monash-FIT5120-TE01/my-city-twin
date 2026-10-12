/*
 * ─────────────────────────────────────────────────────────────────────────
 * GETTING THE LANDMARKS, THE SAME WAY THE CITY ARRIVES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Snapshot first, live API behind it — the order useCityModel uses, for the
 * same reason: a demonstration cannot wait for a network, and fifty-one
 * names are a few kilobytes that ship with the page. If the API answers,
 * its list replaces the snapshot's; if it does not, nobody notices.
 *
 * The rows are kept raw and placed against the model only once both are in
 * hand, so a live city model arriving after the landmarks (or before them)
 * re-ties every point to the buildings actually on screen.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { bundled } from './bundled';
import { fetchJsonWithProgress } from './fetchWithProgress';
import { placeLandmarks, type Landmark } from './landmarks';
import { API_BASE } from './useCityModel';
import type { ApiLandmark } from './api-types';
import type { CityModel } from './model';

const SNAPSHOT = bundled('data/landmarks.json');
const LIVE = `${API_BASE}/api/building/landmarks`;

/** Give up on the live API and stay on the snapshot after this long. */
const LIVE_TIMEOUT_MS = 20_000;

/** Only an array of rows with names counts as an answer. */
const looksRight = (rows: unknown): rows is ApiLandmark[] =>
  Array.isArray(rows) && rows.every((row) => typeof row?.landmark_name === 'string');

/** The landmarks, placed on the given city. Empty until both have arrived. */
export function useLandmarks(model: Pick<CityModel, 'buildings' | 'extent'> | null): Landmark[] {
  const [rows, setRows] = useState<ApiLandmark[] | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode mounts twice; see useCityModel for why a flag and not a cancel.
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const snapshot = await fetchJsonWithProgress<unknown>(SNAPSHOT, () => {});
        if (looksRight(snapshot)) setRows(snapshot);
      } catch {
        // No snapshot is no landmarks, not a broken page: the live call follows.
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
      try {
        const live = await fetchJsonWithProgress<unknown>(LIVE, () => {}, controller.signal);
        if (looksRight(live) && live.length > 0) setRows(live);
      } catch {
        // Staying on the snapshot is the normal outcome offline.
      } finally {
        clearTimeout(timer);
      }
    })();
  }, []);

  return useMemo(() => (model && rows ? placeLandmarks(rows, model) : []), [model, rows]);
}
