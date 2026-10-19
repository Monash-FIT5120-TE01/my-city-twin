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
import { Icon } from './kit/Icon';
import { CountUp } from './kit/CountUp';
import '../styles/landing-more.css';
import { useT } from '../i18n/i18n';

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
  const t = useT();
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
      <span className="more__block-label">{t('landing.about.blockLabel')}</span>
    </div>
  );
}

/** The arrow on the last button, at the design's weight. */
function Arrow() {
  return (
    <Icon name="arrow_forward" size={24} />
  );
}

/** A link to a source PDF that says, to a screen reader, where it goes. */
function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  const t = useT();
  return (
    // A new tab: leaving would throw away the date, the hour and the place.
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
      <span className="visually-hidden"> {t('landing.numbers.pdfNewTab')}</span>
    </a>
  );
}

/**
 * The sections under the front page's first screen. `onExplore` is the
 * same "explore the city" the first screen offers, for the last button.
 */
export function LandingMore({ onExplore }: { onExplore: () => void }) {
  const t = useT();
  return (
    <div className="more">
      {/* ── the city behind the map ─────────────────────────────── */}
      <section className="more__section more__numbers" aria-labelledby="numbers-title">
        <p className="more__pill">{t('landing.numbers.pill')}</p>
        <h2 className="more__title" id="numbers-title">
          {t('landing.numbers.title')}
        </h2>
        <p className="more__lead">
          {t('landing.numbers.lead')}
        </p>

        <div className="more__figures">
          <article className="more__walk">
            <div>
              <p className="more__kicker more__kicker--light">{t('landing.numbers.walkKicker')}</p>
              <p className="more__big"><CountUp value={89} suffix="%" /></p>
              <p className="more__walk-words">
                {t('landing.numbers.walkWords')}
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
            <p className="more__mid"><CountUp value={26} suffix="%" /></p>
            <div>
              <p className="more__fact-words">{t('landing.numbers.streetWords')}</p>
              <p className="more__fact-note">{t('landing.numbers.streetNote')}</p>
            </div>
          </article>

          <article className="more__fact more__fact--canopy">
            <p className="more__mid"><CountUp value={40} suffix="%" /></p>
            <div>
              <p className="more__fact-words">
                {t('landing.numbers.canopyWords')}
              </p>
              <p className="more__fact-note">{t('landing.numbers.canopyNote')}</p>
            </div>
          </article>
        </div>

        <p className="more__source">
          <span className="more__kicker">City of Melbourne</span>
          <span>
            <SourceLink href={TRANSPORT_PDF}>{t('landing.numbers.sourcePage', { document: 'Transport Strategy 2030 (2019)', page: 39 })}</SourceLink>
            {' · '}
            <SourceLink href={URBAN_FOREST_PDF}>{t('landing.numbers.sourcePage', { document: 'Urban Forest Strategy 2012–2032', page: 7 })}</SourceLink>
          </span>
        </p>
        <p className="more__scope">
          {t('landing.numbers.scope')}
        </p>
      </section>

      {/* ── about ───────────────────────────────────────────────── */}
      <section className="more__band more__about" aria-labelledby="about-title">
        <div className="more__about-words">
          <p className="more__kicker more__kicker--light">{t('landing.about.kicker')}</p>
          <h2 className="more__title more__title--light" id="about-title">
            <span>{t('landing.about.titleLine1')}</span>
            <span>{t('landing.about.titleLine2')}</span>
          </h2>
          <p className="more__lead more__lead--light">
            {t('landing.about.lead')}
          </p>
        </div>
        <CityBlock />
      </section>

      {/* ── before you explore ──────────────────────────────────── */}
      <section className="more__section" aria-labelledby="before-title">
        <p className="more__kicker">{t('landing.before.kicker')}</p>
        <h2 className="more__title" id="before-title">
          {t('landing.before.title')}
        </h2>
        <p className="more__lead">{t('landing.before.lead')}</p>

        <ol className="more__three" role="list">
          <li>
            <span className="more__index" aria-hidden="true">
              01
            </span>
            <h3>{t('landing.before.discoverTitle')}</h3>
            <p>
              {t('landing.before.discoverBody')}
            </p>
          </li>
          <li>
            <span className="more__index" aria-hidden="true">
              02
            </span>
            <h3>{t('landing.before.readTitle')}</h3>
            <p>
              {t('landing.before.readBody')}
            </p>
          </li>
          <li>
            <span className="more__index" aria-hidden="true">
              03
            </span>
            <h3>{t('landing.before.numbersTitle')}</h3>
            <p>
              {t('landing.before.numbersBody')}
            </p>
          </li>
        </ol>
      </section>

      {/* ── acknowledgement of country ──────────────────────────── */}
      <section className="more__band more__country" aria-labelledby="country-title">
        <p className="more__kicker more__kicker--dash">{t('landing.country.kicker')}</p>
        <h2 className="more__title more__title--small" id="country-title">
          {t('landing.country.title')}
        </h2>
        <p className="more__country-words">
          {t('landing.country.words')}
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
        <p className="more__kicker more__kicker--pale">{t('landing.future.kicker')}</p>
        <h2 className="more__title more__title--light" id="future-title">
          {t('landing.future.title')}
        </h2>
        <p className="more__lead more__lead--pale">
          {t('landing.future.lead')}
        </p>
        <ol className="more__cards" role="list">
          <li>
            <p className="more__kicker more__kicker--pale">{t('landing.future.plansKicker')}</p>
            <h3>{t('landing.future.plansTitle')}</h3>
            <p>
              {t('landing.future.plansBody')}
            </p>
          </li>
          <li>
            <p className="more__kicker more__kicker--pale">{t('landing.future.personalKicker')}</p>
            <h3>{t('landing.future.personalTitle')}</h3>
            <p>
              {t('landing.future.personalBody')}
            </p>
          </li>
          <li>
            <p className="more__kicker more__kicker--pale">{t('landing.future.evidenceKicker')}</p>
            <h3>{t('landing.future.evidenceTitle')}</h3>
            <p>{t('landing.future.evidenceBody')}</p>
          </li>
        </ol>
        <p className="more__lead more__lead--pale">
          {t('landing.future.question')}
        </p>
      </section>

      {/* ── the way back in ─────────────────────────────────────── */}
      <section className="more__band more__cta" aria-labelledby="cta-title">
        <div>
          <p className="more__kicker more__kicker--light">{t('landing.cta.kicker')}</p>
          <h2 className="more__title more__title--light more__title--cta" id="cta-title">
            {t('landing.cta.title')}
          </h2>
          <p className="more__lead more__lead--light">{t('landing.cta.lead')}</p>
        </div>
        <div className="more__cta-rings" aria-hidden="true">
          <img src={bundled('landing/cta-ring-outer.svg')} alt="" width={207} height={207} />
          <img src={bundled('landing/cta-ring-inner.svg')} alt="" width={151} height={151} />
        </div>
        <button type="button" className="more__cta-button" onClick={onExplore}>
          {t('landing.cta.button')}
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
          <p className="more__fine">{t('landing.footer.tagline')}</p>
        </div>
        <div>
          <p className="more__motto">{t('landing.footer.motto')}</p>
          <p className="more__fine">{t('landing.footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
}
