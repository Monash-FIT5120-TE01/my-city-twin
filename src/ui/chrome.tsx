import { useEffect, useRef } from 'react';
import { bundled } from '../data/bundled';
import type { Development } from '../data/model';

/**
 * The credit Mapbox is owed for the map under the city.
 *
 * WHY IT IS HERE RATHER THAN ON THE IMAGE
 *   The Static Images API will draw its own logo and credit into the picture,
 *   and the request turns both off — because the picture is laid flat on the
 *   ground, where the words would be metres long, upside down half the time,
 *   and lit by whatever the sun is doing. Mapbox permits turning them off on
 *   exactly that condition: that the credit appears somewhere legible
 *   instead. This is that somewhere.
 *
 *   So this is not decoration and not a nicety. Removing it while the request
 *   still says logo=false puts the deployment in breach of the terms it is
 *   served under. If it has to go, the parameters in basemap.ts go with it.
 *
 * WHAT THE LINKS ARE
 *   OpenStreetMap is credited alongside Mapbox because the streets, the
 *   river and the parks in that image are OSM's data. "Improve this map" is
 *   required too, and is a real thing: it opens the editor at the place the
 *   reader is looking at.
 */
export function MapAttribution() {
  return (
    <div className="attribution">
      <a
        className="attribution__mark"
        href="https://www.mapbox.com/"
        target="_blank"
        rel="noreferrer"
      >
        {/* The wordmark as Mapbox ships it, not a redrawing of it. */}
        <img src={bundled('mapbox-logo.svg')} alt="Mapbox" width="62" height="16" />
      </a>
      <p className="attribution__text">
        <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">
          © Mapbox
        </a>{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap
        </a>{' '}
        <a href="https://apps.mapbox.com/feedback/" target="_blank" rel="noreferrer">
          Improve this map
        </a>
      </p>
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE HEADER BAR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT A HEADER IS FOR
 *   The things that are true on every screen, and nothing that belongs to
 *   one. Measured against that, it was carrying two controls it should not
 *   have been — and the argument for removing each is different.
 *
 *   SUNLIGHT & SHADOW is gone because it was never a destination. It needs a
 *   subject, so on arrival it was shown disabled with an explanation; and
 *   once there IS a subject, the panel it would open carries a Sunlight tab
 *   two inches below. It was a permanent control that spent most of its life
 *   inert and the rest of it duplicating something nearer to hand.
 *
 *   FOCUS MODE is gone because it is a view control, and the view controls
 *   live together in the bottom-right corner beside the zoom and the
 *   reframe. It also hides this bar, which makes a button that erases its
 *   own container an odd tenant of that container. It is the same action in
 *   a better place, not a smaller one.
 *
 *   WHERE YOU ARE went the same way, later and for the same reason. It read
 *   "Melbourne CBD" on the map — which the map already says — and became a
 *   back link inside a subject. By then every subject panel had grown its
 *   own back link at the top of itself, nearer the thing it returns from and
 *   naming where it goes, so the one up here was a second answer to a
 *   question already answered.
 *
 *   What is left is what survives the test: who this is, what you are
 *   looking for, and what the map is drawing.
 *
 * WHY THE SEARCH HAS A KEY
 *   It is the one control here somebody uses repeatedly, and reaching for a
 *   mouse to type is the kind of small tax that is only visible in aggregate.
 *   "/" is the convention, it needs no modifier, and the field says so — a
 *   shortcut nobody is told about is a shortcut for the person who wrote it.
 *
 * WHY THE LAYER BUTTON CAN CARRY A MARK
 *   Turning off shadows is invisible from outside the panel that turns them
 *   off. Somebody who does it, navigates away and comes back is looking at a
 *   city with no shadows in a product about shadows, with nothing on screen
 *   to say it was asked for. The mark is the difference between "broken" and
 *   "you turned that off".
 */
export function Header({
  query,
  onQuery,
  layersOpen,
  layersHidden,
  onLayers,
  onHome,
  children,
}: {
  query: string;
  onQuery: (next: string) => void;
  layersOpen: boolean;
  /** How many layers are switched off, if any. */
  layersHidden: number;
  onLayers: () => void;
  onHome: () => void;
  /** The search results, rendered by the caller under the field. */
  children?: React.ReactNode;
}) {
  const field = useRef<HTMLInputElement>(null);

  /*
   * "/" puts the cursor in the search, unless something is already being
   * typed into.
   *
   * The guard is the whole of it: without it, every slash anybody types into
   * the date field or an address becomes a jump to the search box, which is
   * a far worse problem than the one the shortcut solves.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      event.preventDefault();
      field.current?.focus();
      field.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="header">
      <button
        type="button"
        className="header__brand"
        onClick={onHome}
        /*
          Named explicitly, because the visible name is not always visible:
          the word is hidden on a narrow screen and the mark beside it is
          aria-hidden, which left the button with no name at all.
        */
        aria-label="My City Twin — home"
      >
        {/*
          Drawn rather than imported: two towers and a roofline, at the size
          it is actually used. An SVG at 26px costs less than a request and
          cannot arrive after the rest of the bar has painted.
        */}
        <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
          <path
            d="M3.5 22.5V9.2l6-3.4v3.1l6-3.4v17H3.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M15.5 22.5v-11l7 3.2v7.8h-7Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
        </svg>
        <span>My City Twin</span>
      </button>

      <div className="header__search">
        <label className="field">
          <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
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
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search a street or address"
            aria-label="Search for a street or address"
          />
          {/*
            Hidden once there is anything to read in the field, because by
            then it is behind the words and it has done its job.
          */}
          {!query && (
            <kbd className="field__key" aria-hidden="true">
              /
            </kbd>
          )}
        </label>
        {children}
      </div>

      <div className="header__actions">
        <button
          type="button"
          className="chip chip--icon"
          aria-pressed={layersOpen}
          onClick={onLayers}
        >
          <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
            {/* Three sheets seen edge-on: what the word means. */}
            <path
              d="M9 1.9 16.2 5.6 9 9.3 1.8 5.6 9 1.9Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path
              d="m2.6 9 6.4 3.3L15.4 9M2.6 12.4l6.4 3.3 6.4-3.3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Map layers
          {/*
            Said in words as well as drawn, because a dot on a button is a
            decoration until somebody works out what it counts.
          */}
          {layersHidden > 0 && (
            <span className="chip__count">
              {layersHidden}
              <span className="visually-hidden"> layers hidden</span>
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

export function StatusBadge({
  status,
  tone = 'solid',
}: {
  status: Development['status'];
  /**
   * How loudly to say it.
   *
   * A list of projects needs each status to be findable while scanning, so
   * there it is a filled pill. A subject's own header does not: the reader
   * is already looking at one project, and a filled pill above its name
   * outshouted the name. "soft" is the same word on a pale ground.
   *
   * Both spell the status out. Neither leans on the colour to say it, which
   * is what lets the quieter one stay readable.
   */
  tone?: 'solid' | 'soft';
}) {
  const construction = status === 'UNDER CONSTRUCTION';
  const variant = tone === 'soft' ? ' badge--soft' : construction ? ' badge--construction' : '';
  return <span className={`badge${variant}`}>{status}</span>;
}

/**
 * The one-line summary under a project's address.
 *
 * The design reads "Office + Retail · 46 storeys · 162 m". Storeys are only on
 * the details endpoint, so the line is built from what the footprint payload
 * actually carries and simply leaves out what it does not have — rather than
 * showing a plausible number nobody measured.
 */
export function developmentSummary(development: Development, storeys?: number): string {
  const uses = development.landUses
    .map((use) => use.useType)
    .filter((use, i, all) => all.indexOf(use) === i)
    .slice(0, 2)
    .join(' + ');

  const parts = [uses || 'Mixed use'];
  if (storeys && storeys > 0) parts.push(`${Math.round(storeys)} storeys`);
  parts.push(`${development.maxHeightM.toFixed(0)} m`);
  return parts.join(' · ');
}

export function SunChip({
  timeLabel,
  compass,
  visible,
}: {
  timeLabel: string;
  compass: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <p className="sunchip">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="4.4" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line
            key={angle}
            x1="11"
            y1="2.6"
            x2="11"
            y2="5.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            transform={`rotate(${angle} 11 11)`}
          />
        ))}
      </svg>
      SUN {timeLabel} · FROM {compass}
    </p>
  );
}
