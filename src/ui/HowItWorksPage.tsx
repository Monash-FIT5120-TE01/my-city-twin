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
 *   - The key to the map: existing, approved, in progress (under
 *     construction), the pink a searched building is drawn in, and
 *     "Selected", the outline, shown as an outline — told apart by shape,
 *     not hue.
 *   - "Explore the city", and "Back to sunlight" when a place is chosen.
 *   - The fine print and the sources.
 *
 * WHAT IT HOLDS
 *   Nothing. The moment and where the buttons go are App's.
 */

import { bundled } from '../data/bundled';
import { SkylineFilm } from './LandingPage';
import { Button } from './kit/Button';
import { Card } from './kit/Card';
import { DemoNote } from './kit/DemoNote';
import { MapKey } from './kit/MapKey';
import { PageHead } from './kit/PageHead';
import { Pill } from './kit/Pill';
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
  return (
    <section className="page how" aria-labelledby="how-title">
      <div className="how__inner">
        <div className="how__head">
          {/* The heading takes the keyboard on arrival (PageHead). */}
          <PageHead
            id="how-title"
            title="Your city, understood."
            lede="Find a building. Follow the sun. Compare what changes."
          />
          <div className="how__film">
            <SkylineFilm reducedMotion={reducedMotion} />
          </div>
        </div>

        <ol className="how__steps">
          <Card as="li" className="how__step">
            <figure className="how__picture">
              <img src={bundled('how/find.jpg')} alt="A building in the city model, outlined after a search." />
              <Pill size="xs" className="how__chip">
                <SearchIcon />
                25-45 Collins Street
              </Pill>
            </figure>
            <div className="how__words">
              <span className="how__number" aria-hidden="true">01</span>
              <h2 className="card-title how__step-title">Find any building</h2>
              <p>Search an address to open its page. Or explore the map and double-click any building.</p>
            </div>
          </Card>

          <Card as="li" className="how__step">
            <figure className="how__picture">
              <img
                src={bundled('how/sun.jpg')}
                alt="A tower's shadow on the street, with a spot ringed on the ground beside it."
              />
            </figure>
            <div className="how__words">
              <span className="how__number" aria-hidden="true">02</span>
              <h2 className="card-title how__step-title">Follow the sun</h2>
              <p>Set a date and time, then choose a spot on the ground.</p>
              {/* What the app is set to now — not a control here, a picture of one. */}
              <p className="how__when" aria-label={`Set to ${dateText}, ${timeText}, ${season}`}>
                <span>{dateText}</span>
                <span>{timeText}</span>
                <span>{season}</span>
              </p>
            </div>
          </Card>

          <Card as="li" className="how__step">
            <div className="how__pair">
              <figure className="how__picture">
                <img src={bundled('how/today.jpg')} alt="The neighbourhood as it stands today." />
                <Pill as="figcaption" size="xs" className="how__chip">
                  Today
                </Pill>
              </figure>
              <figure className="how__picture">
                <img
                  src={bundled('how/after.jpg')}
                  alt="The same view with the approved projects built."
                />
                <Pill as="figcaption" size="xs" className="how__chip">
                  After planned projects are built
                </Pill>
              </figure>
            </div>
            <div className="how__words">
              <span className="how__number" aria-hidden="true">03</span>
              <h2 className="card-title how__step-title">Compare the change</h2>
              <p>
                Choose Compare side by side. See today beside the future neighbourhood, with linked
                views.
              </p>
            </div>
          </Card>
        </ol>

        <p className="how__credit">Map pictures {MAP_CREDIT}</p>

        <Card className="how__legend">
          <MapKey full title="Read the map legend" note="Double-click any building to open it." />
        </Card>

        <div className="how__actions">
          <Button size="lg" arrow onClick={onExplore}>
            Explore the city
          </Button>
          {onBack && (
            <Button variant="secondary" size="lg" onClick={onBack}>
              Back to sunlight
            </Button>
          )}
        </div>

        <footer className="how__foot">
          <DemoNote />
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
