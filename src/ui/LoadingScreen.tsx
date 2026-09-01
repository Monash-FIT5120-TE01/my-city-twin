import type { LoadProgress } from '../data/useCityModel';
import '../styles/loading.css';

const formatMB = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

/**
 * Shown while the city is being fetched and placed.
 *
 * The bar is driven by real byte counts, not a timer, so a stalled network
 * looks stalled instead of looking like steady progress. When the server does
 * not send a content length the bar falls back to an indeterminate sweep
 * rather than guessing a denominator.
 */
export function LoadingScreen({ progress, error }: { progress: LoadProgress; error: string | null }) {
  const indeterminate = progress.phase === 'downloading' && progress.totalBytes === null;
  const failed = progress.phase === 'failed' || error !== null;

  return (
    <div className="loading">
      <div className="loading__card" role="status" aria-live="polite">
        <p className="loading__eyebrow">MY CITY TWIN</p>
        <h1 className="loading__title">
          {failed ? 'The city model did not load' : 'Building the city model'}
        </h1>

        {failed ? (
          <p className="loading__error">{error ?? 'The snapshot could not be read.'}</p>
        ) : (
          <>
            <div
              className={`loading__track${indeterminate ? ' is-indeterminate' : ''}`}
              role="progressbar"
              aria-valuenow={indeterminate ? undefined : progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Loading the city model"
            >
              <div
                className="loading__fill"
                style={indeterminate ? undefined : { width: `${progress.percent}%` }}
              />
            </div>

            <div className="loading__meta">
              <span>{progress.label}</span>
              <span className="loading__figure">
                {progress.totalBytes
                  ? `${formatMB(progress.loadedBytes)} / ${formatMB(progress.totalBytes)}`
                  : `${progress.percent}%`}
              </span>
            </div>
          </>
        )}

        <p className="loading__note">
          Building Footprints 2023 and Development Activity Monitor © City of
          Melbourne. Draft Open Space Data © Victorian Planning Authority.
          Both licensed CC BY 4.0.
        </p>
      </div>
    </div>
  );
}
