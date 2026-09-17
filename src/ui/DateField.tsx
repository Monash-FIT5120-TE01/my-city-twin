/*
 * ─────────────────────────────────────────────────────────────────────────
 * CHOOSING A DAY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS AT ALL, HAVING ARGUED AGAINST IT
 *   The date was a native <input type="date">, and that was the right call
 *   for everything except the one thing it was asked to do: look like the
 *   rest of this interface. The panel that opens from a native date input is
 *   drawn by the operating system. It cannot be styled — not its colours,
 *   not its typeface, not the red Sundays, not the era it prints beside the
 *   year on a machine whose locale is not English. `::-webkit-calendar-
 *   picker-indicator` reaches the little button beside the field and nothing
 *   beyond it.
 *
 *   So this is written out, and the reason it is worth being careful about
 *   is that a date picker is one of the easier things to build badly. The
 *   mouse version takes an afternoon. What takes longer, and is the whole
 *   difference between this and a grid of divs, is below.
 *
 * WHAT A KEYBOARD CAN DO HERE
 *   Arrows move a day and a week. PageUp and PageDown move a month. Home and
 *   End go to the ends of the week. Enter and Space choose. Escape closes and
 *   puts focus back on the button that opened it.
 *
 *   One day is in the tab order at a time — the focused one — so tabbing
 *   leaves the calendar rather than walking through forty-two cells. That is
 *   the roving tabindex the grid pattern asks for, and it is the part most
 *   often left out.
 *
 * WHAT IT SAYS OUT LOUD
 *   A grid of rows and cells, so a screen reader announces "row 3, column 5"
 *   and reads the column header. Each day carries its full date as a label,
 *   because "14" alone is not one. The chosen day is marked selected, and
 *   today is marked as today — two different facts that look similar and are
 *   not.
 */

import { useEffect, useRef, useState } from 'react';
import {
  MONTH_NAMES,
  dateLabel,
  monthGrid,
  sameDay,
  shiftDay,
  type SimulationDate,
} from '../scene/solar';

/** Monday first — see the note on monthGrid for why. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const todayCivil = (): SimulationDate => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
};

export function DateField({
  date,
  onDate,
}: {
  date: SimulationDate;
  onDate: (next: SimulationDate) => void;
}) {
  const [open, setOpen] = useState(false);
  /*
   * The day the keyboard is on, which is not the day that is chosen.
   *
   * Arrowing around a calendar has to be possible without selecting
   * everything it passes over — otherwise moving from January to March
   * recomputes the sun sixty times on the way. Choosing is Enter.
   */
  const [cursor, setCursor] = useState<SimulationDate>(date);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const focused = useRef<HTMLButtonElement>(null);

  const today = todayCivil();

  /*
   * Whether the grid should take focus on the next render.
   *
   * WHY THIS IS NOT SIMPLY "WHENEVER THE CURSOR MOVES"
   *   It was, and the month arrows are what broke it. Pressing "the month
   *   after" changes the cursor, so focus jumped off the button and into the
   *   grid — and a second press of Enter, meant to advance another month,
   *   chose a date and closed the picker instead.
   *
   *   The cursor moves for two reasons and only one of them is the keyboard
   *   walking the grid. This says which.
   */
  const takeFocus = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (!takeFocus.current) return;
    takeFocus.current = false;
    focused.current?.focus();
  });

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  /*
   * A click anywhere else closes it. `pointerdown` rather than `click`: a
   * click fires after the press, and a press on another control would both
   * close this and operate that — which is right, but only if the closing
   * happens first, or the layout shifts under the finger mid-gesture.
   */
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popover.current?.contains(target) || trigger.current?.contains(target)) return;
      /*
       * Focus goes back to the trigger unless the press is taking it
       * somewhere itself.
       *
       * Closing on a press over the city — which is not focusable — removed
       * the focused day and left focus on the document body, so the next Tab
       * started again from the top of the page. Pressing another control is
       * different: that control is about to take focus, and yanking it back
       * here first would fight it.
       */
      const elsewhere = target instanceof HTMLElement && target.closest('button, a, input, select, textarea, [tabindex]');
      if (elsewhere) setOpen(false);
      else close();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [open]);

  const moveCursor = (next: SimulationDate | ((at: SimulationDate) => SimulationDate)) => {
    takeFocus.current = true;
    setCursor(next as SimulationDate);
  };

  const onGridKey = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in moves) {
      event.preventDefault();
      moveCursor((at: SimulationDate) => shiftDay(at, moves[event.key]));
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      const by = event.key === 'PageUp' ? -1 : 1;
      moveCursor((at: SimulationDate) => {
        const moved = new Date(Date.UTC(at.year, at.month - 1 + by, 1));
        const year = moved.getUTCFullYear();
        const month = moved.getUTCMonth() + 1;
        // Clamped, so stepping off the 31st does not land in the next month.
        const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return { year, month, day: Math.min(at.day, last) };
      });
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const weekday = (new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)).getUTCDay() + 6) % 7;
      moveCursor(shiftDay(cursor, event.key === 'Home' ? -weekday : 6 - weekday));
      return;
    }
  };

  /*
   * Escape anywhere inside the popover, not only inside the grid.
   *
   * It was on the grid body, so pressing Escape while focus sat on either
   * month arrow did nothing — and those are the two controls somebody is
   * most likely to be on when they decide they are done.
   */
  const onPanelKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close();
  };

  const month = (by: number) => {
    const moved = new Date(Date.UTC(cursor.year, cursor.month - 1 + by, 1));
    setCursor({
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
      day: Math.min(
        cursor.day,
        new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate(),
      ),
    });
  };

  return (
    <div className="daypick">
      <button
        ref={trigger}
        type="button"
        className="daypick__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          /*
           * Opened at the chosen day, set here rather than corrected by an
           * effect afterwards. An effect would let the calendar exist for one
           * render showing wherever the last visit wandered to, and then
           * jump — and it is the press that knows a visit is beginning.
           */
          if (!open) {
            setCursor(date);
            takeFocus.current = true;
          }
          setOpen((was) => !was);
        }}
      >
        <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
          <rect
            x="2.2"
            y="3.4"
            width="13.6"
            height="12.4"
            rx="2.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M2.2 7.4h13.6M5.8 1.8v3M12.2 1.8v3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="daypick__value">
          {dateLabel(date)} {date.year}
        </span>
      </button>

      {open && (
        <div
          ref={popover}
          className="daypick__panel"
          onKeyDown={onPanelKey}
          role="dialog"
          aria-modal="false"
          aria-label="Choose a date"
        >
          <div className="daypick__head">
            <button
              type="button"
              onClick={() => month(-1)}
              aria-label="The month before"
            >
              <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
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
            {/*
              Announced when the month changes, so somebody arrowing off the
              end of one is told they have arrived in another rather than
              having the numbers silently change under them.
            */}
            <p id="daypick-month" aria-live="polite">
              {MONTH_NAMES[cursor.month - 1]} {cursor.year}
            </p>
            <button type="button" onClick={() => month(1)} aria-label="The month after">
              <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
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
            Named by the month heading above it, so a screen reader entering
            the grid is told which month it is in rather than "grid".
          */}
          <table className="daypick__grid" role="grid" aria-labelledby="daypick-month">
            <thead>
              <tr>
                {WEEKDAYS.map((name) => (
                  <th key={name} scope="col" abbr={name}>
                    {name.slice(0, 1)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody onKeyDown={onGridKey}>
              {monthGrid(cursor.year, cursor.month).map((week) => (
                <tr key={`${week[0].date.year}-${week[0].date.month}-${week[0].date.day}`}>
                  {week.map(({ date: cell, inMonth }) => {
                    const isCursor = sameDay(cell, cursor);
                    const isChosen = sameDay(cell, date);
                    /*
                     * The selected state goes on the CELL. It was on the
                     * button inside it, where `aria-selected` has no meaning
                     * — a native button is not a selectable widget — so the
                     * chosen day was announced as an ordinary one.
                     */
                    return (
                      <td
                        key={`${cell.year}-${cell.month}-${cell.day}`}
                        role="gridcell"
                        aria-selected={isChosen}
                      >
                        <button
                          ref={isCursor ? focused : undefined}
                          type="button"
                          /* One cell in the tab order: the one focus is on. */
                          tabIndex={isCursor ? 0 : -1}
                          className={`daypick__day${inMonth ? '' : ' is-outside'}`}
                          aria-current={sameDay(cell, today) ? 'date' : undefined}
                          aria-label={`${cell.day} ${MONTH_NAMES[cell.month - 1]} ${cell.year}`}
                          onClick={() => {
                            onDate(cell);
                            close();
                          }}
                        >
                          {cell.day}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
