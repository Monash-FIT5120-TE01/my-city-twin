import type { LoadProgress } from '../data/useCityModel';
import '../styles/loading.css';
import { formatNumber, useT } from '../i18n/i18n';

const formatMB = (bytes: number) =>
  `${formatNumber(bytes / 1_048_576, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;

/**
 * Shown while the city is being fetched and placed.
 *
 * The bar is driven by real byte counts, not a timer, so a stalled network
 * looks stalled instead of looking like steady progress. When the server does
 * not send a content length the bar falls back to an indeterminate sweep
 * rather than guessing a denominator.
 */
export function LoadingScreen({ progress, error }: { progress: LoadProgress; error: string | null }) {
  const t = useT();
  const indeterminate = progress.phase === 'downloading' && progress.totalBytes === null;
  const failed = progress.phase === 'failed' || error !== null;

  return (
    <div className="loading">
      <div className="loading__card" role="status" aria-live="polite">
        <p className="loading__eyebrow">MY CITY TWIN</p>
        <h1 className="panel-title loading__title">
          {failed ? t('loading.failed') : t('loading.building')}
        </h1>

        {failed ? (
          <p className="loading__error">{error ?? t('loading.unreadable')}</p>
        ) : (
          <>
            <div
              className={`loading__track${indeterminate ? ' is-indeterminate' : ''}`}
              role="progressbar"
              aria-valuenow={indeterminate ? undefined : progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('loading.progressLabel')}
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
                  : `${formatNumber(progress.percent)}%`}
              </span>
            </div>
          </>
        )}

        <p className="loading__note">
          {t('loading.credits')}
        </p>
      </div>
    </div>
  );
}
