/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE INTERFACE'S MARKS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * One drawing per meaning. There were three crosses at three weights and an
 * arrow drawn as an SVG in some places and typed as "→" in others; a mark
 * that changes shape from screen to screen reads as a different control.
 * All are decorative (aria-hidden): the control they sit in carries the
 * words. The shapes are Icon's (Icon.tsx), from the shared icon set.
 */

import { Icon } from './Icon';

/** "On to": a way forward — "Explore sunlight", "Explore the city". */
export function ArrowRight() {
  return <Icon name="arrow_forward" size={18} className="icon--arrow" />;
}

/** "Back": the way to the screen before. */
export function ChevronLeft() {
  return <Icon name="chevron_left" size={18} />;
}

/** "Close" or "clear". */
export function Cross() {
  return <Icon name="close" size={18} />;
}
