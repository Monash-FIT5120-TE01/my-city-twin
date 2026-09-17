/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PANELS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Every panel that floats over the 3D view, in the order a person meets
 *   them: Landing, the layer list, the nearby-projects list, the project
 *   detail, the sunlight controls, the time bar, and the two cards that
 *   report what the shadow is doing.
 *
 * WHY THEY FLOAT
 *   The thing being explained is behind the glass. A full-width page would
 *   cover the city, and the city is the argument — so every panel is a card
 *   on top of a view that never goes away.
 *
 * WHAT THESE COMPONENTS DO NOT DO
 *   They hold no state of their own beyond the landing search box. Each is
 *   given what to show and a function to call. That is what lets the same
 *   layer list appear on two different screens without either screen
 *   knowing about the other.
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
import { clockLabel } from '../data/now';
import {
  SEASONS,
  matchingSeason,
  sameDayInMonth,
  shiftDay,
  type SimulationDate,
} from '../scene/solar';
import type { SunlightAtPoint } from '../scene/sunlightAt';
import { StatusBadge, developmentSummary } from './chrome';
import { DateField } from './DateField';
import { ApartmentControls, WindowResult } from './Apartment';
import type { Facade } from '../scene/facades';
import type { WindowSunlight } from '../scene/windowSunlight';
import { searchCity, type SearchHit } from '../data/search';
import type { BuildingDetail } from '../data/useBuildingDetail';

/**
 * What the header's search field found.
 *
 * WHY IT IS A COMPONENT AND NOT PART OF THE FIELD
 *   The field is in the bar and the results hang below it, over the city.
 *   Keeping them apart means App can own the text — it has to, now that the
 *   field outlives the screen it was typed on — while the matching, which is
 *   a scan of 4,443 buildings, still only happens where the answer is shown.
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
          <span className={`results__kind results__kind--${hit.kind}`} />
          {hit.label}
          <small>{hit.detail}</small>
        </button>
      ))}
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * HOW FAR ALONG YOU ARE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Three steps across the top of every panel, with the one you are on marked.
 *
 * WHY IT EXISTS
 *   Getting an answer out of this takes a fixed order: choose a place, open
 *   its sunlight, measure a spot. Nothing enforces that order and nothing
 *   stated it either — the sunlight button is simply inert until there is a
 *   subject, and a reader who presses it and sees nothing has learnt that it
 *   is broken, not that something comes first.
 *
 *   The panel already had the sequence written down, in a box headed "Start
 *   here". It arrives on the third screen. By then the reader has either
 *   worked the order out or given up, and is being told something they no
 *   longer need — which is the usual fate of instructions placed where they
 *   were easy to add rather than where they are wanted.
 *
 * WHY IT IS NOT A SET OF LINKS
 *   Because two of the three cannot be jumped to. Measuring needs a subject
 *   and a subject needs choosing, so a step ahead of where you are is not a
 *   destination — it is a description of what happens next. Made pressable
 *   it would be three controls, two of them dead.
 *
 *   The step behind you IS reachable, and it already has a control: the back
 *   link at the top of the panel. A second way to go back, in a row that is
 *   otherwise inert, would read as the row being navigation.
 *
 * WHAT IT IS NOT ALLOWED TO BE
 *   Big. It is a caption on the panel, not a feature of it — three words and
 *   three marks. If it ever needs explaining it has failed, and if it takes
 *   more room than the heading under it, it is competing with the thing it
 *   is meant to introduce.
 */
export function Progress({ at }: { at: 'place' | 'sunlight' | 'spot' }) {
  const steps = [
    { id: 'place', label: 'Place' },
    { id: 'sunlight', label: 'Sunlight' },
    { id: 'spot', label: 'Spot' },
  ] as const;
  const reached = steps.findIndex((step) => step.id === at);

  return (
    <ol className="progress" aria-label="Where you are">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={
            index < reached ? 'is-done' : index === reached ? 'is-here' : undefined
          }
          /*
           * The current step is announced as such; the others are read as
           * ordinary list items. `aria-current="step"` is the one word that
           * carries this for a screen reader, and without it the row is
           * three nouns with no relationship.
           */
          aria-current={index === reached ? 'step' : undefined}
        >
          <span className="progress__mark" aria-hidden="true">
            {index < reached ? (
              <svg width="11" height="11" viewBox="0 0 12 12">
                <path
                  d="M2.4 6.4 4.8 8.8 9.6 3.2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

/* ── 01 Landing ─────────────────────────────────────────── */

/**
 * Which half of the landing panel is showing.
 *
 * No null: the panel is the landing screen now rather than something opened
 * beside it, so one of the two is always the answer. It was nullable while
 * there were two panels that could each be closed, and leaving the null in
 * would have meant every reader of this type wondering what a closed landing
 * screen looks like.
 *
 * Exported because App holds it and Landing renders the tabs for it.
 */
export type LandingPanel = 'how' | 'why';

/**
 * Three figures about living in the CBD, each with where it came from.
 *
 * WHY THE SOURCE IS PART OF THE DATA AND NOT A FOOTNOTE
 *   A percentage with no source is an assertion. These three are the only
 *   numbers in the whole application that did not come out of the model —
 *   everything else on screen is computed from surveyed geometry and can be
 *   checked against it, and these cannot. So each one carries its origin in
 *   the same object, and the panel below cannot render one without the other.
 *
 * WHY EACH URL POINTS AT THE FIGURE AND NOT AT THE ORGANISATION
 *   Every link below was opened and the number read off the page it lands
 *   on. A citation that goes to a department's front door leaves the reader
 *   to find the claim themselves, and a citation that goes to a plausible
 *   address nobody checked is worse than none: it looks verified.
 *
 *   One of these took two attempts for that reason. The walking figure is
 *   quoted all over the transport strategy's site, but the page that reads
 *   most like its home — the strategy's walking chapter — does not actually
 *   contain it, so the link goes to the strategy itself.
 *
 * WHY EACH ONE SAYS WHAT IT IS OF
 *   "99.2%" is meaningless alone; "of occupied private dwellings" is the
 *   fact. The large figure is a way in, not the claim — which is why the
 *   qualifier is never abbreviated to make the card tidier.
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

/**
 * The three steps, written once.
 *
 * ONE LIST, TWO PLACES, AND THAT IS THE POINT. They were briefly two — a
 * clipped pair of lines for the card and a longer paragraph each for the
 * panel — and the panel's version was worse for being longer: somebody who
 * has pressed "How it works" wants the shape of the thing, not more prose.
 * A step you can read at a glance is a step you can hold all three of.
 *
 * So the card and the panel show the same words in the same numbered form.
 * The panel adds the title, the reason and the button; it does not restate
 * the steps at greater length.
 */
/** The two halves, in the order the tabs sit in. */
const TABS: { id: LandingPanel; label: string }[] = [
  { id: 'how', label: 'How it works' },
  { id: 'why', label: 'Why it matters' },
];

const STEPS = [
  { title: 'Find a place', body: 'Search an address or explore the map.' },
  { title: 'Open a project', body: 'See an approved project near you.' },
  { title: 'Follow the sun', body: 'Choose a season and time. Compare shadows.' },
];/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE PANEL YOU ARRIVE AT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY IT IS ONE AND NOT TWO
 *   It was a card on the left saying what this is, and a panel on the right
 *   saying it again at greater length — the same title twice, the same three
 *   steps twice, and an "Explore the CBD" button in each. Two panels, one of
 *   which had to be opened to be read, for one page of text.
 *
 *   Whichever the reader looked at first, the other was either a repeat or a
 *   thing they had not found yet. Merged, there is one place the answer is
 *   and one button that leaves it.
 *
 * WHY IT IS ON THE LEFT
 *   Because that is the column the explore screen's layer panel uses, so
 *   arriving and then exploring leaves the interface where it was. The
 *   right-hand column is for what you have CHOSEN — a project, a building,
 *   the measurement at a spot — and nothing has been chosen yet.
 *
 * WHAT THE TABS SWITCH, AND WHAT THEY DO NOT
 *   Only the block under the button. The title, the sentence and the way in
 *   are true either way, so they do not move when the tab does — a heading
 *   that changed under the tab row would make the two halves read as two
 *   different pages rather than as two answers about one thing.
 */
export function Landing({
  onExplore,
  onPanel,
  panel,
}: {
  onExplore: () => void;
  /** Which half is showing under the button. */
  onPanel: (next: LandingPanel) => void;
  panel: LandingPanel;
}) {
  return (
    <section className="panel panel--left landing" aria-labelledby="landing-title">
      <p className="panel__eyebrow">Melbourne · A city in the making</p>

      {/*
        Two lines, set as two lines. `text-wrap: balance` used to decide
        where this broke and it is not a decision an algorithm can make:
        "Your city." and "Tomorrow, today." are a pair, and a break anywhere
        else reads as a sentence that ran out of room.
      */}
      <h1 className="landing__title" id="landing-title">
        <span>Your city.</span>
        <span>Tomorrow, today.</span>
      </h1>

      <p className="landing__body">
        Explore what&rsquo;s being built around you — and how it could change
        the sunlight on your street.
      </p>

      {/*
        Above everything it explains. Somebody who already knows what this is
        should not have to read past an explanation to get in; somebody who
        does not will read down to it anyway.
      */}
      <button type="button" className="button button--block" onClick={onExplore}>
        Explore the CBD →
      </button>

      {/*
        A real tab list, so a screen reader announces these as two views of
        one thing rather than as two unrelated buttons.
      */}
      {/*
        The whole tab pattern, or none of it.

        It began as role="tablist" with two role="tab" buttons and nothing
        else — no ids, no aria-controls, no panel, no roving focus. That
        promises assistive technology a widget and then does not build it,
        which is worse than two plain buttons would have been: the
        announcement says "tab, 1 of 2" and then arrow keys do nothing.

        So it is finished. One tab stop for the pair, arrows to move between
        them, and a panel below that says which tab it belongs to.
      */}
      <div className="landing__tabs" role="tablist" aria-label="About this model">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`landing-tab-${id}`}
            aria-controls={`landing-tabpanel-${id}`}
            aria-selected={panel === id}
            /* Only the selected tab is a tab stop; the arrows do the rest. */
            tabIndex={panel === id ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const next = TABS[(TABS.findIndex((t) => t.id === panel) + 1) % TABS.length];
              onPanel(next.id);
              // Focus follows selection, which is the pattern's default for
              // tabs whose panels are cheap to show.
              document.getElementById(`landing-tab-${next.id}`)?.focus();
            }}
            onClick={() => onPanel(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        /*
          Keyed on the tab, so switching replaces the element rather than
          swapping its children. React would otherwise keep the same node and
          the enter animation — which only runs on mount — would never fire
          again after the first tab.
        */
        key={panel}
        role="tabpanel"
        id={`landing-tabpanel-${panel}`}
        aria-labelledby={`landing-tab-${panel}`}
        className="landing__tabpanel"
      >
        {panel === 'how' ? (
        /*
          An ordered list, because it is one, with its own markers off: left
          on, a screen reader says "1. 01 Find a place" and the two numbers
          disagree in the one place a list should never be ambiguous.
        */
        <ol className="steps" role="list">
          {STEPS.map((step, index) => (
            <li
              className="step"
              key={step.title}
              style={{ '--i': index } as React.CSSProperties}
            >
              <span className="step__number" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="step__title">{step.title}</span>
              <span className="step__body">{step.body}</span>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <ol className="howto__steps" role="list">
            {FIGURES.map((entry) => (
              <li key={entry.title}>
                <div className="howto__step">
                  <p className="howto__figure">{entry.figure}</p>
                  <p className="howto__step-title">{entry.title}</p>
                  <p className="howto__step-body">{entry.body}</p>
                </div>
                {/*
                  Outside the card, deliberately. Inside it the attribution
                  reads as part of the claim; below it, it reads as the thing
                  the claim rests on.
                */}
                <p className="howto__source">
                  Source:{' '}
                  {/*
                    A new tab, because leaving the page would throw away the
                    date, the hour and whatever is selected — all of which
                    live in this tab's state. `noreferrer` with it: `noopener`
                    is what stops the opened page reaching back through
                    window.opener, and modern browsers imply it, but the pair
                    is what makes that true everywhere.
                  */}
                  <a href={entry.href} target="_blank" rel="noreferrer noopener">
                    {entry.source}
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path
                        d="M3.4 1h5.1v5.1M8.5 1 1.4 8.1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
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
          <p className="howto__caveat">
            Melbourne suburb extends beyond the Hoddle Grid. Walking figures
            describe trips; survey figures describe respondents.
          </p>
        </>
        )}
      </div>

      <p className="landing__fine">Demo model · Illustrative estimates</p>
    </section>
  );
}

/**
 * What the green means.
 *
 * "Project", not "development", here and everywhere else a reader sees the
 * word. The interface used both — the landing card managed both inside one
 * two-line step, "Open a project" above "See approved development near you"
 * — which asks somebody to work out that two names are one thing before
 * they have worked out what the thing is.
 *
 * Project is the word the navigation already uses, and navigation words get
 * learnt whether or not anyone means to learn them. It is also the less
 * ambiguous of the two: "approved development" can be read as the activity
 * rather than the object, and in that sentence it was.
 *
 * The data keeps its own word. `Development`, `devId`, `subjectKind` and the
 * planning records they come from are unchanged; this is about what is
 * written on the screen.
 *
 * The one piece of colour in the model that carries information, so it is the
 * one that needs a key. Everything else is grey because it is a building;
 * these are green because somebody approved them.
 *
 * The swatch is never alone — the words are always beside it, and the words
 * are what say which is which. A reader who cannot tell the green from the
 * grey loses the shortcut and nothing else.
 */
export function Legend() {
  return (
    <aside className="legend">
      <span className="legend__swatch" aria-hidden="true" />
      Approved project
      <span className="legend__sep" aria-hidden="true">
        ·
      </span>
      <span className="legend__note">Demo model</span>
    </aside>
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
  onZoom: (factor: number) => void;
  onOrbit: (radians: number) => void;
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

/* ── 02 Discovery Map ───────────────────────────────────── */

export interface Layers {
  developments: boolean;
  shadows: boolean;
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
 *   touch again. Opened from the header it is available everywhere and in
 *   the way nowhere.
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
        <h2 className="sheet__title" id="layers-title">
          Map layers
        </h2>
        <button
          type="button"
          className="sheet__close"
          onClick={onClose}
          aria-label="Close map layers"
          title="Close"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M3.6 3.6l7.8 7.8M11.4 3.6l-7.8 7.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
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

      <button type="button" className="button button--block" onClick={onClose}>
        Done
      </button>
    </aside>
  );
}

function ExistingApprovedToggle({
  showProposed,
  onChange,
  /*
   * The same before/after control, named for whatever is being taken away.
   * For a proposal that is "the approved plan"; for a building that is the
   * building itself, which the city can be drawn without because it is
   * already lifted out of the merged geometry to be highlighted.
   */
  labels = { off: 'Existing City', on: 'Approved Plan' },
}: {
  showProposed: boolean;
  onChange: (next: boolean) => void;
  labels?: { off: string; on: string };
}) {
  return (
    <div
      className="segmented"
      role="group"
      aria-label="City model"
      style={{ '--count': 2, '--at': showProposed ? 1 : 0 } as React.CSSProperties}
    >
      <button
        type="button"
        aria-pressed={!showProposed}
        onClick={() => onChange(false)}
        data-label={labels.off}
      >
        {labels.off}
      </button>
      <button
        type="button"
        aria-pressed={showProposed}
        onClick={() => onChange(true)}
        data-label={labels.on}
      >
        {labels.on}
      </button>
    </div>
  );
}

/**
 * The approved projects nearest wherever the person currently is.
 *
 * It takes a plain point and a label rather than a Development, because the
 * chosen place can now be an existing building found by searching. Passing a
 * Development meant this list stayed anchored to a proposal while the camera
 * and the highlight had moved somewhere else — two different "here" on one
 * screen.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS CHANGING NEARBY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The explore screen's whole left panel: what is being built around here,
 * and the switch between the city as it stands and the city as approved.
 *
 * WHY THE LIST IS ROWS AND NOT CARDS WITH BUTTONS
 *   Each project used to be a card with a "View project" button under it,
 *   which made the button the target and the address a caption. But the
 *   address is what somebody is looking for — they are scanning for a street
 *   they know — so the whole row is the control and the address is the
 *   biggest thing in it. Three buttons that each say the same two words are
 *   three places to look that tell you nothing.
 *
 * WHY THE CHOSEN ONE IS MARKED HERE AND NOT ONLY ON THE MAP
 *   A green building on the map is easy to lose behind a tower. The row
 *   carries the same selection so there is always one place on screen that
 *   says which project is being talked about — and clicking the map and
 *   clicking the list have to agree, or the reader has two answers.
 *
 * WHAT THE COUNT IS HONEST ABOUT
 *   It says how many are shown AND that these are the nearest, because "3
 *   nearby projects" on a model holding 49 of them would otherwise read as
 *   there being three.
 */
export function NearbyProjects({
  anchorEN,
  label,
  excludeDevId,
  developments,
  showProposed,
  onShowProposed,
  onOpen,
  onClose,
}: {
  anchorEN: [number, number];
  label: string;
  /** Omit the project itself when the chosen place IS a project. */
  excludeDevId?: string;
  developments: Development[];
  /** Which row is the one being shown on the map, if any. */
  showProposed: boolean;
  onShowProposed: (next: boolean) => void;
  onOpen: (development: Development) => void;
  onClose: () => void;
}) {
  const nearby = useMemo(() => {
    return developments
      .filter((d) => d.devId !== excludeDevId)
      .map((d) => ({
        development: d,
        distance: Math.hypot(d.anchorEN[0] - anchorEN[0], d.anchorEN[1] - anchorEN[1]),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [developments, anchorEN, excludeDevId]);

  return (
    <aside className="panel panel--left sheet" aria-labelledby="nearby-title">
      <div className="sheet__head">
        <p className="panel__eyebrow">Explore the CBD</p>
        {/*
          "Start over", not "Close".
          
          It was labelled as a close and it does not close anything — it
          returns to the opening screen. A cross that quietly navigates is
          the worst of both: somebody expecting a panel to be dismissed gets
          sent back to the beginning, and somebody who wanted the beginning
          had no reason to think this was the way.
        */}
        <button
          type="button"
          className="sheet__close"
          onClick={onClose}
          aria-label="Start over"
          title="Start over"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M3.6 3.6l7.8 7.8M11.4 3.6l-7.8 7.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <Progress at="place" />

      <h2 className="sheet__title" id="nearby-title">
        What&rsquo;s changing nearby?
      </h2>
      <p className="sheet__meta">
        {label} · {nearby.length} nearby {nearby.length === 1 ? 'project' : 'projects'}
      </p>

      <ExistingApprovedToggle showProposed={showProposed} onChange={onShowProposed} />

      <ul className="rows" role="list">
        {nearby.map(({ development, distance }, index) => {
          return (
            <li key={development.devId} style={{ '--i': index } as React.CSSProperties}>
              {/*
                The row IS the button. A card with a control inside it gives a
                screen reader two things to announce for one project, and a
                mouse two targets where one of them does nothing.
              */}
              <button
                type="button"
                className="row"
                onClick={() => onOpen(development)}
              >
                <StatusBadge status={development.status} />
                <span className="row__title">
                  {development.streetAddress.split(',')[0]}
                </span>
                <span className="row__meta">
                  {developmentSummary(development)} · {Math.round(distance)} m away
                </span>
                <svg
                  className="row__go"
                  width="9"
                  height="14"
                  viewBox="0 0 9 14"
                  aria-hidden="true"
                >
                  <path
                    d="M1.5 1 L7.5 7 L1.5 13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>

      {/*
        "All 3 shown" only when that is true of the nearest three AND of the
        model. Said flatly it would be a claim about the city rather than
        about the list.
      */}
      <p className="sheet__fine">
        {nearby.length === developments.length - (excludeDevId ? 1 : 0)
          ? `All ${nearby.length} nearby projects shown`
          : `Nearest ${nearby.length} of ${developments.length} shown`}{' '}
        · Demo data
      </p>

      <p className="note">Select a project here or click a green building on the map.</p>
    </aside>
  );
}

/* ── 03 Development Overview ────────────────────────────── */

/**
 * The top of a subject's panel: the way back, the way out, what it is, and
 * the two halves it can be read as.
 *
 * Shared rather than written twice, because the two halves are meant to feel
 * like one panel with a tab changed — and a head that drifted by two pixels
 * between them would make the tab look like a navigation.
 */
/*
 * SET BY THE ARROW KEYS, READ BY THE HEADER THAT MOUNTS NEXT.
 *
 * Module scope, and not a ref, because the header does not survive the thing
 * it is trying to remember. Switching tabs swaps one panel component for
 * another, so the tab strip is unmounted and a new one is built -- a ref
 * inside it is gone by the time the destination exists, and so is the button
 * that focus was moved to. Focusing synchronously in the key handler put
 * focus on an element React removed a moment later, which dropped the reader
 * back to the top of the document mid-keystroke.
 *
 * A module-level flag outlives the unmount, which is exactly the span that
 * has to be bridged. It is cleared the first time it is read, so a tab
 * switch made with the mouse never steals focus.
 */
let focusTabOnMount = false;

function SubjectHead({
  status,
  existing,
  title,
  locality,
  meta,
  backLabel,
  tab,
  onTab,
  onBack,
  onClose,
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
  meta: string;
  backLabel: string;
  tab: 'overview' | 'sunlight';
  onTab: (next: 'overview' | 'sunlight') => void;
  onBack: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!focusTabOnMount) return;
    focusTabOnMount = false;
    document.getElementById(`subject-tab-${tab}`)?.focus();
  }, [tab]);

  return (
    <>
      {/*
        ── THE TWO WAYS OUT, AT THE SIZE THEY DESERVE ────────────────────────

        Both were drawn as full controls: a bordered button for going back and
        a cross for starting over. Two framed boxes above the subject's name
        competed with the name, and the heaviest thing on the panel was the
        way off it.

        Now they are what they are -- a text link and an icon. Both still
        carry a 44px target; the room is in padding rather than in a border,
        so the hit area is unchanged and only the drawing is quieter.
      */}
      <div className="sheet__nav">
        <button type="button" className="backlink" onClick={onBack}>
          <svg width="13" height="13" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M9.2 2.5 4.4 7.5l4.8 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{backLabel}</span>
        </button>

        {/*
          The cross, by request.

          It is still wired to onClose, which returns to the opening screen
          rather than dismissing the panel, so the label says "Start over"
          for anybody who cannot see the mark. The drawing is the familiar
          one; the name and the behaviour are unchanged.
        */}
        <button
          type="button"
          className="sheet__close"
          onClick={onClose}
          aria-label="Start over"
          title="Start over"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M3.6 3.6l7.8 7.8M11.4 3.6l-7.8 7.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/*
        The subject, in three sizes.

        The street line is the thing being looked at, so it is the largest
        text on the panel. The suburb only settles which city, and the use and
        height line is detail -- each one step quieter than the last, so the
        order they are read in is decided by the drawing rather than by luck.
      */}
      <div className="subject">
        {status && <StatusBadge status={status} tone="soft" />}
        {existing && <span className="badge badge--soft">Existing</span>}
        <h2 className="sheet__title" id="subject-title">
          {title}
        </h2>
        {locality && <p className="sheet__locality">{locality}</p>}
        <p className="sheet__meta">{meta}</p>
      </div>

      {/*
        --at is which segment is chosen, and it is what the sliding face
        follows. See .segmented in ui.css: the raised surface is one element
        belonging to the strip rather than a background on whichever button
        happens to be selected, so it can travel between them.
      */}
      <div
        className="sheet__tabs"
        role="tablist"
        aria-label="This project"
        style={{ '--count': 2, '--at': tab === 'overview' ? 0 : 1 } as React.CSSProperties}
      >
        {(
          [
            ['overview', 'Overview'],
            ['sunlight', 'Sunlight'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`subject-tab-${id}`}
            aria-controls="subject-tabpanel"
            aria-selected={tab === id}
            tabIndex={tab === id ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const next = tab === 'overview' ? 'sunlight' : 'overview';
              focusTabOnMount = true;
              onTab(next);
            }}
            onClick={() => onTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Area uses and counted uses, told apart by their unit.
 *
 * The distinction matters because they are read differently: 7,743 m² of
 * office is a sentence, and 72 bike spaces is a figure. Putting a floor area
 * on a tile makes it look like a headline number when it is really a
 * measurement, and burying a bike count in prose loses the one thing about a
 * building somebody might actually be looking for.
 *
 * The test is the unit, not the name, because the vocabulary of use types
 * comes from the planning records and this file does not get to decide it.
 */
function splitUses(development: Development) {
  const area = development.landUses.filter((use) => /m2|m²|sqm/i.test(use.unit ?? ''));
  const counted = development.landUses
    .filter((use) => !area.includes(use))
    .sort((a, b) => b.quantity - a.quantity);
  return { area, counted };
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * ONE PROJECT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY THE HEADLINE IS BUILT FROM THE DATA
 *   The design shows an editorial line — "A new place to work, shop and
 *   arrive by bike." Nothing in the records says that. What they do say is
 *   which uses the building has, so the sentence is assembled from those and
 *   claims nothing else. A written headline would have to be written per
 *   project, by somebody, for forty-nine of them.
 *
 * WHY THERE IS NO "PUBLIC SPACE NEARBY" SECTION
 *   The design names a footpath. There is no protected-public-space data —
 *   it is user story 1.3 and nothing behind it exists yet — and naming a
 *   specific footpath under a heading that implies it was assessed would be
 *   inventing the one kind of claim this product must not invent. The
 *   sunlight tab measures a point the reader chooses instead.
 */
export function DevelopmentPanel({
  development,
  storeys,
  tab,
  onTab,
  onBack,
  onClose,
}: {
  development: Development;
  storeys?: number;
  /** Which tab is showing. 'sunlight' is a different screen; see App. */
  tab: 'overview' | 'sunlight';
  onTab: (next: 'overview' | 'sunlight') => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const tallest = development.parts.reduce((a, b) => (a.heightM > b.heightM ? a : b));
  const { area, counted } = splitUses(development);

  const uses = development.landUses
    .map((use) => use.useType.toLowerCase())
    .filter((use, i, all) => all.indexOf(use) === i);
  const headline =
    uses.length > 0
      ? `A new ${uses.slice(0, 2).join(' and ')} building.`
      : 'A new building.';

  /*
   * The suburb and postcode, which the address carries after the street.
   *
   * Its own line in the header rather than appended to the summary: it is a
   * different kind of fact from "Office + Retail / 51 storeys / 190 m", and
   * run together with them by a middot it read as a fourth attribute of the
   * building. Empty when the address has no comma, in which case the header
   * simply does not draw the line.
   */
  const locality = development.streetAddress.split(',').slice(1).join(',').trim();

  return (
    <aside className="panel panel--left sheet" aria-labelledby="subject-title">
      <SubjectHead
        status={development.status}
        title={development.streetAddress.split(',')[0]}
        locality={locality}
        meta={developmentSummary(development, storeys)}
        backLabel="Nearby projects"
        tab={tab}
        onTab={onTab}
        onBack={onBack}
        onClose={onClose}
      />

      <div
        /* See the note on the landing panel: keyed so it can arrive. */
        key={tab}
        role="tabpanel"
        id="subject-tabpanel"
        aria-labelledby={`subject-tab-${tab}`}
        className="sheet__tabpanel"
      >
        <p className="panel__eyebrow">What is proposed</p>
        <h3 className="sheet__lede">{headline}</h3>

        <div className="tiles">
          <div className="tile">
            <p className="tile__figure">{tallest.heightM.toFixed(0)} m</p>
            <p className="tile__label">Building height</p>
          </div>
          {/*
            The second tile only exists when there is a counted use to put in
            it. An empty tile beside a full one reads as a number that failed
            to load.
          */}
          {counted[0] && (
            <div className="tile">
              <p className="tile__figure">{counted[0].quantity.toLocaleString()}</p>
              <p className="tile__label">{counted[0].useType}</p>
            </div>
          )}
        </div>

        <p className="sheet__body">
          {area.length > 0 && (
            <>
              {area
                .map(
                  (use) =>
                    `${use.quantity.toLocaleString()} ${use.unit} of ${use.useType.toLowerCase()}`,
                )
                .join(' and ')}
              .{' '}
            </>
          )}
          The building reaches {tallest.topAhdM.toFixed(0)} m above the model datum.
        </p>

        <button
          type="button"
          className="button button--block"
          onClick={() => onTab('sunlight')}
        >
          Explore sunlight &amp; shadow
        </button>
      </div>

      <p className="sheet__fine">Illustrative demo data · Not a planning assessment.</p>
    </aside>
  );
}

/* ── Sunlight simulation ────────────────────────────────── */

/**
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT CHANGES ON YOUR STREET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The sunlight half of a subject's panel. Two states: before a spot has been
 * chosen, and after — which are different enough to be two designs and are
 * the same panel because they are the same question part-answered.
 *
 * WHY THE DATE CONTROLS ARE FOLDED AWAY ONCE THERE IS A RESULT
 *   A date field, four season buttons and a note take about a third of the
 *   panel, and once a figure exists that figure is what the reader came for.
 *   The date is still the thing the figure depends on, so it stays on screen
 *   as a readout with one button to open the controls again — visible, and
 *   not in the way.
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
/**
 * Everything the apartment half needs, gathered by App.
 *
 * One object rather than nine props: the panel does not compute any of it and
 * has no opinion about it, so passing it as a unit keeps the signature of a
 * component that is already long from growing another page.
 */
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
 * skyline — and the panel only displays it and reports presses back. Passed
 * as a unit rather than as a dozen props because none of it is independent:
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
  floor: number;
  onFloor: (next: number) => void;
  /** Compass name, or null before a side has been chosen. */
  side: string | null;
  onSide: (compass: string) => void;
  floorsAboveGround: number | null;
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
  showProposed,
  onShowProposed,
  subjectKind = 'development',
  apartment,
  onTab,
  onBack,
  onClose,
}: {
  status?: Development['status'];
  title: string;
  /** Suburb, state and postcode, when the address had them to give. */
  locality?: string;
  meta: string;
  date: SimulationDate;
  onDate: (next: SimulationDate) => void;
  /** Said only when the present moment could not be shown as it is. */
  nowNote: string | null;
  dateLabel: string;
  /** The figures for the chosen spot, or null while none has been chosen. */
  measured: SunlightAtPoint | null;
  onClearPoint: () => void;
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
  showProposed: boolean;
  onShowProposed: (next: boolean) => void;
  subjectKind?: 'development' | 'building';
  /**
   * The "I live here" half of the screen, for a building that is already
   * standing. Absent for a proposal: nobody lives in one yet, and offering
   * to measure a window in a building that has not been built would be
   * inviting a question the model cannot answer honestly.
   */
  apartment?: ApartmentState;
  onTab: (next: 'overview' | 'sunlight') => void;
  onBack: () => void;
  onClose: () => void;
}) {
  /*
   * Which question the action area is answering.
   *
   * Panel state rather than App state: nothing outside this sheet depends on
   * it, and lifting it would put a preference about a control a long way from
   * the control. The 3D scene follows the receptor and the window place that
   * App already holds, so it does not need to know which tab of the panel is
   * showing.
   */
  const [measuring, setMeasuring] = useState<'spot' | 'window'>('spot');
  const onMeasuring = (next: 'spot' | 'window') => setMeasuring(next);

  const preset = matchingSeason(date);
  /*
   * What to call the thing on screen. "Project" for a proposal — see the
   * note on Legend — and "building" for one that is already standing, which
   * is a different fact rather than a different word for the same one.
   */
  const noun = subjectKind === 'building' ? 'building' : 'project';

  const hours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  };

  /*
   * ── BRING THE ANSWER INTO VIEW ──────────────────────────────────────────
   *
   * The panel is taller than the room it has and scrolls inside itself. The
   * result is at the bottom of it, under the date, the seasons and the
   * comparison -- so on a laptop somebody clicked a spot on the ground, the
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
    <aside className="panel panel--left sheet" aria-labelledby="subject-title">
      <SubjectHead
        status={status}
        existing={subjectKind === 'building'}
        title={title}
        locality={locality}
        meta={meta}
        backLabel={subjectKind === 'building' ? 'Back to the map' : 'Nearby projects'}
        tab="sunlight"
        onTab={onTab}
        onBack={onBack}
        onClose={onClose}
      />

      <div
        role="tabpanel"
        id="subject-tabpanel"
        aria-labelledby="subject-tab-sunlight"
        className="sheet__tabpanel sheet__tabpanel--flow"
      >
        <h3 className="sheet__lede">Explore sunlight</h3>
        <p className="sheet__sub">See how this {noun} changes your street.</p>

        {/*
          -- WHEN -----------------------------------------------------------

          The date used to appear three times on this panel: a pill reading
          "21 December | 08:20", the field below it, and the result's own
          heading. Three statements of one fact, none obviously in charge.

          The field owns the date now, because it is the control that sets it.
          The HOUR is not here at all: the dock along the bottom of the screen
          sets it and shows it, and a second reading of the same clock up here
          was a number to keep in sync for nobody's benefit.
        */}
        <section className="block">
          <h4 className="block__head">Date &amp; season</h4>

          {/*
            -- THE DATE, AS A SURFACE OVER A REAL INPUT ---------------------

            The words are ours and the control underneath is the browser's.

            WHY NOT A CALENDAR OF OUR OWN
              Date pickers are among the hardest things to build correctly: a
              grid that answers arrow keys in two dimensions, page up and down
              for months, home and end for weeks, an announced label for every
              cell, and the whole of it in the reader's own locale. Rebuilding
              that to control how a border looks is a bad trade, and the
              version that gets shipped is always the one that works with a
              mouse.

              So the native input is still the control. What is drawn is only
              what the input would have drawn badly.
          */}
          <div className="dateline">
            <button
              type="button"
              className="dateline__step"
              onClick={() => onDate(shiftDay(date, -1))}
              aria-label="The day before"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                <path
                  d="M9.2 2.5 4.4 7.5l4.8 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <DateField date={date} onDate={onDate} />

            <button
              type="button"
              className="dateline__step"
              onClick={() => onDate(shiftDay(date, 1))}
              aria-label="The day after"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                <path
                  d="M5.8 2.5l4.8 5-4.8 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/*
            -1 when the date is not one of the four. The strip then has no
            raised face at all, which is correct -- an arbitrary Tuesday in
            October is not a season preset, and parking the marker on the
            nearest one would claim it was.
          */}
          <div
            className="segmented segmented--four"
            role="group"
            aria-label="Season"
            data-chosen={preset ? 'yes' : 'no'}
            style={
              {
                '--count': 4,
                '--at': SEASONS.findIndex((option) => option.key === preset?.key),
              } as React.CSSProperties
            }
          >
            {SEASONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={option.key === preset?.key}
                /* The day on screen is kept; only the month moves. */
                onClick={() => onDate(sameDayInMonth(date, option.month))}
                data-label={option.label}
              >
                {option.label}
              </button>
            ))}
          </div>

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

        {/*
          The control the whole screen exists for, and it stays put.

          It used to live inside the "no point yet" branch, so measuring took
          it off the screen while the state it sets carried on: somebody who
          turned the subject off, then measured, was left looking at a city
          with a building missing and no control to put it back.

          Switching it does not change what the figures below mean. They are
          the same point on the same date, measured with and without the
          subject either way -- this decides what the MAP draws, not what was
          measured.
        */}
        <section className="block">
          <h4 className="block__head">Compare the {noun}</h4>
          <ExistingApprovedToggle
            showProposed={showProposed}
            onChange={onShowProposed}
            labels={{ off: `Without this ${noun}`, on: `With this ${noun}` }}
          />
        </section>

        {/*
          ── WHICH QUESTION IS BEING ASKED ──────────────────────────────────

          Only for a building that is standing, and only when its footprint
          gave us sides to offer. A proposal has no residents, and a shape we
          could not read has no sides to choose between -- in both cases the
          switch would be a control with one useful position.

          The ground flow stays the default. Somebody who came here from a
          proposal is asking about a street, and the switch is there for the
          reader who is asking about their own home.
        */}
        {apartment && apartment.sides.length > 0 && (
          <section className="block">
            <h4 className="block__head">What would you like to measure?</h4>
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
          </section>
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
              <button
                type="button"
                className="button button--ghost button--block"
                onClick={onCancelChoose}
              >
                Cancel
              </button>
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
                {measured.lostMin === 0 ? (
                  <p className="result__figure result__figure--none">
                    This {noun} takes no direct sun from here.
                  </p>
                ) : (
                  <>
                    <p className="result__figure">{hours(measured.lostMin)}</p>
                    <p className="result__caption">
                      less direct sunlight from this {noun}
                    </p>
                    {/*
                      NOT "total daylight". It is the sun this spot would get
                      with the subject taken away, which is the other half of
                      the subtraction above -- and on a street of towers it is
                      nowhere near the whole day.
                    */}
                    <p className="result__against">
                      {hours(measured.withoutSubjectMin)} without this {noun}
                    </p>
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
              <button
                type="button"
                className="button button--block"
                onClick={onChoose}
              >
                Choose another point
              </button>

              <div className="sheet__actions">
                <button type="button" className="button button--ghost" onClick={onClearPoint}>
                  Clear point
                </button>
                {/*
                  The measured spot is a place the reader chose and asked a
                  question about, which makes it the one place worth being put
                  down in. From two kilometres up a shadow is a grey shape on a
                  diagram; from the footpath it is the thing the question was
                  about.
                */}
                <button type="button" className="button button--ghost" onClick={onStand}>
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
                  Stand here
                </button>
              </div>
            </>
          ) : (
            !choosing && (
              <>
                <p className="sheet__sub">
                  Select a point on the ground to measure the change in
                  sunlight.
                </p>
                <button
                  type="button"
                  className="button button--block"
                  onClick={onChoose}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
                    <circle
                      cx="12"
                      cy="12"
                      r="6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M12 2v5m0 10v5M2 12h5m10 0h5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                  Choose a spot
                </button>
              </>
            )
          )}
        </div>

        {/*
          The three steps, folded away.

          They were an amber box captioned "Start here", open at all times and
          sitting between the reader and the controls it described. Read once,
          it was in the way on every visit after that. Closed by default and
          one press from open keeps it for the person who wants it and gives
          the panel back to everybody else. The steps themselves are unchanged.
        */}
        <details className="howto">
          <summary>How to explore sunlight</summary>
          <ol className="howto__steps">
            <li>Choose a date or a season above.</li>
            <li>Move the time along the bar at the bottom to follow the shadow.</li>
            <li>Compare with and without this {noun}.</li>
            <li>Choose a spot on the ground to measure what it loses.</li>
          </ol>
        </details>
      </div>

      {/*
        Both caveats in one place, at the end.

        One of them used to sit between the figure and the buttons — four
        lines of qualification wedged between the answer and the thing to do
        about it, which pushed the actions off the fold and made the reader
        scroll past a disclaimer to reach them. Qualifications belong after
        the thing they qualify, not inside it.
      */}
      {/*
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
            ? `Sampled every ${measured.stepMinutes} minutes. Existing buildings and the slope of the ground are not counted, so a spot already in someone else’s shadow will still be shown losing sun here. `
            : ''}
        Illustrative shadow shapes · Demo data. Not a planning assessment.
      </p>
    </aside>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * THE HOUR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A quiet dock over the map: the time on the left, the day on the right.
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
  label,
  caption,
  daylight,
}: {
  minutes: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  label: string;
  caption: string;
  /** When the sun crosses the horizon, in minutes. Null outside the window. */
  daylight: { rise: number | null; set: number | null };
}) {
  const place = (at: number) => Math.min(100, Math.max(0, ((at - min) / (max - min)) * 100));

  /*
   * The band, with the existing reading of null kept: a missing crossing
   * means the sun did not cross inside the window, so the band runs to that
   * edge rather than disappearing. The LABELS do not make the same
   * substitution — saying "sunrise 06:00" because the window starts there
   * would be inventing an astronomical fact out of a range limit.
   */
  const from = place(daylight.rise ?? min);
  const to = place(daylight.set ?? max);
  const bothKnown = daylight.rise !== null && daylight.set !== null;

  /* Only when noon is actually inside the window, and at its real position. */
  const noon = 12 * 60;
  const noonAt = noon > min && noon < max ? place(noon) : null;

  return (
    /*
     * Two elements, because an element cannot be its own container query.
     *
     * The outer one is the position and the measurement — it spans the gap
     * between the panel and the view controls, and declares that gap as the
     * width the layout inside should be judged against. The inner one is the
     * card. Merged, the dock could only react to the window, which is the
     * wrong number: a wide window with a panel open still leaves a narrow
     * space here.
     */
    <div className="timebar">
      <div className="timebar__dock">
        <div className="timebar__summary">
        <p className="timebar__label">Sunlight · Melbourne</p>
        <p className="timebar__value">{label}</p>
        <p className="timebar__caption">{caption}</p>
      </div>

      <div className="timebar__timeline">
        <p className="timebar__events">
          <span>
            Sunrise <b>{daylight.rise === null ? '—' : clockLabel(daylight.rise)}</b>
          </span>
          <span>
            Sunset <b>{daylight.set === null ? '—' : clockLabel(daylight.set)}</b>
          </span>
        </p>

        <div
          className="timebar__track"
          style={
            {
              '--day-from': `${from}%`,
              '--day-to': `${to}%`,
            } as React.CSSProperties
          }
        >
          {/* Drawn separately from the control, so the line can be 6px while
              the thing a finger has to hit stays 44. */}
          <span className="timebar__rail" aria-hidden="true" />
          <input
            type="range"
            min={min}
            max={max}
            step={10}
            value={minutes}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label="Time of day"
            // Without this a screen reader reads "900", not "15:00".
            aria-valuetext={label}
            aria-describedby={bothKnown ? undefined : 'timebar-nocross'}
          />
        </div>

        <p className="timebar__scale" aria-hidden="true">
          <span>{clockLabel(min)}</span>
          {noonAt !== null && (
            <span className="timebar__noon" style={{ left: `${noonAt}%` }}>
              {clockLabel(noon)}
            </span>
          )}
          <span>{clockLabel(max)}</span>
        </p>

        {/*
          Said only when a crossing is missing, and said to everyone: the dash
          above shows there is no time to give, and this says why there is
          not. An em dash on its own is a hole, not an explanation.
        */}
        {!bothKnown && (
          <p className="timebar__nocross" id="timebar-nocross">
            The sun does not {daylight.rise === null ? 'rise' : 'set'} between{' '}
            {clockLabel(min)} and {clockLabel(max)} on this date.
          </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * What is known about one existing building.
 *
 * The counterpart to DevelopmentPanel. Until now a searched building got the
 * nearby-projects list and nothing about itself, so the one thing a resident
 * had actually asked about was the one thing the screen would not describe.
 *
 * The sunlight screen is reachable from here. It was not at first, on the
 * reasoning that a building has no "before" to compare against — but the
 * searched building is already lifted out of the merged city so it can be
 * drawn pink, so the city without it costs nothing to show.
 */
/**
 * ─────────────────────────────────────────────────────────────────────────
 * ONE EXISTING BUILDING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The same sheet a project gets, for something that is already standing.
 *
 * WHY IT LOOKS LIKE THE PROJECT PANEL NOW
 *   It was the last panel written before the rest were redesigned, and it
 *   stayed as it was: no back link, no tabs, no progress, a different way of
 *   laying out its figures, and on the opposite side of the screen. A reader
 *   who searched an address got a panel that shared nothing with the one
 *   they had been using a moment earlier, and had to work out its exits from
 *   scratch.
 *
 *   Everything here comes from SubjectHead, so the two cannot drift again.
 *
 * WHY IT IS ON THE LEFT
 *   Because everything else is. It was the one panel in the app on the right
 *   — and its own sunlight half was on the left, so switching tab threw it
 *   across the city and the reader had to find it again.
 *
 *   Which side matters far less than every panel using the same one. A
 *   reader learns where panels appear in the first ten seconds and then
 *   stops looking; a panel that arrives somewhere else is a panel that has
 *   to be searched for.
 *
 * WHAT IT DOES NOT DO
 *   It does not compare anything. A project has a before and an after; a
 *   building that is already there has only a now, and the sunlight half
 *   measures what IT takes rather than what it changes.
 */
export function BuildingPanel({
  label,
  locality,
  heightM,
  detail,
  settled,
  onSunlight,
  onBack,
  onClose,
}: {
  label: string;
  /** Suburb, state and postcode, when the address had them to give. */
  locality?: string;
  /** From the massing, so a height shows even before the record arrives. */
  heightM: number;
  detail: BuildingDetail | null;
  /** False while the record is still in flight; true once it will not come. */
  settled: boolean;
  onSunlight: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  /*
   * The two figures worth a tile, and the rest as a list.
   *
   * Height is always known — it comes from the massing, which is how the
   * building got drawn at all. Storeys come from the record, which may not
   * arrive, so the second tile appears only when there is something in it.
   */
  const rest: { label: string; value: string }[] = [];
  if (detail?.constructionYear) {
    rest.push({ label: 'Built', value: String(detail.constructionYear) });
  }
  if (detail?.refurbishedYear) {
    rest.push({ label: 'Refurbished', value: String(detail.refurbishedYear) });
  }
  // Zero is worth showing — "no bicycle parking" is a fact about a building.
  if (detail?.bicycleSpaces !== null && detail?.bicycleSpaces !== undefined) {
    rest.push({ label: 'Bicycle spaces', value: String(detail.bicycleSpaces) });
  }

  /*
   * The address often already contains the name — the footprint data has
   * "Pegasus Apartment Hotel 206-216 A'Beckett Street" as the address — so
   * the address is only worth repeating when it adds something.
   */
  const name = detail?.buildingName ?? label;
  const meta = [
    detail?.buildingName && !label.includes(detail.buildingName) ? label : null,
    detail?.predominantUse ? `Mainly ${detail.predominantUse.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <aside className="panel panel--left sheet" aria-labelledby="subject-title">
      <SubjectHead
        existing
        title={name}
        locality={locality}
        meta={meta}
        backLabel="Back to the map"
        tab="overview"
        onTab={(next) => next === 'sunlight' && onSunlight()}
        onBack={onBack}
        onClose={onClose}
      />

      <div
        key="overview"
        role="tabpanel"
        id="subject-tabpanel"
        aria-labelledby="subject-tab-overview"
        className="sheet__tabpanel"
      >
        <p className="panel__eyebrow">What is here</p>

        <div className="tiles">
          <div className="tile">
            <p className="tile__figure">{heightM.toFixed(0)} m</p>
            <p className="tile__label">Building height</p>
          </div>
          {detail?.floorsAboveGround && (
            <div className="tile">
              <p className="tile__figure">{detail.floorsAboveGround}</p>
              <p className="tile__label">Storeys</p>
            </div>
          )}
        </div>

        {rest.length > 0 && (
          <dl className="facts">
            {rest.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {/*
          Said only once the record has settled. While it is in flight an
          empty panel is a panel still arriving; afterwards it is a panel
          with nothing in it, and those need different sentences.
        */}
        {settled && rest.length === 0 && !detail?.floorsAboveGround && (
          <p className="sheet__body">
            No further record for this building. Its height comes from the
            model&rsquo;s own geometry.
          </p>
        )}

        <button type="button" className="button button--block" onClick={onSunlight}>
          Explore sunlight &amp; shadow
        </button>
      </div>

      <p className="sheet__fine">Illustrative demo data · Not a planning assessment.</p>
    </aside>
  );
}
