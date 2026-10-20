/*
 * ─────────────────────────────────────────────────────────────────────────
 * UNDER THE FRONT PAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   What the front page says once somebody scrolls past the window onto the
 *   city and the three steps, laid out after the team's redesign
 *   (2026-10-20). LandingPage puts it under its first screen, inside the same
 *   scrolling page.
 *
 * WHAT IS ON IT, TOP TO BOTTOM
 *   - The city in three numbers: walking, footpaths, canopy, with the sources
 *     folded under them.
 *   - About: what My City Twin is and what a digital twin is, beside the city
 *     film, with the three-step story under it.
 *   - Acknowledgement of Country.
 *   - The foot of the page: the mark, the fine print and "Back to top".
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
 */

import { useEffect, useRef } from 'react';
import { bundled } from '../data/bundled';
import { Icon, type IconName } from './kit/Icon';
import { CountUp } from './kit/CountUp';
import { DemoNote } from './kit/DemoNote';
import '../styles/landing-more.css';
import { useT } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';

/*
 * The two documents the numbers are read from. `#page=` is the PDF's own
 * page count, not the printed folio: printed p. 39 of the Transport
 * Strategy is the PDF's page 21.
 */
const TRANSPORT_PDF =
  'https://www.melbourne.vic.gov.au/media-files/2024-05/transport-strategy-2030-city-of-melbourne.pdf#page=21';
const URBAN_FOREST_PDF =
  'https://www.melbourne.vic.gov.au/media-files/2024-07/urban-forest-strategy.pdf#page=7';

/** How the digital city works, in three steps under the About band. */
const STORY: readonly { icon: IconName; title: MessageKey; body: MessageKey }[] = [
  { icon: 'location_on', title: 'landing.about.realTitle', body: 'landing.about.realBody' },
  { icon: 'layers', title: 'landing.about.modelTitle', body: 'landing.about.modelBody' },
  { icon: 'visibility', title: 'landing.about.perspectiveTitle', body: 'landing.about.perspectiveBody' },
];

/**
 * The city film in the About band: new towers, rooftop solar and moving
 * sunlight, looping without sound. It plays only while it is on screen, and
 * not at all under a reduced-motion preference (the poster stands in) —
 * App's, which follows the preference if it changes while the page is open.
 */
function CityFilm({ still }: { still: boolean }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const film = video.current;
    if (!film) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !still) film.play().catch(() => undefined);
        else film.pause();
      },
      { threshold: 0.2 },
    );
    observer.observe(film);
    return () => {
      observer.disconnect();
      film.pause();
    };
  }, [still]);
  return (
    <div className="more__city-film">
      <video
        ref={video}
        src={bundled('landing/city-perspectives-v2.mp4')}
        poster={bundled('landing/city-perspectives-v2-poster.png')}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={t('landing.about.filmLabel')}
      />
      <span className="more__film-caption">{t('landing.about.blockLabel')}</span>
    </div>
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

/** How long "Back to top" takes to get there, ms. */
const BACK_TO_TOP_MS = 1100;

/**
 * The sections under the front page's first screen. `onExplore` is the
 * same "explore the city" the first screen offers, for the button in About.
 */
export function LandingMore({ onExplore, reducedMotion = false }: { onExplore: () => void; reducedMotion?: boolean }) {
  const t = useT();
  /** Stops a "Back to top" glide still running: a wheel or a finger takes over, or the page goes. */
  const stopGlide = useRef<(() => void) | null>(null);
  useEffect(() => () => stopGlide.current?.(), []);

  /*
   * Up to the top of the page, eased; at once under a reduced-motion
   * preference. The keyboard goes with the eye, to the page's heading:
   * left on this button, the next Tab went on from the foot of the page.
   */
  const backToTop = (from: HTMLElement) => {
    stopGlide.current?.();
    const page = from.closest<HTMLElement>('.landing');
    if (!page) return;
    document.getElementById('landing-title')?.focus({ preventScroll: true });
    if (reducedMotion) {
      page.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    const start = page.scrollTop, began = performance.now();
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      page.removeEventListener('wheel', finish);
      page.removeEventListener('touchstart', finish);
      stopGlide.current = null;
    };
    stopGlide.current = finish;
    page.addEventListener('wheel', finish, { passive: true });
    page.addEventListener('touchstart', finish, { passive: true });
    const step = (now: number) => {
      const u = Math.min(1, (now - began) / BACK_TO_TOP_MS);
      const eased = u * u * u * (u * (u * 6 - 15) + 10);   // smootherstep
      page.scrollTop = start * (1 - eased);
      if (u < 1) frame = requestAnimationFrame(step);
      else finish();
    };
    frame = requestAnimationFrame(step);
  };

  return (
    <div className="more">
      {/* ── the city behind the map ─────────────────────────────── */}
      <section className="more__section more__numbers" aria-labelledby="numbers-title">
        <p className="more__pill">{t('landing.numbers.pill')}</p>
        <h2 className="more__title" id="numbers-title">
          {t('landing.numbers.title')}
        </h2>

        <div className="more__figures">
          <article className="more__walk">
            <div>
              <p className="more__kicker more__kicker--light">{t('landing.numbers.walkKicker')}</p>
              <p className="more__big"><CountUp value={89} suffix="%" /></p>
              <p className="more__walk-words">
                {t('landing.numbers.walkWords')}
              </p>
            </div>
          </article>

          <article className="more__fact more__fact--street">
            <p className="more__mid"><CountUp value={26} suffix="%" /></p>
            <div>
              <p className="more__fact-words">{t('landing.numbers.streetWords')}</p>
            </div>
          </article>

          <article className="more__fact more__fact--canopy">
            <p className="more__mid"><CountUp value={40} suffix="%" /></p>
            <div>
              <p className="more__fact-words">
                {t('landing.numbers.canopyWords')}
              </p>
            </div>
          </article>
        </div>

        {/* The sources, folded: one press away for whoever wants to check a number. */}
        <details className="more__source-details">
          <summary>{t('landing.numbers.sources')}</summary>
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
        </details>
      </section>

      {/* ── about ───────────────────────────────────────────────── */}
      <section className="more__band more__about" id="landing-about" aria-labelledby="about-title">
        <div className="more__about-words">
          <p className="more__kicker more__kicker--light">{t('landing.about.kicker')}</p>
          <h2 className="more__title more__title--light" id="about-title">
            <span>{t('landing.about.titleLine1')}</span>
            <span>{t('landing.about.titleLine2')}</span>
          </h2>
          <p className="more__lead more__lead--light">
            {t('landing.about.lead')}
          </p>
          <p className="more__about-explainer">
            <Term text={t('landing.about.explainer')} term={t('landing.about.term')} />
          </p>
          <p className="more__about-explainer">
            {t('landing.about.uses')}
          </p>
          <button type="button" className="more__about-explore" onClick={onExplore}>
            {t('landing.hero.exploreCbd')}
          </button>
        </div>
        <CityFilm still={reducedMotion} />
        <ol className="more__twin-story" aria-label={t('landing.about.storyLabel')}>
          {STORY.map((part) => (
            <li key={part.title}>
              <Icon name={part.icon} size={30} />
              <div>
                <h3>{t(part.title)}</h3>
                <p>{t(part.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── acknowledgement of country ──────────────────────────── */}
      <section className="more__country" aria-labelledby="country-title">
        <h2 id="country-title">{t('landing.country.title')}</h2>
        <p>{t('landing.country.words')}</p>
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
          <DemoNote />
        </div>
        <div className="more__back-top-row">
          <button type="button" className="more__back-top" onClick={(event) => backToTop(event.currentTarget)}>
            {t('landing.footer.backToTop')} <span aria-hidden="true">↑</span>
          </button>
        </div>
        <div>
          <p className="more__motto">{t('landing.footer.motto')}</p>
          <p className="more__fine">{t('landing.footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
}

/** A sentence with one {term} in it, the term in bold: where it falls is the language's to say. */
function Term({ text, term }: { text: string; term: string }) {
  const [before, after = ''] = text.split('{term}');
  return (
    <>
      {before}
      <strong>{term}</strong>
      {after}
    </>
  );
}
