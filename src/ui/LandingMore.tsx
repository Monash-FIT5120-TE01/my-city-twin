/*
 * ─────────────────────────────────────────────────────────────────────────
 * UNDER THE FRONT PAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   What the front page says once somebody scrolls past the window onto the
 *   city, in the order of the design (Figma "01 — Landing", the additional
 *   scroll sections). LandingPage puts it under its first screen, inside the
 *   same scrolling page.
 *
 * WHAT IS ON IT, TOP TO BOTTOM
 *   - The city in three numbers: walking, footpaths, canopy, with sources.
 *   - About: what My City Twin is, beside the drawn city block.
 *   - Before you explore: what it shows, how to read it, where the numbers
 *     come from.
 *   - Acknowledgement of Country.
 *   - Future work: the ideas not built yet. "Future plans" in the header
 *     scrolls here.
 *   - The way back in: one button into the city.
 *   - The foot of the page: the mark, the name and the fine print.
 *
 * THE NUMBERS AND WHERE THEY COME FROM
 *   The three figures are the only claims on this page that did not come
 *   out of the model, so each was read off the City of Melbourne's own
 *   document before it went here, and each cites the page it is on:
 *
 *     89%  "Overall, 89 per cent of trips within the Hoddle Grid are made
 *          on foot." Transport Strategy 2030, p. 39.
 *     26%  "...26 per cent to footpaths." The same page — and the body text
 *          says this is street space in the MUNICIPALITY, not only the
 *          Hoddle Grid, so it is not labelled as the grid's.
 *     40%  "Increase public realm canopy cover from 22% at present to 40%
 *          by 2040." Urban Forest Strategy 2012–2032, p. 7. A target, for
 *          public streets and parks — not a measurement, and not the whole
 *          city's canopy, which the same document puts far lower.
 *
 *   The design's words were kept where the source supports them and
 *   changed where it does not: "Hoddle Grid" for the street-space figure is
 *   the one that went.
 *
 * THE DRAWINGS
 *   The walking route, the city block and the rings round the last button
 *   are the design's own SVGs, in public/landing, placed where the design
 *   places them. The flat shapes behind the text — the cards, the bands,
 *   the rules — are drawn in CSS from the design's colours, so they reflow
 *   with the window instead of being stretched pictures of rectangles.
 */

import { bundled } from '../data/bundled';
import '../styles/landing-more.css';

/** Where the "Future plans" link in the header goes. */
export const FUTURE_PLANS_ID = 'future-plans';

/*
 * The two documents the numbers are read from. `#page=` is the PDF's own
 * page count, not the printed folio: printed p. 39 of the Transport
 * Strategy is the PDF's page 21.
 */
const TRANSPORT_PDF =
  'https://www.melbourne.vic.gov.au/media-files/2024-05/transport-strategy-2030-city-of-melbourne.pdf#page=21';
const URBAN_FOREST_PDF =
  'https://www.melbourne.vic.gov.au/media-files/2024-07/urban-forest-strategy.pdf#page=7';

/**
 * The isometric city block, as the design builds it: eighteen drawings
 * placed on a 512 × 408 board. Positions are the design's, in board pixels;
 * each drawing keeps its own size, and the board scales as one.
 */
const BLOCK: { file: number; x: number; y: number; w: number; h: number }[] = [
  { file: 6, x: 3, y: 250, w: 506, h: 104 },
  { file: 7, x: 0, y: 140, w: 512, h: 247 },
  { file: 8, x: 19.32, y: 158.66, w: 421.36, h: 214.674 },
  { file: 9, x: 103, y: 104, w: 90, h: 46 },
  { file: 10, x: 103, y: 127, w: 45, h: 93 },
  { file: 11, x: 148, y: 127, w: 45, h: 93 },
  { file: 12, x: 216, y: 0, w: 90, h: 46 },
  { file: 13, x: 216, y: 23, w: 45, h: 161 },
  { file: 14, x: 261, y: 23, w: 45, h: 161 },
  { file: 15, x: 326, y: 116, w: 90, h: 46 },
  { file: 16, x: 326, y: 139, w: 45, h: 133 },
  { file: 17, x: 371, y: 139, w: 45, h: 133 },
  { file: 18, x: 216, y: 188, w: 90, h: 46 },
  { file: 19, x: 216, y: 211, w: 45, h: 87 },
  { file: 20, x: 261, y: 211, w: 45, h: 87 },
  { file: 21, x: 373, y: 72, w: 86, h: 86 },
  { file: 22, x: 331.5, y: 30.5, w: 169, h: 169 },
  { file: 23, x: 2, y: 374, w: 230, h: 34 },
];
const BOARD_W = 512;
const BOARD_H = 408;

/**
 * The drawn city block in the About band. Each drawing is placed in
 * percentages of the board, so the whole block scales with its column.
 * Decorative: the words beside it say what it shows.
 */
function CityBlock() {
  return (
    <div className="more__block" aria-hidden="true">
      {BLOCK.map(({ file, x, y, w, h }) => (
        <img
          key={file}
          src={bundled(`landing/block-${file}.svg`)}
          alt=""
          width={w}
          height={h}
          style={{
            left: `${(x / BOARD_W) * 100}%`,
            top: `${(y / BOARD_H) * 100}%`,
            width: `${(w / BOARD_W) * 100}%`,
          }}
        />
      ))}
      <span className="more__block-label">Melbourne, reimagined</span>
    </div>
  );
}

/** The arrow on the last button, at the design's weight. */
function Arrow() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      <path
        d="M1 8h19M13 1.5 20 8l-7 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A link to a source PDF that says, to a screen reader, where it goes. */
function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    // A new tab: leaving would throw away the date, the hour and the place.
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
      <span className="visually-hidden"> (PDF, opens in a new tab)</span>
    </a>
  );
}

/**
 * The sections under the front page's first screen. `onExplore` is the
 * same "explore the city" the first screen offers, for the last button.
 */
export function LandingMore({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="more">
      {/* ── the city behind the map ─────────────────────────────── */}
      <section className="more__section more__numbers" aria-labelledby="numbers-title">
        <p className="more__pill">The city behind the map</p>
        <h2 className="more__title" id="numbers-title">
          Big changes. Everyday places.
        </h2>
        <p className="more__lead">
          A closer look at the streets we share — and the future we’re shaping.
        </p>

        <div className="more__figures">
          <article className="more__walk">
            <div>
              <p className="more__kicker more__kicker--light">A city on foot</p>
              <p className="more__big">89%</p>
              <p className="more__walk-words">
                of trips within the Hoddle Grid are made on foot.
              </p>
            </div>
            <img
              className="more__walk-art"
              src={bundled('landing/walking-route.svg')}
              alt=""
              width={186}
              height={198}
            />
          </article>

          <article className="more__fact more__fact--street">
            <p className="more__mid">26%</p>
            <div>
              <p className="more__fact-words">of street space is allocated to footpaths.</p>
              <p className="more__fact-note">Room to move. Room to belong.</p>
            </div>
          </article>

          <article className="more__fact more__fact--canopy">
            <p className="more__mid">40%</p>
            <div>
              <p className="more__fact-words">
                canopy cover of public streets and parks by 2040, up from 22%.
              </p>
              <p className="more__fact-note">A greener chapter ahead.</p>
            </div>
          </article>
        </div>

        <p className="more__source">
          <span className="more__kicker">City of Melbourne</span>
          <span>
            <SourceLink href={TRANSPORT_PDF}>Transport Strategy 2030 (2019), p. 39</SourceLink>
            {' · '}
            <SourceLink href={URBAN_FOREST_PDF}>Urban Forest Strategy 2012–2032, p. 7</SourceLink>
          </span>
        </p>
        <p className="more__scope">
          Walking: trips within the Hoddle Grid. Street space: across the municipality. Canopy: a
          2040 target for public streets and parks across the municipality.
        </p>
      </section>

      {/* ── about ───────────────────────────────────────────────── */}
      <section className="more__band more__about" aria-labelledby="about-title">
        <div className="more__about-words">
          <p className="more__kicker more__kicker--light">01 / About us</p>
          <h2 className="more__title more__title--light" id="about-title">
            <span>Your city.</span>
            <span>A new perspective.</span>
          </h2>
          <p className="more__lead more__lead--light">
            My City Twin makes urban change easier to explore. See nearby developments, compare
            sunlight, and connect the map with the places that matter to you.
          </p>
        </div>
        <CityBlock />
      </section>

      {/* ── before you explore ──────────────────────────────────── */}
      <section className="more__section" aria-labelledby="before-title">
        <p className="more__kicker">02 / Before you explore</p>
        <h2 className="more__title" id="before-title">
          Curiosity starts here.
        </h2>
        <p className="more__lead">A little context for a clearer view.</p>

        <ol className="more__three" role="list">
          <li>
            <span className="more__index" aria-hidden="true">
              01
            </span>
            <h3>What can I discover?</h3>
            <p>
              Explore buildings and developments. Compare sunlight at a selected date and time.
              Start with an address, or simply follow your curiosity.
            </p>
          </li>
          <li>
            <span className="more__index" aria-hidden="true">
              02
            </span>
            <h3>How should I read it?</h3>
            <p>
              An illustrative model using demo data. Shadow views show possibilities; they are not
              predictions or a formal planning assessment.
            </p>
          </li>
          <li>
            <span className="more__index" aria-hidden="true">
              03
            </span>
            <h3>What’s behind the numbers?</h3>
            <p>
              City of Melbourne strategies inform the facts above. Source dates and geographic
              scope help you understand what each number actually represents.
            </p>
          </li>
        </ol>
      </section>

      {/* ── acknowledgement of country ──────────────────────────── */}
      <section className="more__band more__country" aria-labelledby="country-title">
        <p className="more__kicker more__kicker--dash">Acknowledgement of Country</p>
        <h2 className="more__title more__title--small" id="country-title">
          A continuing connection to place.
        </h2>
        <p className="more__country-words">
          My City Twin acknowledges the Wurundjeri Woi-wurrung and Bunurong Boon Wurrung peoples of
          the Eastern Kulin Nation, whose Country includes Melbourne. We honour their enduring
          relationships with land, waters and community, and respectfully recognise Elders, past
          and present.
        </p>
      </section>

      {/*
        ── future work ─────────────────────────────────────────────
        Focusable so "Future plans" in the header can move the keyboard here
        as well as the eye; -1 keeps it out of the tab order.
      */}
      <section
        className="more__band more__future"
        id={FUTURE_PLANS_ID}
        tabIndex={-1}
        aria-labelledby="future-title"
      >
        <p className="more__kicker more__kicker--pale">Future work</p>
        <h2 className="more__title more__title--light" id="future-title">
          The next chapter of My City Twin.
        </h2>
        <p className="more__lead more__lead--pale">
          Ideas we want to develop next — proposed features, not available yet.
        </p>
        <ol className="more__cards" role="list">
          <li>
            <p className="more__kicker more__kicker--pale">01 / More plans</p>
            <h3>Follow the change.</h3>
            <p>
              Bring together approval documents, project stages and source dates, so the status is
              easier to understand.
            </p>
          </li>
          <li>
            <p className="more__kicker more__kicker--pale">02 / Your everyday life</p>
            <h3>Make it personal.</h3>
            <p>
              Choose what matters to you: walking, access, public space or disruption during
              construction.
            </p>
          </li>
          <li>
            <p className="more__kicker more__kicker--pale">03 / Better evidence</p>
            <h3>Compare with confidence.</h3>
            <p>Add validated before-and-after measures, clear assumptions and visible uncertainty.</p>
          </li>
        </ol>
        <p className="more__lead more__lead--pale">
          Built around one question: how will a changing city affect your day?
        </p>
      </section>

      {/* ── the way back in ─────────────────────────────────────── */}
      <section className="more__band more__cta" aria-labelledby="cta-title">
        <div>
          <p className="more__kicker more__kicker--light">Your next chapter starts here</p>
          <h2 className="more__title more__title--light more__title--cta" id="cta-title">
            Find your place in the city’s future.
          </h2>
          <p className="more__lead more__lead--light">A familiar street. Something new to discover.</p>
        </div>
        <div className="more__cta-rings" aria-hidden="true">
          <img src={bundled('landing/cta-ring-outer.svg')} alt="" width={207} height={207} />
          <img src={bundled('landing/cta-ring-inner.svg')} alt="" width={151} height={151} />
        </div>
        <button type="button" className="more__cta-button" onClick={onExplore}>
          Explore the city
          <Arrow />
        </button>
      </section>

      {/* ── the foot of the page ────────────────────────────────── */}
      <footer className="more__footer">
        <div>
          <p className="more__brand">
            <span className="more__mark" aria-hidden="true">
              <img src={bundled('landing/mark-1.svg')} alt="" width={10} height={23} />
              <img src={bundled('landing/mark-2.svg')} alt="" width={10} height={33} />
              <img src={bundled('landing/mark-3.svg')} alt="" width={10} height={19} />
            </span>
            My City Twin
          </p>
          <p className="more__fine">Melbourne · An illustrative city model</p>
        </div>
        <div>
          <p className="more__motto">Made for a city in motion.</p>
          <p className="more__fine">© 2026 My City Twin · Prototype</p>
        </div>
      </footer>
    </div>
  );
}
