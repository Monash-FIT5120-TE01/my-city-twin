import { useEffect, useRef, useState } from 'react';
import { buildCityModel, type AdapterReport } from './adapter';
import type { CityModel } from './model';
import { fetchJsonWithProgress, yieldToPaint } from './fetchWithProgress';
import type {
  ApiBuildingPart,
  ApiDevelopmentPart,
  ApiFeatureCollection,
} from './api-types';

export const API_BASE =
  import.meta.env.VITE_API_BASE ?? 'https://fit5120-te01-be.onrender.com';

const SNAPSHOT = {
  buildings: '/data/building-footprints.json',
  developments: '/data/development-footprints.json',
};

const LIVE = {
  buildings: `${API_BASE}/api/building/footprints`,
  developments: `${API_BASE}/api/development/footprints`,
};

/** Give up on the live API and stay on the snapshot after this long. */
const LIVE_TIMEOUT_MS = 20_000;

/**
 * How the loading bar is divided. Downloading dominates because it is the
 * only part whose duration the network controls; the rest is bounded work
 * on data already in hand.
 */
const WEIGHT = { developments: 4, buildings: 76, model: 20 };

export type LoadPhase = 'downloading' | 'modelling' | 'ready' | 'failed';

export interface LoadProgress {
  phase: LoadPhase;
  /** 0–100. */
  percent: number;
  label: string;
  loadedBytes: number;
  totalBytes: number | null;
}

export interface CityModelState {
  model: CityModel | null;
  report: AdapterReport | null;
  error: string | null;
  progress: LoadProgress;
  /** True while the live API is being tried behind an already-drawn scene. */
  refreshing: boolean;
}

const INITIAL: LoadProgress = {
  phase: 'downloading',
  percent: 0,
  label: 'Contacting the city model',
  loadedBytes: 0,
  totalBytes: null,
};

/**
 * Loads the city, snapshot first.
 *
 * The staging API runs on a free Render instance, which sleeps. A cold start
 * takes the better part of a minute, and a demonstration cannot wait for it.
 * So the bundled snapshot draws the scene, and the live API is tried behind
 * it; if it answers, the model is swapped. If not, the scene is already up
 * and the provenance line says "snapshot".
 */
export function useCityModel(): CityModelState {
  const [state, setState] = useState<CityModelState>({
    model: null,
    report: null,
    error: null,
    progress: INITIAL,
    refreshing: false,
  });
  const started = useRef(false);

  useEffect(() => {
    /*
     * StrictMode mounts, unmounts, then mounts again. Guarding re-entry here
     * is enough — deliberately without a `cancelled` flag, because the flag
     * would be set by the first unmount and would then discard the result of
     * the one run we allowed, leaving the loader on screen forever.
     */
    if (started.current) return;
    started.current = true;

    const setProgress = (progress: Partial<LoadProgress>) =>
      setState((s) => ({ ...s, progress: { ...s.progress, ...progress } }));

    (async () => {
      try {
        setProgress({ phase: 'downloading', label: 'Approved developments', percent: 1 });

        const developments = await fetchJsonWithProgress<
          ApiFeatureCollection<ApiDevelopmentPart>
        >(SNAPSHOT.developments, (loaded, total) => {
          const share = total ? loaded / total : 0;
          setProgress({ percent: Math.round(share * WEIGHT.developments) });
        });

        setProgress({ label: 'Melbourne CBD building footprints' });

        const buildings = await fetchJsonWithProgress<
          ApiFeatureCollection<ApiBuildingPart>
        >(SNAPSHOT.buildings, (loaded, total) => {
          const share = total ? loaded / total : 0;
          setProgress({
            percent: WEIGHT.developments + Math.round(share * WEIGHT.buildings),
            loadedBytes: loaded,
            totalBytes: total,
          });
        });

        setProgress({
          phase: 'modelling',
          label: 'Placing 1,548 buildings',
          percent: WEIGHT.developments + WEIGHT.buildings,
        });
        // Let the bar paint before the main thread goes into the projection.
        await yieldToPaint();

        const { model, report } = buildCityModel(buildings, developments, 'snapshot');

        setState((s) => ({
          ...s,
          model,
          report,
          error: null,
          refreshing: true,
          progress: { ...s.progress, phase: 'ready', percent: 100, label: 'Ready' },
        }));
      } catch (err) {
        setState((s) => ({
          ...s,
          error: `Could not load the city: ${err instanceof Error ? err.message : String(err)}`,
          refreshing: true,
          progress: { ...s.progress, phase: 'failed', label: 'Could not load the city' },
        }));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
      try {
        const [developments, buildings] = await Promise.all([
          fetchJsonWithProgress<ApiFeatureCollection<ApiDevelopmentPart>>(
            LIVE.developments,
            () => {},
            controller.signal,
          ),
          fetchJsonWithProgress<ApiFeatureCollection<ApiBuildingPart>>(
            LIVE.buildings,
            () => {},
            controller.signal,
          ),
        ]);
        const { model, report } = buildCityModel(buildings, developments, 'live');
        setState((s) => ({ ...s, model, report, error: null, refreshing: false }));
      } catch {
        // Staying on the snapshot is a normal outcome, not a failure worth
        // showing — the scene is already drawn from it.
        setState((s) => ({ ...s, refreshing: false }));
      } finally {
        clearTimeout(timer);
      }
    })();
  }, []);

  return state;
}
