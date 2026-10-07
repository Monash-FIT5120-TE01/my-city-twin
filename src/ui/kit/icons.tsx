/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE INTERFACE'S MARKS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * One drawing per meaning. There were three crosses at three weights and an
 * arrow drawn as an SVG in some places and typed as "→" in others; a mark
 * that changes shape from screen to screen reads as a different control.
 * All are decorative (aria-hidden): the control they sit in carries the
 * words.
 */

/** "On to": a way forward — "Explore sunlight", "Explore the city". */
export function ArrowRight() {
  return (
    <svg className="icon icon--arrow" width="17" height="10" viewBox="0 0 17 10" aria-hidden="true">
      <path
        d="M0 5h15M11 1l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Back": the way to the screen before. */
export function ChevronLeft() {
  return (
    <svg className="icon" width="13" height="13" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M9.2 2.5 4.4 7.5l4.8 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Close" or "clear". */
export function Cross() {
  return (
    <svg className="icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
