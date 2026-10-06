/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE FRONT PAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The page a bare visit arrives at. Its first screen has the words on the
 *   left, the live city in a window on the right, the three steps along the
 *   bottom and the fine print under them. Below that the page scrolls on
 *   into the sections in LandingMore. It replaced two things — a full-screen
 *   cover with a film on it, and a panel floated over the city — with one
 *   page.
 *
 * WHAT IS ON IT
 *   - The film: the skyline drawn once, above the heading.
 *   - The search: the field, its matches (rendered by App), and the row
 *     that holds the chosen place with a way to clear it.
 *   - "Explore sunlight", and the hint when it is pressed too soon.
 *   - "Enter in VR", on a device that can.
 *   - "Explore the city without an address".
 *   - The three steps — the place "How it works" in the header moves to.
 *   - The fine print: what the model is, Sources & limitations, the moment
 *     shown.
 *   - The window onto the city: the download's progress, then the map key
 *     and the map's credit.
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
 *   whether the film is showing and whether the main button was pressed
 *   too soon.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { bundled } from '../data/bundled';
import type { LoadProgress } from '../data/useCityModel';
import type { ScreenInset } from '../scene/ViewInset';
import { MapKey, SourcesLink } from './Sources';
import { LandingMore } from './LandingMore';
import '../styles/landing.css';

/** The three steps along the bottom, in the order the app is used. */
const STEPS = [
  { title: 'Find a place', body: 'Search for an address or explore the map.' },
  { title: 'Select any building', body: 'Double-click a building to open its page.' },
  {
    title: 'Compare sunlight',
    body: 'See how planned developments could affect sunlight on your street.',
  },
];

/**
 * How much of the city's window must stay clear of the header for the map
 * credit inside it still to be seen: the credit's own height and the gap
 * under it, with a little to spare. Pixels.
 */
const CREDIT_ROOM = 72;

/** The id "How it works" in the header moves to. */
export const HOW_IT_WORKS_ID = 'how-it-works';

/** The front page, over the city, with a window cut in it for the city. */
/** How long a wheel turn takes to glide to the next section, ms (slower than the browser's 'smooth'). */
const SNAP_GLIDE_MS = 850;

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
  /** The main button, once a place is chosen. */
  onSunlight: () => void;
  /** Into the city with nothing chosen — here and at the foot of LandingMore. */
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
  /**
   * Where the city's window is, whenever it moves — on every scroll as well
   * as every resize, so App keeps it in a ref rather than in state.
   */
  onInset: (inset: ScreenInset) => void;
  /** The film is shown finished rather than played. */
  reducedMotion: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const window_ = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  /*
   * Said when the main button is pressed with nothing chosen, rather than
   * the button being disabled: a greyed-out button tells somebody that
   * something is wrong without telling them what to do about it.
   */
  const [askedTooSoon, setAskedTooSoon] = useState(false);

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

  /*
   * Snap scrolling (landing.css) for a mouse wheel.
   *
   * The page snaps to the first screen and to the top of each section below
   * it. Touch, keys and trackpad flings are snapped by the browser, but one
   * notch of a wheel moves about 100 px, and the nearest snap point to that is
   * the one it started from: the page would not move at all. So a wheel turn
   * goes to the next snap point (or the one before) and the rest of that turn
   * is ignored until it has arrived. Inside a section taller than the window,
   * the wheel scrolls it as usual until its edge comes into view.
   */
  useEffect(() => {
    const page = root.current;
    if (!page) return;
    let busyUntil = 0, frame = 0;
    /*
     * Our own easing rather than the browser's 'smooth', which is quick and
     * cannot be slowed. The snap is switched off while it runs: the browser
     * re-snaps every position a script sets, and would pull each frame back.
     */
    const glide = (to: number) => {
      const from = page.scrollTop, start = performance.now();
      cancelAnimationFrame(frame);
      page.style.scrollSnapType = 'none';
      const step = (now: number) => {
        const u = Math.min(1, (now - start) / SNAP_GLIDE_MS);
        const eased = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;   // ease in and out
        page.scrollTop = from + (to - from) * eased;
        if (u < 1) frame = requestAnimationFrame(step);
        else page.style.scrollSnapType = '';
      };
      frame = requestAnimationFrame(step);
    };
    const targets = () => {
      const header = parseFloat(getComputedStyle(page).scrollPaddingTop) || 0;
      const base = page.getBoundingClientRect().top - page.scrollTop, end = page.scrollHeight - page.clientHeight;
      const tops = [...page.querySelectorAll<HTMLElement>('.more > section')].map((s) => s.getBoundingClientRect().top - base - header);
      return [0, ...tops, end].map((v) => Math.max(0, Math.min(end, Math.round(v)))).sort((x, y) => x - y);
    };
    const onWheel = (event: WheelEvent) => {
      // pinch-zoom and sideways scrolling are not page scrolls
      if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const now = performance.now();
      if (now < busyUntil) { event.preventDefault(); return; }
      const at = page.scrollTop, list = targets();
      const next = event.deltaY > 0 ? list.find((v) => v > at + 2) : [...list].reverse().find((v) => v < at - 2);
      if (next === undefined || Math.abs(next - at) > page.clientHeight) return;
      event.preventDefault();
      if (reducedMotion) { busyUntil = now + 300; page.scrollTo({ top: next }); return; }
      busyUntil = now + SNAP_GLIDE_MS + 150;
      glide(next);
    };
    page.addEventListener('wheel', onWheel, { passive: false });
    return () => { page.removeEventListener('wheel', onWheel); cancelAnimationFrame(frame); page.style.scrollSnapType = ''; };
  }, [reducedMotion]);

  /** The main button: on to the sunlight screen, or ask for a place first. */
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
        The first screen, laid out as a grid. `.landing` around it is the
        part that scrolls, carrying this and LandingMore under it.
      */}
      <div className="landing__screen">
      {/*
        One wrapper for the three parts that stack into one sheet on a phone.
        On a wide screen it steps out of the way (display: contents) and the
        three take their own places in the first screen's grid.
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

          {/*
            Polite: it answers a press, it does not interrupt one. Gone as
            soon as something is chosen: it would be answering nothing.
          */}
          <p className="landing__hint" aria-live="polite">
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
            <SourcesLink />
          </p>
          {when && <p className="landing__when">{when}</p>}
        </footer>
      </div>

      {/*
        The window onto the city. Transparent and deaf to the pointer, so the
        city under it is what gets dragged and clicked; only the map key and
        the credit in it answer.
      */}
      <div className="landing__window" ref={window_}>
        {loading && <Loading progress={loading.progress} error={loading.error} />}
        {!loading && (
          <MapKey className="landing__legend" />
        )}
        {credit}
      </div>
      </div>

      {/* The sections under the first screen, reached by scrolling. */}
      <LandingMore onExplore={onExplore} />
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

// ── the icons: an arrow for the ways in, a cross to clear, a pin for the chosen place

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
