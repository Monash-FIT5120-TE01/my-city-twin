/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PANELS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Every panel that sits over the 3D view after the front page, in the
 *   order of this file:
 *
 *   SearchResults    the matches under either search field.
 *   ViewControls     turn, zoom, frame the whole city, focus mode, and the
 *                    card that says how the mouse moves the map.
 *   MapLayers        the layer panel the header's "Map layers" opens.
 *   SubjectHead      the top of the sunlight column: the way back, the
 *                    address, and a "Details" link to the place card.
 *   SunlightSheet    the sunlight screen's column: date, season, today or
 *                    after, the measured spot or window, the way to the
 *                    side-by-side comparison, and "How it works".
 *   TimeBar          the dock along the foot of the map: play, the hour on a
 *                    rail through the day, sunrise and sunset, the map key.
 *
 * WHY THEY FLOAT
 *   The thing being explained is behind the glass. A full-width page would
 *   cover the city, and the city is the argument — so every panel is a card
 *   or a column on top of a view that never goes away.
 *
 * WHAT THESE COMPONENTS DO NOT DO
 *   They hold no state that matters beyond themselves — which question the
 *   sunlight column is answering, whether a help card is showing. Everything
 *   else is given to them, with a function to call. That is what lets the
 *   same layer list appear on several screens without any of them knowing
 *   about the others.
 *
 * WHERE THE WORDS CAME FROM
 *   Mostly the design. Two deliberate departures, both because the design
 *   promises something the data cannot support yet:
 *
 *     - the shadow sentences do not name a protected public space, because
 *       there is no protected-space data (user story 1.3);
 *     - the layer list shows "Protected public space", "Construction" and
 *       "Environment" locked rather than working, because nothing is behind
 *       them. A named padlock is more honest than a tick box that does
 *       nothing.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CityModel, Development } from '../data/model';
import { clock12Label } from '../data/now';
import { NOT_AN_ASSESSMENT, spotFinePrint, spotWords } from './words';
import {
  SEASONS,
  matchingSeason,
  sameDayInMonth,
  type SimulationDate,
} from '../scene/solar';
import type { SunlightAtPoint } from '../scene/sunlightAt';
import { StatusBadge } from './chrome';
import { SourcesLink } from './Sources';
import { MapKey } from './kit/MapKey';
import { BackLink } from './kit/BackLink';
import { Button } from './kit/Button';
import { CloseButton } from './kit/CloseButton';
import { Swatch } from './kit/Swatch';
import { TextButton } from './kit/TextButton';
import { DateField } from './DateField';
import { ApartmentControls, WindowResult } from './Apartment';
import type { Facade } from '../scene/facades';
import type { WindowSunlight } from '../scene/windowSunlight';
import { searchCity, type SearchHit } from '../data/search';

/* ── 01 Search, progress and the map controls ───────────── */

/**
 * What a search field found — the header's, or the front page's own.
 *
 * WHY IT IS A COMPONENT AND NOT PART OF THE FIELD
 *   The field is in the bar (or on the page) and the results hang below it.
 *   Keeping them apart means App can own the text — it has to, now that the
 *   field outlives the screen it was typed on — while the matching, which is
 *   a scan of 4,443 buildings, still only happens where the answer is shown.
 *   App decides which field's results are drawn, and what a pick does.
 *
 * WHY TWO CHARACTERS
 *   One letter matches a third of the city and the list is meaningless; the
 *   work of building it is also wasted on every keystroke of a word somebody
 *   is halfway through typing.
 */
export function SearchResults({
  model,
  query,
  onPick,
}: {
  model: CityModel;
  query: string;
  onPick: (hit: SearchHit) => void;
}) {
  const matches = useMemo(() => searchCity(model, query), [query, model]);
  if (query.trim().length < 2) return null;

  if (matches.length === 0) {
    return (
      <p className="results__none">
        Nothing matches that. {model.searchable.length.toLocaleString()} buildings
        and {model.developments.length} approved projects can be searched by
        address; some older buildings have no address on record.
      </p>
    );
  }

  return (
    <div className="results" role="listbox" aria-label="Search results">
      {matches.map((hit, index) => (
        <button
          key={hit.kind === 'building' ? hit.building.buildingId : hit.development.devId}
          type="button"
          /*
            Its place in the list, for the stagger. A custom property rather
            than an inline delay so the timing stays in the stylesheet with
            the rest of the motion, and this only says WHICH row it is.
          */
          style={{ '--i': index } as React.CSSProperties}
          role="option"
          aria-selected="false"
          onClick={() => onPick(hit)}
        >
          {/*
            The colour it will be in the city: pink for a building, teal for an
            approved project, orange for one under construction.
          */}
          <Swatch
            tone={
              hit.kind === 'building'
                ? 'searched'
                : hit.development.status === 'UNDER CONSTRUCTION'
                  ? 'progress'
                  : 'approved'
            }
            size="sm"
          />
          {hit.label}
          <small>{hit.detail}</small>
        </button>
      ))}
    </div>
  );
}

/**
 * A mouse, with one part of it filled in.
 *
 * WHY THE THREE ICONS DIFFER ONLY BY WHAT IS FILLED
 *   They are drawn at about twenty pixels. At that size a curved arrow and a
 *   straight one are the same smudge, and anything drawn beside the mouse to
 *   suggest the motion is smaller still. What survives being shrunk is a
 *   solid area against an outline — so the shape stays identical in all
 *   three and the only thing that changes is WHICH BUTTON IS PRESSED.
 *
 *   The word beside it says what the motion does. The icon says where the
 *   hand goes. Neither repeats the other.
 *
 * WHY IT IS NOT COLOUR
 *   Filled against outlined is a difference in area, which survives any
 *   colour vision and any screen. A highlighted button in a second hue would
 *   not, and nothing in this interface asks a reader to tell two hues apart.
 */
function MouseGlyph({ part }: { part: 'left' | 'right' | 'wheel' }) {
  return (
    <svg
      className="viewctl__glyph"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {/* The body, always an outline. */}
      <rect
        x="6.25"
        y="1.25"
        width="11.5"
        height="21.5"
        rx="5.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* The seam between the two buttons. */}
      <path d="M12 1.6V9" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.6 9h10.8" fill="none" stroke="currentColor" strokeWidth="1.3" />

      {part === 'left' && <path d="M12 2A5.4 5.4 0 0 0 6.6 7.4V9H12Z" fill="currentColor" />}
      {part === 'right' && <path d="M12 2a5.4 5.4 0 0 1 5.4 5.4V9H12Z" fill="currentColor" />}

      {/* The wheel sits in the seam, so it is drawn last either way. */}
      <rect
        x="11"
        y="3.6"
        width="2"
        height="4.2"
        rx="1"
        fill={part === 'wheel' ? 'currentColor' : 'var(--paper)'}
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE MAP CONTROLS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Turn, zoom, and a way back to the whole city, in the one corner no panel
 * uses.
 *
 * WHY TURNING IS HERE AND NOT ONLY ON THE MOUSE
 *   It is on the right mouse button, which is a defensible choice — this
 *   view is panned far more than it is spun — and it is the opposite of what
 *   every other 3D tool does. So the first thing anybody tries is a left
 *   drag, the city slides instead of turning, and they conclude it does not
 *   turn.
 *
 *   The mapping is not the fault. The dead end is. Two buttons make the
 *   capability reachable without knowing any mapping at all, and change
 *   nothing for the reader who already found the right one.
 *
 * WHY THE INSTRUCTIONS MOVED IN HERE
 *   They were a line of 13px text floating at the bottom of the screen with
 *   pointer events off — a caption, in the place captions go, which is the
 *   place nobody looks when they are trying to do something. Now they are
 *   behind a button in the group that performs the same three actions, which
 *   is where somebody stuck on "how do I turn this" is already looking.
 */
export function ViewControls({
  onZoom,
  onOrbit,
  onReset,
  onFocus,
}: {
  /** Multiply the camera's distance: below 1 is in, above 1 is out. */
  onZoom: (factor: number) => void;
  /** Turn round the orbit centre, in radians; negative is to the left. */
  onOrbit: (radians: number) => void;
  /** "Frame the whole city": clear what is open and fly back out. */
  onReset: () => void;
  /**
   * Hide the interface and leave the city.
   *
   * It used to sit in the header, among the navigation, which put a view
   * control where the places are — and made it a button that erases the bar
   * it is drawn in. It belongs with the other things that change the view
   * and nothing else.
   */
  onFocus: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);

  /** A tenth of a turn: enough to see the city move, small enough to aim. */
  const STEP = Math.PI / 5;

  return (
    <div className="viewctl">
      {showHelp && (
        <dl className="viewctl__help" role="note">
          {(
            [
              ['left', 'Left drag', 'moves the city'],
              ['right', 'Right drag', 'turns it'],
              ['wheel', 'Scroll', 'zooms in and out'],
            ] as const
          ).map(([part, gesture, effect]) => (
            <div key={part}>
              <MouseGlyph part={part} />
              <dt>{gesture}</dt>
              <dd>{effect}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="viewctl__stack">
        <button type="button" onClick={() => onOrbit(-STEP)} aria-label="Turn the city left">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M12.5 13.2A6 6 0 1 0 2.4 8.9M2 5v4h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button type="button" onClick={() => onOrbit(STEP)} aria-label="Turn the city right">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M3.5 13.2A6 6 0 1 1 13.6 8.9M14 5v4h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <button type="button" onClick={() => onZoom(0.7)} aria-label="Zoom in">
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M7.5 1.6v11.8M1.6 7.5h11.8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button type="button" onClick={() => onZoom(1 / 0.7)} aria-label="Zoom out">
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M1.6 7.5h11.8"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/*
          Corners closing onto a point: the frame coming back to the city.
          It shared a glyph with focus mode below until now, which made two
          adjacent buttons in one stack look like the same button drawn
          twice — and the one nobody could tell apart was the one that
          hides the whole interface.
        */}
        <button type="button" onClick={onReset} aria-label="Frame the whole city">
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M1.6 5V1.6h3.4M10 1.6h3.4V5M13.4 10v3.4H10M5 13.4H1.6V10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="7.5" cy="7.5" r="1.7" fill="currentColor" />
          </svg>
        </button>

        {/*
          A rule above it, like the help below: the three above change where
          the camera is, and these two change what is on the screen. Grouped
          without a break they would read as five ways to move.
        */}
        <button
          type="button"
          className="viewctl__apart"
          onClick={onFocus}
          aria-label="Focus mode — hide the interface"
          title="Focus mode"
        >
          {/*
            An eye, because this is the one control in the stack that is
            about LOOKING rather than about where the camera is. The arrows
            and the zoom move the view; this takes everything else away so
            there is only the view.

            It also has to be unmistakable at 15px from the button above it,
            and a closed shape among open ones is the difference that
            survives being small.
          */}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M1.3 8S3.9 3.4 8 3.4 14.7 8 14.7 8 12.1 12.6 8 12.6 1.3 8 1.3 8Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="8" r="2.1" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          className="viewctl__ask"
          aria-expanded={showHelp}
          aria-label="How to move around the map"
          onClick={() => setShowHelp((open) => !open)}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M5.4 5.4a2.3 2.3 0 1 1 2.9 2.2c-.5.2-.8.6-.8 1.1v.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="7.5" cy="11.6" r="0.9" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── 02 Discovery Map: the layers ─────────────────────── */

/** What the map draws: the approved projects, the sun's shadows, and the street lights after dark. */
export interface Layers {
  developments: boolean;
  shadows: boolean;
  /** Street and feature lights glow once the sun is fully down. Off keeps the night street unlit. */
  streetLights: boolean;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT APPEARS ON THE MAP
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY IT IS ITS OWN PANEL NOW
 *   It used to be the top of the explore screen's panel, which meant the
 *   tick boxes were only reachable from one screen — and that they took up
 *   room there permanently for something most readers set once and never
 *   touch again. Opened from the header it is available on every screen
 *   with the plain bar, and in the way nowhere. (The front page and the
 *   sunlight screen do not carry the button: see Header's `front`.)
 *
 * WHY THE UNAVAILABLE LAYERS ARE STILL LISTED
 *   Protected public space is user story 1.3; construction and environment
 *   are Epics 2 and 3. None has data behind it. They are listed under their
 *   own heading rather than sitting greyed out among the working ones,
 *   because a disabled control in a list of live controls reads as broken,
 *   while the same words under "Coming soon" read as a plan.
 *
 *   A named padlock is more honest than a tick box that does nothing.
 */
export function MapLayers({
  layers,
  onChange,
  onClose,
}: {
  layers: Layers;
  onChange: (next: Layers) => void;
  onClose: () => void;
}) {
  return (
    <aside className="panel panel--left sheet" aria-labelledby="layers-title">
      <div className="sheet__head">
        <h2 className="panel-title sheet__title" id="layers-title">
          Map layers
        </h2>
        <CloseButton label="Close map layers" onClick={onClose} />
      </div>

      <p className="sheet__meta">Choose what appears on the map.</p>

      <div className="switches">
        {(
          [
            {
              key: 'developments',
              name: 'Approved projects',
              note: 'Approved, and those already under construction',
            },
            {
              key: 'shadows',
              name: 'Sunlight & shadows',
              note: 'Preview shadows at the selected time',
            },
            {
              key: 'streetLights',
              name: 'Street lights',
              note: 'Lit once the sun has fully set',
            },
          ] as const
        ).map((layer) => (
          <label className="switch" key={layer.key}>
            <span className="switch__text">
              <span className="switch__name">{layer.name}</span>
              <span className="switch__note">{layer.note}</span>
            </span>
            {/*
              A real checkbox, drawn as a track and a knob. Replacing it with
              a div would mean rebuilding focus, the space key and the
              announcement, and getting one of the three wrong.
            */}
            <input
              type="checkbox"
              className="switch__input"
              checked={layers[layer.key]}
              onChange={(event) => onChange({ ...layers, [layer.key]: event.target.checked })}
            />
            <span className="switch__track" aria-hidden="true" />
          </label>
        ))}
      </div>

      <div className="soonlist">
        <p className="panel__eyebrow soonlist__head">Coming soon</p>
        {(
          [
            ['Protected public space', 'Protection rules and affected places'],
            ['Construction', 'Construction activity and progress'],
            ['Environment', 'More ways to understand city change'],
          ] as const
        ).map(([name, note]) => (
          <p className="soonlist__item" key={name}>
            <span className="soonlist__name">{name}</span>
            <span className="soonlist__note">{note}</span>
          </p>
        ))}
      </div>

      <p className="note">Layer settings stay as you move between projects.</p>

      <Button block onClick={onClose}>
        Done
      </Button>
    </aside>
  );
}

/* ── 03 The subject's head, on the sunlight column ──────── */

/**
 * The top of the sunlight column: the way back, what the subject is, and a
 * "Details" link to its place card. (It once also headed the project and
 * building panels, with Overview / Sunlight tabs; those panels became the
 * place card — see PlaceCard.)
 */
function SubjectHead({
  status,
  existing,
  title,
  locality,
  meta,
  backLabel,
  onBack,
  onDetails,
}: {
  status?: Development['status'];
  /** Shown instead of a planning status, for something already standing. */
  existing?: boolean;
  title: string;
  /**
   * The rest of the address -- suburb, state, postcode.
   *
   * Separate from the title because they are read at different sizes and for
   * different reasons: the street line identifies the subject, and this only
   * confirms which city it is in. Optional, and absent rather than invented
   * when the address it came from had no comma to split on.
   */
  locality?: string;
  /** The quietest line: uses, storeys and height, or what a building is. */
  meta: string;
  /** Where the back link goes, in words: "Back to the map". */
  backLabel: string;
  onBack: () => void;
  /** A "Details" link under the address: the subject's place card. */
  onDetails?: () => void;
}) {
  return (
    <>
      {/*
        ── THE WAY BACK, AT THE SIZE IT DESERVES ────────────────────────────

        It was drawn as a bordered button, and the heaviest thing on the
        panel was the way off it. Now it is what it is -- a text link -- with
        the 44px target kept in padding rather than in a border. The header's
        mark is the way home.
      */}
      <div className="sheet__nav">
        <BackLink onClick={onBack}>{backLabel}</BackLink>
      </div>

      {/*
        The subject, in three sizes.

        The street line is the thing being looked at, so it is the largest
        text on the panel. The suburb only settles which city, and the use and
        height line is detail -- each one step quieter than the last, so the
        order they are read in is decided by the drawing rather than by luck.
      */}
      <div className="subject">
        {status && <StatusBadge status={status} />}
        {existing && <span className="badge badge--existing">Existing</span>}
        {/* Focusable from script only: arriving from the place card. */}
        <h2 className="panel-title sheet__title" id="subject-title" tabIndex={-1}>
          {title}
        </h2>
        {locality && <p className="sheet__locality">{locality}</p>}
        <p className="sheet__meta">{meta}</p>
        {/*
          The place card, with its figures, one press away: on the sunlight
          screen the sunlight is the subject, and the record of the building
          is a reference to look up.
        */}
        {onDetails && (
          <TextButton variant="reference" className="sheet__details" onClick={onDetails}>
            Details
          </TextButton>
        )}
      </div>

    </>
  );
}

/* ── Sunlight simulation: the column and the time bar ───── */

/**
 * Why there is no answer, when there is no answer.
 *
 * Three different reasons, and they were once all reported as the first one.
 * A reader who moved up past a podium onto a narrower tower was told their
 * building had no floor 14 — it has fourteen floors, it just does not have a
 * south-east side up there, and the sentence sent them looking for a mistake
 * they had not made.
 */
export type WindowProblem = 'no-such-floor' | 'side-not-at-this-height' | 'inside-the-building';

/**
 * Everything the apartment half of the sunlight panel needs, in one object.
 *
 * App computes all of it — the sides from the footprint, the figures from the
 * skyline — and the panel only displays it and reports presses back; it has
 * no opinion about any of it. Passed as a unit rather than as a dozen props,
 * which would grow an already long signature by another page, and because
 * none of it is independent:
 * the floor decides which sides exist, the side decides whether there is a
 * figure, and the figure decides what the caveat has to say.
 *
 * Absent entirely for a proposal. Nobody lives in a building that has not
 * been built, and offering to measure a window in one would invite a question
 * the model cannot answer honestly.
 */
export interface ApartmentState {
  /** The sides this building actually has. Empty if the footprint is unusable. */
  sides: Facade[];
  /** The floor asked about, counted from 1. */
  floor: number;
  onFloor: (next: number) => void;
  /** Compass name, or null before a side has been chosen. */
  side: string | null;
  onSide: (compass: string) => void;
  /** From the property record; null when it has none. */
  floorsAboveGround: number | null;
  /** The floor's height was estimated, not read from a record — said so. */
  floorHeightAssumed: boolean;
  /** Null until a side is chosen, or when the floor asked for does not exist. */
  sunlight: WindowSunlight | null;
  /** Why there is no figure, or null when there is one (or nothing chosen). */
  problem: WindowProblem | null;
  /**
   * True when the approved plan replaces this very building.
   *
   * There is then no future window to compare against, so the comparison is
   * absent — and its absence has to be explained, or it reads as "the plan
   * changes nothing here", which is the opposite of what it means.
   */
  hostDemolished: boolean;
}

/** The sunlight panel's "How it works", which the header's link opens. */
export const SUNLIGHT_HOWTO_ID = 'sunlight-howto';

/**
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT CHANGES ON YOUR STREET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The sunlight screen's column. Two states: before a spot has been chosen,
 * and after — which are different enough to be two designs and are the
 * same panel because they are the same question part-answered.
 *
 * WHAT IS IN IT, TOP TO BOTTOM
 *   - The subject's head, with "Explore the city" back and "Details" to
 *     its own page (SubjectHead).
 *   - Date, and the note when the present hour could not be shown.
 *   - Season: four presets that move the month and keep the day.
 *   - Neighbourhood view: today, or after the approved projects are built;
 *     for a standing building, also whether the building itself is shown.
 *   - For a standing building: a spot outside, or a window up here — with
 *     the floor and side controls for the window.
 *   - The answer: choosing a spot, the figure for it, and what to do next;
 *     or the window's figure, or why there is none.
 *   - "Compare side by side": the way to the comparison screen.
 *   - "How it works", folded.
 *   - The caveats, at the end.
 *
 * The hour is not here: the time bar along the foot of the map sets it.
 *
 * WHAT IT DOES NOT SAY
 *   The design names a footpath under a "public space" heading. There is no
 *   protected-public-space data — user story 1.3, nothing behind it — so
 *   this names what the reader actually chose: a point on the map. Calling
 *   it a named, assessed public space would be inventing the one kind of
 *   claim this product must not invent.
 *
 *   It also does not call its own figures examples. They are computed from
 *   the model geometry for the date on screen, which is why the caveat below
 *   them is about SAMPLING and about what is left out, not about the numbers
 *   being placeholders.
 */
export function SunlightSheet({
  status,
  title,
  locality,
  meta,
  date,
  onDate,
  nowNote,
  dateLabel,
  measured,
  onClearPoint,
  onStand,
  choosing,
  onChoose,
  onCancelChoose,
  afterPlans,
  onAfterPlans,
  onCompare,
  subjectKind = 'development',
  apartment,
  onDetails,
  onBack,
}: {
  status?: Development['status'];
  title: string;
  /** Suburb, state and postcode, when the address had them to give. */
  locality?: string;
  /** The line under the address: uses and height, or what a building is. */
  meta: string;
  date: SimulationDate;
  onDate: (next: SimulationDate) => void;
  /** Said only when the present moment could not be shown as it is. */
  nowNote: string | null;
  /** The date as words, for the window's result. */
  dateLabel: string;
  /** The figures for the chosen spot, or null while none has been chosen. */
  measured: SunlightAtPoint | null;
  onClearPoint: () => void;
  /** "Stand here": down to the footpath at the measured spot. */
  onStand: () => void;
  /**
   * ── THE FIRST MOVE, AS A BUTTON ────────────────────────────────────────
   *
   * Measuring a spot is what this screen is for, and it used to begin with a
   * sentence: "Click anywhere on the ground to measure…". There was no
   * moment at which the reader did anything. The ground was quietly live at
   * all times, so the interaction had no beginning, no end, and nothing to
   * press — and a person who had not read the paragraph had no way in.
   *
   * Now it is a state they enter and leave. Pressing the button arms the
   * ground; clicking places the point and disarms it; Cancel backs out.
   *
   * WHY THE GROUND IS INERT UNTIL ASKED
   *   It costs a press, and it buys two things. The action has a visible
   *   start, which is the whole point. And a stray click during panning
   *   cannot place a point — which was a real defect, not a hypothetical:
   *   every drag of the camera used to leave a measurement behind it.
   *
   *   The design assumes this shape already. Its measured state offers
   *   "Choose another point", which only means anything if choosing is
   *   something you begin.
   */
  choosing: boolean;
  onChoose: () => void;
  onCancelChoose: () => void;
  /**
   * The neighbourhood as it is today, or once every approved project is
   * built. What the MAP draws — the measured figures are the same point on
   * the same date either way.
   */
  afterPlans: boolean;
  onAfterPlans: (next: boolean) => void;
  /** Opens the comparison screen: today and after, side by side. */
  onCompare: () => void;
  /** A proposal ("project") or a building already standing ("building"). */
  subjectKind?: 'development' | 'building';
  /**
   * The "I live here" half of the screen, for a building that is already
   * standing. Absent for a proposal — see ApartmentState.
   */
  apartment?: ApartmentState;
  /** The subject's own page: what it is, rather than what it does to the sun. */
  onDetails: () => void;
  /** "Explore the city": the explore screen. */
  onBack: () => void;
}) {
  /*
   * Which question the action area is answering.
   *
   * Panel state rather than App state: nothing outside this sheet depends on
   * it, and lifting it would put a preference about a control a long way from
   * the control. The 3D scene follows the receptor and the window place that
   * App already holds, so it does not need to know which of the two
   * questions the panel is showing.
   */
  const [measuring, setMeasuring] = useState<'spot' | 'window'>('spot');
  const onMeasuring = (next: 'spot' | 'window') => setMeasuring(next);

  const preset = matchingSeason(date);
  /*
   * What to call the thing on screen. "Project" for a proposal — the word
   * the navigation uses, and the one a reader learns first; the data keeps
   * its own word, `Development` — and "building" for one that is already
   * standing, which is a different fact rather than a different word for
   * the same one.
   */
  const noun = subjectKind === 'building' ? 'building' : 'project';

  /*
   * The figure's sentences come from words.ts, where the headset panel gets
   * them too — so a figure reads the same on a monitor and in a headset.
   */
  const words = measured ? spotWords(measured, noun) : null;

  /*
   * ── BRING THE ANSWER INTO VIEW ──────────────────────────────────────────
   *
   * The panel is taller than the room it has and scrolls inside itself. The
   * result is low down in it, under the date, the seasons and the
   * neighbourhood view -- so on a laptop somebody clicked a spot on the ground, the
   * figure they had asked for was computed, and NOTHING they could see
   * changed. The panel looked identical. It is the one moment in the screen
   * where the app answers a question, and it was landing off-screen.
   *
   * Keyed on the figures rather than on a boolean, so measuring a second
   * point brings the new answer up too -- that is the same event happening
   * again, not a state that is already true.
   *
   * It brings the whole ACTION block, not just the figure. The figure alone
   * left "Choose another point" and "Clear point" below the fold -- the
   * answer arrived and what to do about it did not, which is the same fault
   * one step further down. The block is shorter than the panel at every
   * width measured, so both fit.
   *
   * `block: 'nearest'` scrolls the panel by the least that works and leaves
   * the page alone. Anybody who has asked for less movement gets the jump
   * rather than the glide: they still need to be taken to the answer.
   */
  const actionRef = useRef<HTMLDivElement | null>(null);
  const answer = measured
    ? `${measured.lostMin}|${measured.withoutSubjectMin}|${dateLabel}`
    : null;

  useEffect(() => {
    if (!answer) return;
    const node = actionRef.current;
    if (!node) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'nearest' });
  }, [answer]);

  return (
    /*
     * `sheet--sun`: the full-height column the design draws, flush to the
     * left edge on a wide screen. On a phone it is the same bottom sheet as
     * every other panel — see sunlight.css.
     */
    <aside className="panel panel--left sheet sheet--sun" aria-labelledby="subject-title">
      <SubjectHead
        status={status}
        existing={subjectKind === 'building'}
        title={title}
        locality={locality}
        meta={meta}
        backLabel="Explore the city"
        onBack={onBack}
        onDetails={onDetails}
      />

      <div className="sheet__tabpanel sheet__tabpanel--flow">
        <h3 className="sheet__lede">Explore sunlight</h3>

        {/*
          -- WHEN -----------------------------------------------------------

          The field owns the date, because it is the control that sets it.
          The HOUR is not here at all: the bar along the bottom of the map
          sets it and shows it.

          The words are ours and the control underneath is the browser's: a
          calendar that answers the keyboard in every locale is not something
          to rebuild to change how a border looks. See DateField.
        */}
        <section className="block">
          <h4 className="block__head">Date</h4>
          <DateField date={date} onDate={onDate} />

          {/*
            aria-live because the note is not there on every visit -- only
            when the hour could not be shown -- and a reader using a screen
            reader would otherwise be given a time with no account of why it
            is not the one on their clock.
          */}
          {nowNote && (
            <p className="block__note" aria-live="polite">
              {nowNote}
            </p>
          )}
        </section>

        {/* -- SEASON: the four presets ------------------------------------ */}
        <section className="block">
          <h4 className="block__head" id="season-head">
            Season
          </h4>
          {/*
            Four separate buttons, the chosen one filled. Filled against
            outlined is a difference in lightness — white on #14624a — so it
            reads without telling two colours apart. None is filled when the
            date is not one of the four: an arbitrary Tuesday in October is
            not a season preset, and marking the nearest would claim it was.
          */}
          <div className="seasons" role="group" aria-labelledby="season-head">
            {SEASONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={option.key === preset?.key}
                /* The day on screen is kept; only the month moves. */
                onClick={() => onDate(sameDayInMonth(date, option.month))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        {/*
          -- NEIGHBOURHOOD VIEW: TODAY, OR AFTER ----------------------------

          The control the whole screen exists for, and it stays put: it is
          not inside any branch that measuring can take off the screen.
          Switching it does not change what the figures below mean -- this
          decides what the MAP draws, not what was measured. "Compare side by
          side" below shows the two at once, on a page of their own.

          For a standing building, a second control: whether the building
          itself is drawn, the "before" of what it takes from the street.
        */}
        <section className="block">
          <h4 className="block__head" id="view-head">
            Neighbourhood view
          </h4>
          <div className="choice" role="radiogroup" aria-labelledby="view-head">
            <label className="choice__row">
              <input
                type="radio"
                name="neighbourhood"
                checked={!afterPlans}
                onChange={() => onAfterPlans(false)}
              />
              Today
            </label>
            <label className="choice__row">
              <input
                type="radio"
                name="neighbourhood"
                checked={afterPlans}
                onChange={() => onAfterPlans(true)}
              />
              After planned projects are built
            </label>
          </div>
          <p className="block__note">
            {afterPlans
              ? 'Approved and in-progress projects at their planned height.'
              : subjectKind === 'building'
                ? 'The city as it stands.'
                : 'The city as it stands — this project is not built yet.'}
          </p>
        </section>

        {/*
          ── WHICH QUESTION IS BEING ASKED ──────────────────────────────────

          Only for a building that is standing, and only when its footprint
          gave us sides to offer. A proposal has no residents, and a shape we
          could not read has no sides to choose between. The ground is the
          default; the window is there for the reader asking about their own
          home.
        */}
        {apartment && apartment.sides.length > 0 && (
          <div
            className="segmented"
            role="group"
            aria-label="What to measure"
            style={{ '--count': 2, '--at': measuring === 'spot' ? 0 : 1 } as React.CSSProperties}
          >
            <button
              type="button"
              aria-pressed={measuring === 'spot'}
              onClick={() => onMeasuring('spot')}
              data-label="A spot outside"
            >
              A spot outside
            </button>
            <button
              type="button"
              aria-pressed={measuring === 'window'}
              onClick={() => onMeasuring('window')}
              data-label="A window up here"
            >
              A window up here
            </button>
          </div>
        )}

        {apartment && measuring === 'window' && (
          <ApartmentControls
            floor={apartment.floor}
            onFloor={apartment.onFloor}
            floorsAboveGround={apartment.floorsAboveGround}
            sides={apartment.sides}
            chosenSide={apartment.side}
            onSide={apartment.onSide}
            floorHeightAssumed={apartment.floorHeightAssumed}
          />
        )}

        {/*
          -- THE ANSWER -----------------------------------------------------

          The action area: choosing a spot, the figure for it and what to do
          next, or the window's figure. Brought into view when an answer
          arrives — see BRING THE ANSWER INTO VIEW above.
        */}
        <div className="action" ref={actionRef}>
          {/*
            Shown whenever the ground is live, with or without a point already
            on it. It used to live inside the "no point yet" branch only, so
            pressing "Choose another point" armed the ground and said so
            nowhere -- the reader looked at the city with no sign that a click
            was about to mean something.

            Cancelling from here leaves any earlier figure exactly where it
            was. Backing out of choosing is not the same as throwing away the
            answer you already had; "Clear point" is the control for that.
          */}
          {choosing && (
            <div className="arming" aria-live="polite">
              <p className="arming__lede">Click a spot on the ground.</p>
              <p className="arming__body">
                A ring follows the pointer. The spot you pick is measured
                across the whole day.
              </p>
              <Button variant="ghost" block onClick={onCancelChoose}>
                Cancel
              </Button>
            </div>
          )}

          {measuring === 'window' ? (
            /*
             * The apartment answer, or the reason there is not one yet. It
             * goes in the action area so that whichever question is being
             * asked, the answer arrives in the same place on the panel.
             */
            apartment?.problem ? (
              <p className="sheet__sub" aria-live="polite">
                {apartment.problem === 'no-such-floor'
                  ? apartment.floorsAboveGround !== null
                    ? `This building has ${apartment.floorsAboveGround} floors on record, so there is no floor ${apartment.floor}.`
                    : `Floor ${apartment.floor} would be above the top of this building as it is modelled.`
                  : apartment.problem === 'side-not-at-this-height'
                    ? `This building has no ${apartment.side?.toLowerCase()} side at floor ${apartment.floor}. Choose one of the sides above.`
                    : `That side of floor ${apartment.floor} is inside the building rather than on an outside wall, so there is no window there to measure.`}
              </p>
            ) : apartment?.sunlight && apartment.side ? (
              <WindowResult
                sunlight={apartment.sunlight}
                dateLabel={dateLabel}
                floor={apartment.floor}
                side={apartment.side}
              />
            ) : (
              <p className="sheet__sub">
                Choose which way your window faces to see the sun it gets.
              </p>
            )
          ) : measured ? (
            <>
              <div
                /*
                  Keyed on the figures themselves, so picking a different point
                  replaces the block and it arrives again. Unkeyed, React keeps
                  the element and rewrites the number inside it -- and the one
                  thing the reader asked a question to get would change between
                  two frames with nothing to mark it as a new answer.

                  Two points that produce identical figures do not re-animate,
                  which is correct: nothing changed.
                */
                key={answer}
                className="result"
                aria-live="polite"
              >
                {/* Not the date any more: the field above owns that. */}
                <p className="result__eyebrow">At this spot</p>
                {words?.none ? (
                  <p className="result__figure result__figure--none">{words.none}</p>
                ) : (
                  <>
                    <p className="result__figure">{words?.figure}</p>
                    <p className="result__caption">{words?.caption}</p>
                    {/*
                      The other half of the subtraction above: every sampled
                      minute the sun is up, with the subject taken away and no
                      other building counted either -- the day's length, not
                      the sun this spot really gets. See spotWords in
                      words.ts, and the fine print below.
                    */}
                    <p className="result__against">{words?.against}</p>
                    {measured.firstShadowLabel && (
                      <dl className="stat-row">
                        <dt>In shadow around</dt>
                        <dd>
                          {measured.firstShadowLabel} &ndash; {measured.lastShadowLabel}
                        </dd>
                      </dl>
                    )}
                  </>
                )}
              </div>

              {/*
                -- WHICH OF THESE IS THE ONE TO PRESS ------------------------

                Moving the point is. Somebody looking at a figure for one spot
                is most likely to want the figure for a different spot -- that
                is what having read one tells you about what they want next.

                The other two are the same size as each other because they are
                alternatives to it, not to one another.
              */}
              <Button block onClick={onChoose}>
                Choose another point
              </Button>

              <div className="sheet__actions">
                <Button variant="ghost" onClick={onClearPoint}>
                  Clear point
                </Button>
                {/*
                  The measured spot is a place the reader chose and asked a
                  question about, which makes it the one place worth being put
                  down in. From two kilometres up a shadow is a grey shape on a
                  diagram; from the footpath it is the thing the question was
                  about.
                */}
                <Button
                  variant="ghost"
                  onClick={onStand}
                  icon={<StandIcon />}
                >
                  Stand here
                </Button>
              </div>
            </>
          ) : (
            !choosing && (
              <>
                <Button
                  variant="mint"
                  size="lg"
                  block
                  onClick={onChoose}
                  icon={<PinIcon />}
                >
                  Choose a spot
                </Button>
                <p className="sheet__sub">Select a point on the ground.</p>
              </>
            )
          )}
        </div>

        {/*
          -- COMPARE SIDE BY SIDE -------------------------------------------

          Today and after, side by side on a page of their own (ComparePage),
          with the two views moving together. The switch above shows one at a
          time on this map; this shows both at once.
        */}
        {/* .button--compare: where the keyboard returns from the comparison (App). */}
        <Button variant="ghost" size="lg" block arrow className="button--compare" onClick={onCompare}>
          Compare side by side
        </Button>

        {/*
          -- HOW IT WORKS ---------------------------------------------------

          The steps, folded away at the foot of the column: read once, they
          would be in the way on every visit after that. "How it works" in
          the header opens this.
        */}
        <details className="howto" id={SUNLIGHT_HOWTO_ID}>
          <summary>How it works</summary>
          <ol className="howto__steps">
            <li>Choose a date or a season above.</li>
            <li>Move the time along the bar at the bottom, or press play, to follow the shadow.</li>
            <li>Switch the neighbourhood view, or compare the two side by side, to see today against after the approved projects.</li>
            <li>Choose a spot on the ground to measure what this {noun} takes from it.</li>
          </ol>
        </details>
      </div>

      {/*
        -- THE CAVEATS ------------------------------------------------------

        Both caveats in one place, at the end.

        One of them used to sit between the figure and the buttons — four
        lines of qualification wedged between the answer and the thing to do
        about it, which pushed the actions off the fold and made the reader
        scroll past a disclaimer to reach them. Qualifications belong after
        the thing they qualify, not inside it.

        THE CAVEAT DEPENDS ON WHICH QUESTION WAS ASKED, and getting this wrong
        would be the same class of error as the "total daylight" mislabel.

        The two measurements count different things. The spot outside tests
        the sun against the SUBJECT ONLY, so everything already standing is
        ignored and a spot in somebody else's shadow still reads as sunlit.
        The window tests against every building in the extract, so that
        sentence would be false there — and the things it cannot see are
        different ones: balconies, awnings, the shape of a roof.
      */}
      <p className="sheet__fine">
        {measuring === 'window'
          ? apartment?.sunlight
            ? `${apartment.hostDemolished ? 'The approved plan replaces this building, so there is no “once built” figure to compare against. ' : ''}Sampled every ${apartment.sunlight.stepMinutes} minutes, counting every building in the model including this one. Measured at one representative point on that side — a flat at the far end of the same wall may differ. Buildings are flat-topped blocks: balconies, awnings, window reveals and the shape of the roof are not modelled, and nor is cloud. `
            : ''
          : measured
            ? spotFinePrint(measured.stepMinutes)
            : ''}
        {NOT_AN_ASSESSMENT}
      </p>
      {/*
        On a phone the strip of fine print under the map is hidden, and with
        it the screen's only way to the sources. This is the same link, shown
        at that width only (sunlight.css).
      */}
      <p className="sheet__sources">
        <SourcesLink />
      </p>
    </aside>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE HOUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A dock along the bottom of the map: play, the hour on a rail through the
 * day, and the key to the city's colours — the three things somebody
 * reading the shadow needs while they move it.
 *
 * WHAT IS ON IT, LEFT TO RIGHT
 *   - Play / pause: the day moving on its own (App runs the clock).
 *   - Above the rail: what the shadow is doing, then sunrise and sunset.
 *   - The rail: the daylight band, the handle, and under it the hours
 *     every four from 8:00 am, with the hour itself under the handle.
 *   - A sentence when the sun does not rise or set inside the window.
 *   - The map key.
 *
 *   Every time on the bar is a 12-hour reading (clock12Label).
 *
 * WHAT THE RAIL SAYS
 *   The window runs 06:00 to 20:00 because those are the hours the model
 *   covers, not because the sun does anything at either end. Drawn plain it
 *   claimed the day was a featureless fourteen hours, and somebody dragging
 *   through it had no way to know they had passed sunset until the shadows
 *   went out.
 *
 *   The warm span is the real one, computed for the date on screen by the
 *   same code every other solar figure here uses — see daylightWindow. It
 *   moves when the date moves. Nothing is drawn at a plausible fraction.
 *
 * WHY THERE IS NO LONGER A FILLED PORTION
 *   The track used to carry an amber fill from the start of the window to
 *   the current hour, on top of the daylight band. Two coloured spans on one
 *   rail, both amber, meaning different things: one "the sun is up", one
 *   "you are here". The handle already says where you are, and it says it
 *   without competing with the only other thing the rail has to show.
 *
 * WHERE THE NUMBERS LINE UP
 *   A native range moves its handle's CENTRE between one radius in from each
 *   end, not between the ends. The rail and the scale are inset by the same
 *   radius, so 12:00 on the scale is under the handle when the clock reads
 *   12:00 — which it was not when the rail ran edge to edge.
 */
export function TimeBar({
  minutes,
  onChange,
  min,
  max,
  caption,
  daylight,
  playing = false,
  onPlay,
  inline = false,
}: {
  /** The hour on screen, in minutes since midnight. */
  minutes: number;
  onChange: (next: number) => void;
  /** The ends of the window the rail covers, in minutes (06:00 and 20:00). */
  min: number;
  max: number;
  /** What the shadow is doing at this hour: "Long south shadow". */
  caption: string;
  /** When the sun crosses the horizon, in minutes. Null outside the window. */
  daylight: { rise: number | null; set: number | null };
  /** The hour is moving on its own. */
  playing?: boolean;
  /** Play or pause; App restarts a finished day from sunrise. No play button without it. */
  onPlay?: () => void;
  /**
   * The rail alone, set in its parent's flow rather than docked over the
   * map: for the comparison screen's bottom bar, which has its own date and
   * no room for the key twice.
   */
  inline?: boolean;
}) {
  /** Where a time falls along the rail, as a percentage, held to the ends. */
  const place = (at: number) => Math.min(100, Math.max(0, ((at - min) / (max - min)) * 100));

  /*
   * The band, with the existing reading of null kept: a missing crossing
   * means the sun did not cross inside the window, so the band runs to that
   * edge rather than disappearing. The LABELS do not make the same
   * substitution — saying "sunrise 6:00 am" because the window starts there
   * would be inventing an astronomical fact out of a range limit.
   */
  const from = place(daylight.rise ?? min);
  const to = place(daylight.set ?? max);
  const bothKnown = daylight.rise !== null && daylight.set !== null;

  /*
   * Every four hours from 08:00, as the design marks them, at their true
   * positions — 12:00 on a 06:00–20:00 window is 42.9% along, not the
   * middle. A mark the hour's own label would sit on is left out, so the two
   * never print over each other.
   */
  const at = place(minutes);
  const ticks = [8, 12, 16, 20]
    .map((hour) => hour * 60)
    .filter((tick) => tick >= min && tick <= max)
    .map((tick) => ({ tick, left: place(tick) }));

  return (
    /*
     * Two elements, because an element cannot be its own container query.
     * The outer one is the position and the measurement; the inner one is
     * the card.
     */
    <div className={`timebar ${inline ? 'timebar--inline' : 'timebar--sun'}`}>
      <div className="timebar__dock">
        {/*
          Play, and pause. It moves the same hour the handle does, so
          dragging the handle stops it — see App.
        */}
        {onPlay && (
        <button
          type="button"
          className="timebar__play"
          onClick={onPlay}
          aria-pressed={playing}
          aria-label={playing ? 'Pause the day' : 'Play the day'}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4.5 2.6v10.8L13 8 4.5 2.6Z" fill="currentColor" />
            </svg>
          )}
        </button>
        )}

        <div className="timebar__timeline">
          {!inline && (
          <p className="timebar__events">
            <span className="timebar__caption">{caption}</span>
            <span>
              Sunrise <b>{daylight.rise === null ? '—' : clock12Label(daylight.rise)}</b>
              {' · '}
              Sunset <b>{daylight.set === null ? '—' : clock12Label(daylight.set)}</b>
            </span>
          </p>
          )}

          <div
            className="timebar__track"
            style={
              {
                '--day-from': `${from}%`,
                '--day-to': `${to}%`,
              } as React.CSSProperties
            }
          >
            {/* Drawn separately from the control, so the line can be 4px while
                the thing a finger has to hit stays 44px tall. */}
            <span className="timebar__rail" aria-hidden="true" />
            <input
              type="range"
              min={min}
              max={max}
              step={10}
              value={minutes}
              onChange={(event) => onChange(Number(event.target.value))}
              aria-label="Time of day"
              // Without this a screen reader reads "900", not "3:00 pm".
              aria-valuetext={`${clock12Label(minutes)}, ${caption}`}
              aria-describedby={bothKnown ? undefined : 'timebar-nocross'}
            />
          </div>

          <p className="timebar__scale" aria-hidden="true">
            {ticks
              .filter(({ left }) => Math.abs(left - at) > 9)
              .map(({ tick, left }) => (
                <span key={tick} className="timebar__tick" style={{ left: `${left}%` }}>
                  {clock12Label(tick)}
                </span>
              ))}
            {/* The hour itself, under the handle, in the dark ink. */}
            <span className="timebar__now" style={{ left: `${at}%` }}>
              {clock12Label(minutes)}
            </span>
          </p>

          {/*
            Said only when a crossing is missing, and said to everyone: the
            dash above shows there is no time to give, and this says why.
          */}
          {!bothKnown && (
            <p className="timebar__nocross" id="timebar-nocross">
              The sun does not {daylight.rise === null ? 'rise' : 'set'} between{' '}
              {clock12Label(min)} and {clock12Label(max)} on this date.
            </p>
          )}
        </div>

        {/* The key to the colours, beside the rail that changes what they cast. */}
        {!inline && <MapKey className="timebar__key" />}
      </div>
    </div>
  );
}

/** "Stand here": a figure's footprint with an arrow down into it. */
function StandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <ellipse
        cx="9"
        cy="13.6"
        rx="6.2"
        ry="2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M9 1.4v8.2M5.9 6.6 9 9.8l3.1-3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Choose a spot": a map pin. */
function PinIcon() {
  return (
    <svg width="15" height="19" viewBox="0 0 14 18" aria-hidden="true">
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
