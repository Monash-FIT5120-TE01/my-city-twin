/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE FRAME AROUND THE CITY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The small pieces that are not a panel of their own but appear on many
 *   screens:
 *
 *   MapAttribution      the credit Mapbox and OpenStreetMap are owed.
 *   Header              the bar along the top: the name, the search, the
 *                       front page's links, VR and the layer button.
 *   StatusBadge         "APPROVED" / "UNDER CONSTRUCTION", spelt out.
 *   developmentSummary  the one line under a project's address.
 */

import { useEffect, useRef } from 'react';
import { bundled } from '../data/bundled';
import type { Development } from '../data/model';
import { SearchField } from './kit/SearchField';

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
 * TWO LOOKS
 *   The plain bar, with the layer button, on the explore, project and
 *   building screens. The front page's look — the page's cream, the links
 *   "Future plans", "Explore the city" and "How it works", and no layer
 *   button — on the front page and the sunlight screen (`front`, `nav`).
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
  onEnterVr,
  onSearchFocus,
  front = false,
  hideLayers = false,
  nav,
  children,
}: {
  /** The search text — App's, shared with the front page's own field. */
  query: string;
  onQuery: (next: string) => void;
  /** The layer panel is open; the button shows as pressed. */
  layersOpen: boolean;
  /** How many layers are switched off, if any. */
  layersHidden: number;
  onLayers: () => void;
  /** The name and mark: back to the front page. */
  onHome: () => void;
  /**
   * Present only where a headset session can actually start. On a desktop
   * there is nothing to enter, and a button that cannot do anything is
   * worse than no button.
   */
  onEnterVr?: () => void;
  /** The field here has the keyboard, so the results belong under it. */
  onSearchFocus?: () => void;
  /**
   * The front page's look, used on the front page and the sunlight screen:
   * the bar takes the page's cream.
   */
  front?: boolean;
  /**
   * No layer button — on the front page only, where there is nothing for a
   * layer to change that the reader has asked about yet. The sunlight
   * screen keeps it: it is the only place shadows are switched on and off,
   * and its mark the only thing that says they were.
   */
  hideLayers?: boolean;
  /** The links set before the buttons on the right, where `front` is set. */
  nav?: React.ReactNode;
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
   *
   * WHICHEVER FIELD IS ON SCREEN. The front page has a field of its own, and
   * on a narrow screen it hides this one; focusing a hidden field swallowed
   * the key and did nothing. Every search field carries `data-search-field`,
   * and the first one that is actually laid out gets the cursor.
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
      const shown = [
        ...document.querySelectorAll<HTMLInputElement>('input[data-search-field]'),
      ].find((input) => input.offsetParent !== null && !input.disabled);
      if (!shown) return;
      event.preventDefault();
      shown.focus();
      shown.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className={`header${front ? ' header--front' : ''}`}>
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
        {/* The results (children) hang from the field — see SearchField. */}
        <SearchField
          ref={field}
          value={query}
          onChange={onQuery}
          onClear={() => {
            onQuery('');
            field.current?.focus();
          }}
          onFocus={onSearchFocus}
          shortcut
          dropdown={children}
        />
      </div>

      <div className="header__actions">
        {nav}
        {onEnterVr && (
          /*
           * The handler must BE the call — see xrStore.ts. Nothing may be
           * awaited or confirmed in front of it, or the session never opens.
           */
          <button type="button" className="chip chip--icon" onClick={onEnterVr}>
            <svg width="18" height="17" viewBox="0 0 18 17" aria-hidden="true">
              {/* A headset seen from the front: the visor and the two lenses. */}
              <path
                d="M2 5.2c0-1 .8-1.7 1.7-1.7h10.6c1 0 1.7.8 1.7 1.7v5.3c0 1-.8 1.7-1.7 1.7h-2.9L9.9 10.4a1.1 1.1 0 0 0-1.8 0L6.6 12.2H3.7c-1 0-1.7-.8-1.7-1.7V5.2Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            Enter VR
          </button>
        )}
        {!hideLayers && (
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
        )}
      </div>
    </header>
  );
}

/**
 * A project's planning status, spelt out on a pale ground above its address.
 * (A filled version for lists went with the list of nearby projects.) The
 * words carry it; the tint only says "this is a status".
 */
export function StatusBadge({ status }: { status: Development['status'] }) {
  return <span className="badge">{status}</span>;
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
