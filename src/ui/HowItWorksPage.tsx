/*
 * ─────────────────────────────────────────────────────────────────────────
 * HOW IT WORKS — THE APP IN THREE STEPS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The page the header's "How it works" opens (design: Figma "05 — How it
 *   works"). A cream page over the city, under the header, that scrolls.
 *
 * WHAT IS ON IT
 *   - The title, the line under it, and the skyline being drawn.
 *   - Three steps, each a picture with a number, a heading and a sentence:
 *       01 Find any building     — a searched building, outlined
 *       02 Follow the sun        — a project's shadow, a spot measured
 *       03 Compare the change    — today beside the planned neighbourhood
 *     The pictures are photographs of the app itself (scripts/how-images.mjs),
 *     so they show the colours the map really uses. The map's credit is
 *     printed under them, since a cropped picture loses the corner it sat in.
 *   - Step 02 shows the date, hour and season the app is set to now, in the
 *     chips the sunlight screen uses for them.
 *   - The key to the map. The design's "In progress" colour is left out: the
 *     model draws approved projects one way whatever their stage. In its
 *     place, the pink a searched building is drawn in. "Selected" is the
 *     outline, shown as an outline — told apart by shape, not hue.
 *   - "Explore the city", and "Back to sunlight" when a place is chosen.
 *   - The fine print and the sources.
 *
 * WHAT IT HOLDS
 *   Nothing. The moment and where the buttons go are App's.
 */

import { useEffect, useRef } from 'react';
import { bundled } from '../data/bundled';
import { SkylineFilm } from './LandingPage';
import { SourcesLink } from './Sources';
import '../styles/how.css';

/** The map's credit, for the photographs of it. */
const MAP_CREDIT = '© Mapbox © OpenStreetMap';

export function HowItWorksPage({
  dateText,
  timeText,
  season,
  reducedMotion,
  onExplore,
  onBack,
}: {
  /** "21 June 2026" — the date the app is set to. */
  dateText: string;
  /** "12:00 pm". */
  timeText: string;
  /** "Winter". */
  season: string;
  reducedMotion: boolean;
  onExplore: () => void;
  /** Back to the sunlight screen; absent when no place has been chosen yet. */
  onBack?: () => void;
}) {
  /*
   * Arriving, the keyboard is given the page's heading — the header link
   * that brought it here stays, but the page it pointed at is this one.
   */
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="how" aria-labelledby="how-title">
      <div className="how__inner">
        <div className="how__head">
          <div>
            <h1 className="how__title" id="how-title" ref={heading} tabIndex={-1}>
              Your city, understood.
            </h1>
            <p className="how__lede">Find a building. Follow the sun. Compare what changes.</p>
          </div>
          <div className="how__film">
            <SkylineFilm reducedMotion={reducedMotion} />
          </div>
        </div>

        <ol className="how__steps">
          <li className="how__step">
            <figure className="how__picture">
              <img src={bundled('how/find.jpg')} alt="A building in the city model, outlined after a search." />
              <span className="how__chip how__chip--search">
                <SearchIcon />
                25-45 Collins Street
              </span>
            </figure>
            <div className="how__words">
              <span className="how__number" aria-hidden="true">01</span>
              <h2 className="how__step-title">Find any building</h2>
              <p>Search an address to open its page. Or explore the map and double-click any building.</p>
            </div>
          </li>

          <li className="how__step">
            <figure className="how__picture">
              <img
                src={bundled('how/sun.jpg')}
                alt="A tower's shadow on the street, with a spot ringed on the ground beside it."
              />
            </figure>
            <div className="how__words">
              <span className="how__number" aria-hidden="true">02</span>
              <h2 className="how__step-title">Follow the sun</h2>
              <p>Set a date and time, then choose a spot on the ground.</p>
              {/* What the app is set to now — not a control here, a picture of one. */}
              <p className="how__when" aria-label={`Set to ${dateText}, ${timeText}, ${season}`}>
                <span>{dateText}</span>
                <span>{timeText}</span>
                <span>{season}</span>
              </p>
            </div>
          </li>

          <li className="how__step">
            <div className="how__pair">
              <figure className="how__picture">
                <img src={bundled('how/today.jpg')} alt="The neighbourhood as it stands today." />
                <figcaption className="how__chip">Today</figcaption>
              </figure>
              <figure className="how__picture">
                <img
                  src={bundled('how/after.jpg')}
                  alt="The same view with the approved projects built."
                />
                <figcaption className="how__chip">After planned projects are built</figcaption>
              </figure>
            </div>
            <div className="how__words">
              <span className="how__number" aria-hidden="true">03</span>
              <h2 className="how__step-title">Compare the change</h2>
              <p>
                Choose Compare side by side. See today beside the future neighbourhood, with linked
                views.
              </p>
            </div>
          </li>
        </ol>

        <p className="how__credit">Map pictures {MAP_CREDIT}</p>

        <div className="how__legend">
          <span className="how__legend-title">Read the map legend</span>
          <span className="how__key">
            <span className="how__swatch how__swatch--existing" aria-hidden="true" />
            Existing
          </span>
          <span className="how__key">
            <span className="how__swatch how__swatch--approved" aria-hidden="true" />
            Approved
          </span>
          <span className="how__key">
            <span className="how__swatch how__swatch--searched" aria-hidden="true" />
            Searched building
          </span>
          <span className="how__key">
            <span className="how__swatch how__swatch--selected" aria-hidden="true" />
            Selected
          </span>
          <span className="how__legend-note">Double-click any building to open it.</span>
        </div>

        <div className="how__actions">
          <button type="button" className="button how__explore" onClick={onExplore}>
            Explore the city <span aria-hidden="true">→</span>
          </button>
          {onBack && (
            <button type="button" className="button how__back" onClick={onBack}>
              Back to sunlight
            </button>
          )}
        </div>

        <footer className="how__foot">
          Illustrative model · Demo data
          <span aria-hidden="true">|</span>
          <SourcesLink />
        </footer>
      </div>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.2 9.2 12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
