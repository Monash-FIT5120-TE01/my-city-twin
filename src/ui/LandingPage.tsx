/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE FRONT PAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The page a bare visit arrives at: the words on the left, the live city in
 *   a window on the right, the three steps along the bottom and the fine
 *   print under them. It replaced two things — a full-screen cover with a
 *   film on it, and a panel floated over the city — with one page.
 *
 * WHAT IS UNDER IT
 *   The canvas still fills the screen. This page covers the left and the
 *   bottom and leaves a window over the city; it measures that window and
 *   reports it, and ViewInset frames the city inside it. Leaving the page
 *   takes the covers away and the same city slides to the middle — nothing
 *   is reloaded or rebuilt.
 *
 * THE FILM
 *   The one-line drawing of the skyline that used to be the cover now sits
 *   above the heading. It plays once and stops on the finished skyline. It
 *   is white on its own ground, so
 *   it is multiplied onto the page: the white drops out and only the line is
 *   left on the cream.
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
 *   whether the film is showing and whether the main button was pressed
 *   too soon.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { bundled } from '../data/bundled';
import type { LoadProgress } from '../data/useCityModel';
import type { ScreenInset } from '../scene/ViewInset';
import { NOT_AN_ASSESSMENT } from './words';
import '../styles/landing.css';

/**
 * Three figures about living in the CBD, each with where it came from.
 *
 * WHY THE SOURCE IS PART OF THE DATA AND NOT A FOOTNOTE
 *   A percentage with no source is an assertion. These three are the only
 *   numbers in the whole application that did not come out of the model —
 *   everything else on screen is computed from surveyed geometry and can be
 *   checked against it, and these cannot. So each one carries its origin in
 *   the same object, and nothing can render one without the other.
 *
 * WHY EACH URL POINTS AT THE FIGURE AND NOT AT THE ORGANISATION
 *   Every link below was opened and the number read off the page it lands
 *   on. A citation that goes to a department's front door leaves the reader
 *   to find the claim themselves. The walking figure took two attempts for
 *   that reason: the page that reads most like its home — the strategy's
 *   walking chapter — does not contain it, so the link goes to the strategy.
 *
 * WHY EACH ONE SAYS WHAT IT IS OF
 *   "99.2%" is meaningless alone; "of occupied private dwellings" is the
 *   fact, which is why the qualifier is never shortened.
 */
const FIGURES = [
  {
    figure: '99.2%',
    title: 'Apartment living is the norm.',
    body: 'Of occupied private dwellings in Melbourne suburb were flats or apartments.',
    source: 'ABS Census 2021',
    /* QuickStats for the suburb of Melbourne; the page gives "Flat or
       apartment: 27,250, 99.2%" under dwelling structure. */
    href: 'https://www.abs.gov.au/census/find-census-data/quickstats/2021/SAL21640',
  },
  {
    figure: '89%',
    title: 'A city experienced on foot.',
    body: 'Of trips within the Hoddle Grid were made on foot.',
    source: 'City of Melbourne, Transport Strategy 2030',
    href: 'https://www.melbourne.vic.gov.au/transport-strategy-2030',
  },
  {
    figure: '32%',
    title: 'Greener spaces are a priority.',
    body: 'Of CBD respondents prioritised plants, trees and improved open spaces.',
    source: '2024 Neighbourhood Survey · 532 CBD responses',
    /* The consultation summary lists "More plants, trees and improved open
       spaces (32%)" as the CBD's third priority, from 532 CBD responses. */
    href: 'https://participate.melbourne.vic.gov.au/neighbourhood-survey',
  },
];

/** The three steps along the bottom, in the order the app is used. */
const STEPS = [
  { title: 'Find a place', body: 'Search for an address or explore the map.' },
  { title: 'Select any building', body: 'Click on a building to see what’s happening nearby.' },
  {
    title: 'Compare sunlight',
    body: 'See how planned developments could affect sunlight on your street.',
  },
];

/** The id "How it works" in the header moves to. */
export const HOW_IT_WORKS_ID = 'how-it-works';

export function LandingPage({
  query,
  onQuery,
  onSearchFocus,
  results,
  chosen,
  onClearChosen,
  onSunlight,
  onExplore,
  onEnterVr,
  loading,
  when,
  credit,
  onInset,
  reducedMotion,
}: {
  query: string;
  onQuery: (next: string) => void;
  /** The field here has the keyboard, so the results belong under it. */
  onSearchFocus: () => void;
  /** The matches for `query`, rendered by App. Null when none are wanted here. */
  results: ReactNode;
  /** The place picked from the results, if any: its name and one line about it. */
  chosen: { label: string; detail: string } | null;
  onClearChosen: () => void;
  /** The main button, once a place is chosen. */
  onSunlight: () => void;
  onExplore: () => void;
  /**
   * Present only on a device that can start a headset session, and only once
   * the city exists — there is nothing to stand in before that.
   */
  onEnterVr?: () => void;
  /** The city is still loading, or failed to. Null once it is here. */
  loading: { progress: LoadProgress; error: string | null } | null;
  /** The moment the city is showing: "21 June 2026, 12:00 · Winter". */
  when: string | null;
  /** The map's credit, drawn in the city's window. See MapAttribution. */
  credit: ReactNode;
  /** Where the city's window is, whenever it moves. */
  onInset: (inset: ScreenInset) => void;
  reducedMotion: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const window_ = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const sources = useRef<HTMLDialogElement>(null);
  /*
   * Said when the main button is pressed with nothing chosen, rather than
   * the button being disabled: a greyed-out button tells somebody that
   * something is wrong without telling them what to do about it.
   */
  const [askedTooSoon, setAskedTooSoon] = useState(false);

  /*
   * The callback, held where the observer can reach the current one without
   * being torn down and rebuilt by it. App happens to pass a state setter,
   * which never changes, but the observer should not depend on that: an
   * inline function passed here later would otherwise rebuild it on every
   * render — and App renders on every tick of the download.
   */
  const report = useRef(onInset);
  useEffect(() => {
    report.current = onInset;
  });

  /*
   * Measure the city's window whenever the layout moves: a resize, the type
   * growing with the window, the steps wrapping onto another line.
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
    const measure = () => {
      const outer = page.getBoundingClientRect();
      const inner = hole.getBoundingClientRect();
      report.current({
        left: Math.round(inner.left - outer.left),
        top: Math.round(inner.top - outer.top),
        bottom: Math.round(outer.bottom - inner.bottom),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    observer.observe(hole);
    return () => observer.disconnect();
  }, []);

  const sunlight = () => {
    if (chosen) {
      onSunlight();
      return;
    }
    setAskedTooSoon(true);
    field.current?.focus();
  };

  return (
    <section className="landing" ref={root} aria-labelledby="landing-title">
      {/*
        One wrapper for the three parts that scroll together on a phone. On a
        wide screen it steps out of the way (display: contents) and the three
        take their own places in the page's grid.
      */}
      <div className="landing__sheet">
        <div className="landing__hero">
          <SkylineFilm reducedMotion={reducedMotion} />

          <h1 className="landing__title" id="landing-title">
            See Melbourne&rsquo;s next chapter.
          </h1>

          <p className="landing__body">
            Explore any building and discover how nearby developments could change
            sunlight on your street.
          </p>

          <div className="landing__search">
            <label className="landing__field">
              <svg width="18" height="18" viewBox="0 0 17 17" aria-hidden="true">
                <circle cx="7" cy="7" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
                <line
                  x1="11"
                  y1="11"
                  x2="15.4"
                  y2="15.4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={field}
                // The "/" key finds whichever search field is on screen. See Header.
                data-search-field
                value={query}
                onChange={(event) => onQuery(event.target.value)}
                onFocus={onSearchFocus}
                placeholder={loading ? 'The city is loading…' : 'Search a street or address'}
                aria-label="Search for a street or address"
                // Nothing to search until the buildings are here.
                disabled={loading !== null}
              />
              {query && (
                <button
                  type="button"
                  className="landing__clear"
                  onClick={() => {
                    onQuery('');
                    field.current?.focus();
                  }}
                  aria-label="Clear the search"
                >
                  <Cross />
                </button>
              )}
            </label>

            {results}

            {/*
              What has been chosen, once something has. The field empties so
              it is ready for another search; this row is where the answer
              stays, with the way to undo it beside it.
            */}
            {chosen && !query && (
              <div className="landing__chosen">
                <Pin />
                <span className="landing__chosen-words">
                  <span className="landing__chosen-label">{chosen.label}</span>
                  <small>{chosen.detail}</small>
                </span>
                <button
                  type="button"
                  className="landing__clear"
                  onClick={onClearChosen}
                  aria-label={`Clear ${chosen.label}`}
                >
                  <Cross />
                </button>
              </div>
            )}
          </div>

          <button type="button" className="button button--block landing__cta" onClick={sunlight}>
            Explore sunlight
            <Arrow />
          </button>

          {/* Polite: it answers a press, it does not interrupt one. */}
          <p className="landing__hint" aria-live="polite">
            {/* Gone as soon as something is chosen: it would be answering nothing. */}
            {askedTooSoon && !chosen
              ? 'Search for an address above, then choose it from the list.'
              : ''}
          </p>

          {onEnterVr && (
            <button
              type="button"
              className="button button--block button--ghost landing__vr"
              /*
               * The handler IS the call — see xrStore.ts. Nothing may be
               * awaited or confirmed in front of it, or the session never
               * opens.
               */
              onClick={onEnterVr}
            >
              Enter in VR
            </button>
          )}

          <button type="button" className="landing__explore" onClick={onExplore}>
            Explore the city without an address
            <Arrow />
          </button>
        </div>

        {/*
          Focusable so "How it works" in the header can move the keyboard
          here as well as the eye; -1 keeps it out of the tab order.
        */}
        <section
          className="landing__steps"
          id={HOW_IT_WORKS_ID}
          tabIndex={-1}
          aria-label="How it works"
        >
          <ol role="list">
            {STEPS.map((step, index) => (
              <li key={step.title} className="landing__step">
                <span className="landing__step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <span className="landing__step-title">{step.title}</span>
                  <span className="landing__step-body">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <footer className="landing__foot">
          <p>
            Illustrative model · Demo data
            <span className="landing__foot-sep" aria-hidden="true">
              |
            </span>
            <button
              type="button"
              className="landing__sources-link"
              onClick={() => sources.current?.showModal()}
            >
              Sources &amp; limitations
            </button>
          </p>
          {when && <p className="landing__when">{when}</p>}
        </footer>
      </div>

      {/*
        The window onto the city. Transparent and deaf to the pointer, so the
        city under it is what gets dragged and clicked; only the legend and
        the credit in it answer.
      */}
      <div className="landing__window" ref={window_}>
        {loading && <Loading progress={loading.progress} error={loading.error} />}
        {!loading && (
          <aside className="landing__legend" aria-label="Map key">
            <span className="landing__legend-row">
              <span className="landing__swatch landing__swatch--existing" aria-hidden="true" />
              Existing
            </span>
            <span className="landing__legend-row">
              <span className="landing__swatch landing__swatch--approved" aria-hidden="true" />
              Approved
            </span>
          </aside>
        )}
        {credit}
      </div>

      <dialog
        className="landing__sources"
        ref={sources}
        aria-labelledby="sources-title"
        // A click on the backdrop — outside the card — closes it.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="landing__sources-card">
          <div className="landing__sources-head">
            <h2 id="sources-title">Sources &amp; limitations</h2>
            <button
              type="button"
              className="landing__clear"
              onClick={() => sources.current?.close()}
              aria-label="Close"
            >
              <Cross />
            </button>
          </div>

          <p className="landing__sources-lead">{NOT_AN_ASSESSMENT}</p>

          <h3>Why it matters</h3>
          <ol className="landing__figures" role="list">
            {FIGURES.map((entry) => (
              <li key={entry.title}>
                <p className="landing__figure">{entry.figure}</p>
                <p className="landing__figure-title">{entry.title}</p>
                <p className="landing__figure-body">{entry.body}</p>
                <p className="landing__figure-source">
                  Source:{' '}
                  {/*
                    A new tab, because leaving the page would throw away the
                    date, the hour and whatever is chosen — all of which live
                    in this tab's state.
                  */}
                  <a href={entry.href} target="_blank" rel="noreferrer noopener">
                    {entry.source}
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                </p>
              </li>
            ))}
          </ol>
          {/*
            What the three figures do NOT say, which is the part a reader
            would otherwise supply and get wrong. "Melbourne" as a suburb is
            larger than the Hoddle Grid this model covers, and the last two
            count different things: trips are events, respondents are people.
          */}
          <p className="landing__sources-note">
            Melbourne suburb extends beyond the Hoddle Grid. Walking figures describe
            trips; survey figures describe respondents.
          </p>

          <h3>Data</h3>
          <p className="landing__sources-note">
            Building Footprints 2023 and Development Activity Monitor © City of
            Melbourne. Draft Open Space Data © Victorian Planning Authority. Both
            licensed CC BY 4.0. Modified: reprojected, extruded to simple block
            massing, and grouped by structure.
          </p>
        </div>
      </dialog>
    </section>
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
function SkylineFilm({ reducedMotion }: { reducedMotion: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [showing, setShowing] = useState(false);

  const finished = () => {
    const film = video.current;
    if (!film || !Number.isFinite(film.duration)) return;
    film.pause();
    film.currentTime = Math.max(0, film.duration - 0.05);
  };

  return (
    <div className="landing__film">
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
  const failed = progress.phase === 'failed' || error !== null;
  const indeterminate = progress.phase === 'downloading' && progress.totalBytes === null;
  return (
    <div className="landing__loading" role="status" aria-live="polite">
      <p className="landing__loading-title">
        {failed ? 'The city model did not load' : 'Building the city model'}
      </p>
      {failed ? (
        <p className="landing__loading-meta">{error ?? 'The snapshot could not be read.'}</p>
      ) : (
        <>
          <div
            className={`landing__track${indeterminate ? ' is-indeterminate' : ''}`}
            role="progressbar"
            aria-valuenow={indeterminate ? undefined : progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Loading the city model"
          >
            <div
              className="landing__fill"
              style={indeterminate ? undefined : { width: `${progress.percent}%` }}
            />
          </div>
          <p className="landing__loading-meta">
            {progress.label}
            {indeterminate ? '' : ` · ${progress.percent}%`}
          </p>
        </>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg width="17" height="10" viewBox="0 0 17 10" aria-hidden="true">
      <path
        d="M0 5h15M11 1l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function Pin() {
  return (
    <svg className="landing__pin" width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
      <path
        d="M7 17s5.6-5.6 5.6-10A5.6 5.6 0 0 0 1.4 7C1.4 11.4 7 17 7 17Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="2" fill="currentColor" />
    </svg>
  );
}
