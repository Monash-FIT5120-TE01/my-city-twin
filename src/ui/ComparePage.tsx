/*
 * ─────────────────────────────────────────────────────────────────────────
 * COMPARE SUNLIGHT — TODAY AND AFTER, SIDE BY SIDE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The page "Compare side by side" opens from the sunlight screen (design:
 *   Figma "04 — Compare sunlight"). The same place, the same moment, twice:
 *   on the left the city as it stands, on the right with every approved
 *   project built. The two views move together (ViewLink), so whatever one
 *   is turned to, the other shows from the same place.
 *
 * WHAT IS ON IT
 *   - "Back to sunlight", the page title and the place.
 *   - "Views move together", and the key to the colours.
 *   - Two framed windows with a heading and a line under each saying what
 *     is drawn in it. The windows are empty: this page measures them and
 *     reports where they are (`onFrames`), and App lays a canvas over each.
 *   - A bar along the bottom: the date as a season, the hour on a rail, and
 *     "Choose another spot", which goes back to measure somewhere else.
 *   - The fine print and the sources.
 *
 * WHAT IT HOLDS
 *   Nothing: the date, the hour and the place are App's, the same state the
 *   sunlight screen uses, so going back finds everything where it was left.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { SEASONS, matchingSeason, sameDayInMonth, type SimulationDate } from '../scene/solar';
import { MapKey } from './kit/MapKey';
import { Icon } from './kit/Icon';
import { Button } from './kit/Button';
import { Card } from './kit/Card';
import { DemoNote } from './kit/DemoNote';
import { PageHead } from './kit/PageHead';
import { TimeBar } from './screens';
import '../styles/compare.css';

/** Where a window sits on the screen, in CSS pixels from the app's corner. */
export interface FrameRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "21 June 2026" — the whole date, for a control that stands on its own. */
function longDate({ day, month, year }: SimulationDate): string {
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function ComparePage({
  title,
  kindLabel,
  date,
  onDate,
  minutes,
  onMinutes,
  min,
  max,
  caption,
  daylight,
  onBack,
  onChooseSpot,
  onFrames,
}: {
  /** The place, as the sunlight screen names it. */
  title: string;
  /** "Existing building" or "Approved development". */
  kindLabel: string;
  date: SimulationDate;
  onDate: (next: SimulationDate) => void;
  minutes: number;
  onMinutes: (next: number) => void;
  /** The ends of the time rail, in minutes. */
  min: number;
  max: number;
  /** What the shadow is doing at this hour, for the rail's screen-reader text. */
  caption: string;
  daylight: { rise: number | null; set: number | null };
  onBack: () => void;
  /** Back to the sunlight screen with the ground ready for a new spot. */
  onChooseSpot: () => void;
  /**
   * Where the two windows are, whenever they move. App lays a canvas over
   * each — with the map's credit inside it, since the map is shown twice.
   */
  onFrames: (frames: { today: FrameRect; after: FrameRect }) => void;
}) {
  const root = useRef<HTMLElement>(null);
  const today = useRef<HTMLDivElement>(null);
  const after = useRef<HTMLDivElement>(null);

  /*
   * The callback, held where the observer reaches the current one without
   * being rebuilt by it, whatever App passes — today a state setter, which
   * never changes, but nothing here should depend on that.
   */
  const report = useRef(onFrames);
  useEffect(() => {
    report.current = onFrames;
  });

  /*
   * Measure both windows whenever the layout moves. A layout effect, so the
   * canvases are placed before the first paint rather than a frame late.
   */
  useLayoutEffect(() => {
    const page = root.current;
    const left = today.current;
    const right = after.current;
    if (!page || !left || !right) return;
    // Measured from the app's corner, not this page's: the canvases are
    // placed in the app, and this page starts under the header.
    const rect = (element: HTMLElement): FrameRect => {
      const outer = (page.parentElement ?? page).getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      return {
        top: Math.round(inner.top - outer.top),
        left: Math.round(inner.left - outer.left),
        width: Math.round(inner.width),
        height: Math.round(inner.height),
      };
    };
    const measure = () => report.current({ today: rect(left), after: rect(right) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    observer.observe(left);
    observer.observe(right);
    /*
     * On a screen too short for the whole page it scrolls, and the canvases
     * laid over the windows have to scroll with them.
     */
    page.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      page.removeEventListener('scroll', measure);
    };
  }, []);

  const preset = matchingSeason(date);

  return (
    <section className="page compare" ref={root} aria-labelledby="compare-title">
      <div className="compare__head">
        {/*
          Arriving, the keyboard is given the page's heading (PageHead) — the
          button that brought it here has gone.
        */}
        <PageHead
          id="compare-title"
          title="Compare sunlight"
          lede={`${title} · ${kindLabel}`}
          back={{ label: 'Back to sunlight', onClick: onBack }}
        />
        <div className="compare__aside">
          <p className="compare__together">
            <Icon name="link" size={18} />
            Views move together
          </p>
          <MapKey />
        </div>
      </div>

      <div className="compare__views">
        <Card as="figure" className="compare__view">
          <h2 className="card-title compare__view-title">What is here today</h2>
          {/* Empty: App lays the "today" canvas over this box. */}
          <div className="compare__frame" ref={today} />
          <figcaption className="compare__caption">
            The city as it stands. Approved and in-progress projects are not shown.
          </figcaption>
        </Card>
        <Card as="figure" className="compare__view">
          <h2 className="card-title compare__view-title">Planned projects at full height</h2>
          <div className="compare__frame" ref={after} />
          <figcaption className="compare__caption">
            Approved and in-progress projects at their planned height.
          </figcaption>
        </Card>
      </div>

      <Card className="compare__bar">
        {/*
          The date, as the season it falls in. Choosing another season keeps
          the day of the month, as on the sunlight screen. A date that is not
          one of the four presets is offered as itself, so it can stay.
        */}
        <label className="compare__when">
          <Icon name="calendar_month" size={18} />
          <span className="visually-hidden">Date</span>
          <select
            value={preset?.key ?? 'custom'}
            onChange={(event) => {
              const season = SEASONS.find((option) => option.key === event.target.value);
              if (season) onDate(sameDayInMonth(date, season.month));
            }}
          >
            {!preset && <option value="custom">{longDate(date)}</option>}
            {SEASONS.map((season) => (
              <option key={season.key} value={season.key}>
                {longDate(sameDayInMonth(date, season.month))}, {season.label}
              </option>
            ))}
          </select>
        </label>

        <div className="compare__rail">
          <TimeBar
            inline
            minutes={minutes}
            onChange={onMinutes}
            min={min}
            max={max}
            caption={caption}
            daylight={daylight}
          />
        </div>

        <Button variant="mint" size="lg" className="compare__spot" onClick={onChooseSpot}>
          Choose another spot
        </Button>
      </Card>

      <footer className="compare__foot">
        <DemoNote />
      </footer>
    </section>
  );
}
