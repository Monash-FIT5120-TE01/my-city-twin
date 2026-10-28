/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE FRONT PAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The page a bare visit arrives at. Its first screen has the words on the
 *   left, the live city in a window on the right and the five ways in along
 *   the bottom. Below that the page scrolls on into "Start with a place you
 *   know." and the sections in LandingMore. Laid out after the team's
 *   redesign (2026-10-20); the streets under the search kept their own look.
 *
 * WHAT IS ON IT
 *   - The film: the skyline drawn once, above the heading.
 *   - The heading: one sentence saying what this is and who it is for.
 *   - The search: the field, its matches (rendered by App), and the row
 *     that holds the chosen place with a way to clear it.
 *   - Three streets to start from.
 *   - "Explore Melbourne CBD", or "Explore Building" once a place is chosen:
 *     its own page.
 *   - "Enter in VR", on a device that can.
 *   - The five ways in (FeatureStrip): each opens its screen.
 *   - The window onto the city: the download's progress, then "Choose a
 *     building" and the map's credit.
 *   - The three steps ("How it works" in the bar scrolls to them).
 *   - LandingMore, under all of it.
 *
 * WHAT IS UNDER IT
 *   The canvas still fills the screen. This page covers the left and the
 *   bottom and leaves a window over the city; it measures that window on
 *   every resize and every scroll and reports it, and ViewInset frames the
 *   city inside it. Leaving the page takes the covers away and the same
 *   city slides to the middle — nothing is reloaded or rebuilt.
 *
 * THE FILM
 *   The one-line drawing of the skyline that used to be the cover now sits
 *   above the heading. It plays once and stops on the finished skyline. It
 *   is white on its own ground, so it is multiplied onto the page: the white
 *   drops out and only the line is left on the cream.
 *
 * WHY IT IS UP BEFORE THE CITY
 *   The city takes a few seconds to build — 4,443 roof planes and a five
 *   megabyte snapshot. This page does not need it, so it is drawn at once and
 *   the wait happens while somebody is reading, with the progress shown in
 *   the city's own window. App mounts this under the same key in both of its
 *   branches so that the city arriving does not rebuild the page and restart
 *   the film — see the note there.
 *
 * WHAT IT HOLDS
 *   Nothing that matters. The text in the field is App's, because the field
 *   in the header shares it; the chosen place is App's; this only knows
 *   whether the film is showing.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './kit/Icon';
import { bundled } from '../data/bundled';
import type { LoadProgress } from '../data/useCityModel';
import type { ScreenInset } from '../scene/ViewInset';
import { Button } from './kit/Button';
import { CloseButton } from './kit/CloseButton';
import { Pill } from './kit/Pill';
import { SearchField } from './kit/SearchField';
import { LandingMore } from './LandingMore';
import '../styles/landing.css';
import { formatNumber, useT } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';

/**
 * The five ways in along the foot of the first screen, in the order App's
 * `onFeature` takes them: developments, sunlight, solar, street activity,
 * future plans.
 */
const FEATURES: readonly { label: MessageKey; icon: IconName }[] = [
  { label: 'landing.features.developments', icon: 'location_on' },
  { label: 'landing.features.sunlight', icon: 'light_mode' },
  { label: 'landing.features.solar', icon: 'solar_power' },
  { label: 'landing.features.activity', icon: 'directions_walk' },
  { label: 'landing.features.future', icon: 'description' },
];

/** The three steps under the first screen, in the order the app is used. */
const STEPS = ['landing.start.find', 'landing.start.choose', 'landing.start.explore'] as const;

/**
 * How much of the city's window must stay clear of the header for the map
 * credit inside it still to be seen: the credit's own height and the gap
 * under it, with a little to spare. Pixels.
 */
const CREDIT_ROOM = 72;

/** The id of the three steps, an anchor to them: "How it works" in the bar scrolls here. */
export const HOW_IT_WORKS_ID = 'how-it-works';

/** The streets offered under the search, to start from without an address. */
const TRY_STREETS = ['Bourke Street', 'Collins Street', 'Swanston Street'];

/** The front page, over the city, with a window cut in it for the city. */
export function LandingPage({
  query,
  onQuery,
  onSearchFocus,
  results,
  chosen,
  onClearChosen,
  onOpenChosen,
  onExplore,
  onFeature,
  onEnterVr,
  loading,
  credit,
  onInset,
  reducedMotion,
}: {
  /** The text in the search field — App's, shared with the header's field. */
  query: string;
  onQuery: (next: string) => void;
  /** The field here has the keyboard, so the results belong under it. */
  onSearchFocus: () => void;
  /** The matches for `query`, rendered by App. Null when none are wanted here. */
  results: ReactNode;
  /** The place picked from the results, if any: its name and one line about it. */
  chosen: { label: string; detail: string } | null;
  onClearChosen: () => void;
  /** The main button, once a place is chosen: on to the place's own page. */
  onOpenChosen: () => void;
  /** Into the city with nothing chosen — here and in LandingMore's About. */
  onExplore: () => void;
  /**
   * One of the five ways in, by its place in FEATURES. Absent until the city
   * is here: each opens a screen that needs it, so until then they are greyed.
   */
  onFeature?: (index: number) => void;
  /**
   * Present only on a device that can start a headset session, and only once
   * the city exists — there is nothing to stand in before that.
   */
  onEnterVr?: () => void;
  /** The city is still loading, or failed to. Null once it is here. */
  loading: { progress: LoadProgress; error: string | null } | null;
  /** The map's credit, drawn in the city's window. See MapAttribution. */
  credit: ReactNode;
  /**
   * Where the city's window is, whenever it moves — on every scroll as well
   * as every resize, so App keeps it in a ref rather than in state.
   */
  onInset: (inset: ScreenInset) => void;
  /** The film is shown finished rather than played. */
  reducedMotion: boolean;
}) {
  const t = useT();
  const root = useRef<HTMLElement>(null);
  const window_ = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  /*
   * The callback, held where the observer can reach the current one without
   * being torn down and rebuilt by it. App passes an inline function (one
   * that writes a ref), so its identity changes on every render — and App
   * renders on every tick of the download.
   */
  const report = useRef(onInset);
  useEffect(() => {
    report.current = onInset;
  });

  /*
   * Measure the city's window whenever it moves: a resize, the type growing
   * with the window, the steps wrapping onto another line — and a scroll,
   * which carries the window up the screen.
   *
   * A layout effect so the measurement exists before the first paint. The
   * city is not drawn until it has loaded, by which time this has long been
   * reported, and ViewInset takes the first report without easing — so the
   * city's first frame is already inside the window.
   */
  useLayoutEffect(() => {
    const page = root.current;
    const hole = window_.current;
    if (!page || !hole) return;
    const measure = (snap = false) => {
      const outer = page.getBoundingClientRect();
      const inner = hole.getBoundingClientRect();
      report.current({
        left: Math.round(inner.left - outer.left),
        top: Math.round(inner.top - outer.top),
        bottom: Math.round(outer.bottom - inner.bottom),
        snap,
      });
      /*
       * The map's credit rides at the foot of the window, and the bar is
       * fixed over the top of the page. Scrolling the window up, the credit
       * reaches the bar while a strip of map is still showing under it — a
       * map on screen with its credit hidden, which the map's licence does
       * not allow. So once less than `CREDIT_ROOM` of the window is still
       * clear of the bar, the window is covered over: no map without its
       * credit. The bar's height is where the window starts on the unscrolled
       * page, its offset in the grid.
       */
      const clearOfBar = inner.bottom - outer.top - hole.offsetTop;
      hole.toggleAttribute('data-covered', clearOfBar < CREDIT_ROOM);
    };
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(page);
    observer.observe(hole);
    /*
     * The page scrolls, and the window scrolls with it: the city follows its
     * frame up and out of view, at once rather than easing after it.
     */
    const onScroll = () => measure(true);
    page.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      page.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <section className="landing" ref={root} aria-labelledby="landing-title">
      {/*
        The first screen, laid out as a grid. `.landing` around it is the
        part that scrolls, carrying this and what follows under it.
      */}
      <div className="landing__screen">
      {/*
        One wrapper for the parts that stack into one sheet on a phone. On a
        wide screen it steps out of the way (display: contents) and they take
        their own places in the first screen's grid.
      */}
      <div className="landing__sheet">
        <div className="landing__hero">
          <SkylineFilm reducedMotion={reducedMotion} />

          {/*
            One sentence: what this is and who it is for (2026-10-29), in
            place of a slogan and a row of topics. Focusable from script:
            "Back to top" (LandingMore) gives it the keyboard.
          */}
          <h1 className="landing__statement" id="landing-title" tabIndex={-1}>
            {t('landing.hero.title')}
          </h1>

          {/*
            The search (kit/SearchField, large: the page's main way in), with
            the results hung under it and, once a place is picked, the place
            in a row inside the same box. The field empties so it is ready for
            another search; the row is where the answer stays, with the way
            to undo it beside it.
          */}
          <SearchField
            ref={field}
            size="lg"
            className="landing__search"
            value={query}
            onChange={onQuery}
            onClear={() => {
              onQuery('');
              field.current?.focus();
            }}
            onFocus={onSearchFocus}
            placeholder={loading ? t('search.loading') : t('search.landingPlaceholder')}
            // Nothing to search until the buildings are here.
            disabled={loading !== null}
            dropdown={results}
          >
            {chosen && !query && (
              <div className="landing__chosen">
                <Pin />
                <span className="landing__chosen-words">
                  <span className="landing__chosen-label">{chosen.label}</span>
                  <small>{chosen.detail}</small>
                </span>
                <CloseButton label={t('landing.hero.clearChosen', { place: chosen.label })} onClick={onClearChosen} />
              </div>
            )}
          </SearchField>

          {/*
            Three streets to start from, for somebody with no address in mind:
            each searches for itself, and the results open under the field.
          */}
          <div className="landing__try">
            <p className="landing__try-label">{t('landing.hero.tryStreet')}</p>
            <div className="landing__try-streets">
              {TRY_STREETS.map((street) => (
                <Pill
                  key={street}
                  as="button"
                  size="xs"
                  disabled={loading !== null}
                  onClick={() => {
                    onQuery(street);
                    field.current?.focus();
                  }}
                >
                  {street}
                </Pill>
              ))}
            </div>
          </div>

          {/* Into the city; once a place is chosen, on to it. */}
          <Button size="lg" block arrow className="landing__cta" onClick={chosen ? onOpenChosen : onExplore}>
            {chosen ? t('landing.hero.exploreBuilding') : t('landing.hero.exploreCbd')}
          </Button>

          {onEnterVr && (
            <Button
              variant="ghost"
              size="lg"
              block
              /*
               * The handler IS the call — see xrStore.ts. Nothing may be
               * awaited or confirmed in front of it, or the session never
               * opens.
               */
              onClick={onEnterVr}
            >
              {t('landing.hero.enterVr')}
            </Button>
          )}
        </div>

        <section className="landing__steps" aria-label={t('landing.features.label')}>
          <FeatureStrip onFeature={onFeature} />
        </section>
      </div>

      {/*
        The window onto the city. Transparent and deaf to the pointer, so the
        city under it is what gets dragged and clicked; only the credit and
        "Choose a building" in it answer.
      */}
      <div className="landing__window" ref={window_}>
        {loading && <Loading progress={loading.progress} error={loading.error} />}
        {credit}
        {!loading && (
          <div className="landing__callouts">
            <button type="button" className="map-callout map-callout--choose" onClick={onExplore}>
              <Icon name="location_on" />
              {t('landing.window.chooseBuilding')}
            </button>
          </div>
        )}
      </div>
      </div>

      {/*
        The three steps. Focusable so "How it works" in the bar can move the
        keyboard here as well as the eye; -1 keeps it out of the tab order.
      */}
      <div className="city-features city-features--steps">
        <section className="city-start" id={HOW_IT_WORKS_ID} tabIndex={-1} aria-labelledby="start-title">
          <h2 id="start-title">{t('landing.start.title')}</h2>
          <ol>
            {STEPS.map((step, index) => (
              <li key={step}>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {t(step)}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* The sections under all of it, reached by scrolling. */}
      <LandingMore onExplore={onExplore} reducedMotion={reducedMotion} />
    </section>
  );
}

/**
 * The five ways in. Each opens its screen with a place already on it (App's
 * `onFeature`). None is shown as chosen: each leaves the page, so there is no
 * current one to show (found in review, 2026-10-21).
 */
function FeatureStrip({ onFeature }: { onFeature?: (index: number) => void }) {
  const t = useT();
  return (
    <nav className="feature-strip" aria-label={t('landing.features.label')}>
      {FEATURES.map((feature, index) => (
        <button key={feature.label} type="button" disabled={!onFeature} onClick={() => onFeature?.(index)}>
          <Icon name={feature.icon} size={28} />
          {t(feature.label)}
        </button>
      ))}
    </nav>
  );
}

/**
 * The skyline being drawn, once.
 *
 * Hidden until it is actually running: a video element paints white before
 * its first frame is decoded, and on the cream that is a white box flashing
 * where the drawing will be.
 *
 * Under a reduced-motion preference it does not play. It is shown on its
 * LAST frame, the finished skyline — the first frame is an empty page with
 * one stroke on it, which is a picture of nothing.
 */
export function SkylineFilm({ reducedMotion }: { reducedMotion: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [showing, setShowing] = useState(false);

  const finished = () => {
    const film = video.current;
    if (!film || !Number.isFinite(film.duration)) return;
    film.pause();
    film.currentTime = Math.max(0, film.duration - 0.05);
  };

  return (
    <div className="landing__skyline">
      <video
        ref={video}
        className={showing ? 'is-showing' : undefined}
        src={bundled('landing-animation.mp4')}
        autoPlay={!reducedMotion}
        muted
        playsInline
        preload="auto"
        onPlaying={() => setShowing(true)}
        onLoadedMetadata={() => {
          if (reducedMotion) finished();
        }}
        onSeeked={() => {
          if (reducedMotion) setShowing(true);
        }}
        // Decorative: the heading below says everything it says.
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * The city's download, in the city's window.
 *
 * Driven by real byte counts, as the full-screen loading screen is, so a
 * stalled network looks stalled. With no content length there is no
 * denominator to show, and the bar sweeps instead of guessing one.
 */
function Loading({ progress, error }: { progress: LoadProgress; error: string | null }) {
  const t = useT();
  const failed = progress.phase === 'failed' || error !== null;
  const indeterminate = progress.phase === 'downloading' && progress.totalBytes === null;
  return (
    <div className="landing__loading" role="status" aria-live="polite">
      <p className="landing__loading-title">
        {failed ? t('landing.loading.failed') : t('landing.loading.building')}
      </p>
      {failed ? (
        <p className="landing__loading-meta">{error ?? t('landing.loading.unreadable')}</p>
      ) : (
        <>
          <div
            className={`landing__track${indeterminate ? ' is-indeterminate' : ''}`}
            role="progressbar"
            aria-valuenow={indeterminate ? undefined : progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('landing.loading.progressLabel')}
          >
            <div
              className="landing__fill"
              style={indeterminate ? undefined : { width: `${progress.percent}%` }}
            />
          </div>
          <p className="landing__loading-meta">
            {progress.label}
            {indeterminate ? '' : ` · ${t('landing.loading.percent', { percent: formatNumber(progress.percent) })}`}
          </p>
        </>
      )}
    </div>
  );
}

// ── the icons: an arrow for the ways in, a cross to clear, a pin for the chosen place

function Pin() {
  return (
    <Icon name="location_on" size={18} className="landing__pin" />
  );
}
