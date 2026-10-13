/*
 * HOW FAST THE WALKER WALKS — chosen with the wheel on a desktop, shown in the walking hint.
 *
 * The street view (StreetView.tsx) lives inside the canvas and the hint lives on the page; this is the
 * meeting point between them, the same shape as ride.ts. Every walk starts at a person's pace again: the
 * wheel is for crossing the city, not a setting to carry into the next visit to the street.
 */

/** The paces the wheel steps through, m/s. 1.4 is what a person actually does. */
const PACES_MS = [0.7, 1.0, 1.4, 2.0, 3.0, 4.5, 6.5, 9.0];
const START = PACES_MS.indexOf(1.4);
/** Shift hurries by the same ratio it always has (1.4 → 5.5), up to a limit: a car's pace in the city. */
const HURRY = 4;
const HURRY_MAX_MS = 20;

class WalkPace {
  private index = START;
  private listeners = new Set<() => void>();
  readonly subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  readonly getPace = () => PACES_MS[this.index];

  /** Walking pace, m/s, and hurrying with Shift held. */
  walk(): number { return PACES_MS[this.index]; }
  hurry(): number { return Math.min(HURRY_MAX_MS, PACES_MS[this.index] * HURRY); }

  /** One step faster (+1) or slower (−1), held at either end. */
  step(by: 1 | -1): void { this.set(Math.max(0, Math.min(PACES_MS.length - 1, this.index + by))); }
  /** Back to a person's pace, on the way into the street. */
  reset(): void { this.set(START); }

  private set(index: number): void {
    if (index === this.index) return;
    this.index = index; for (const fn of this.listeners) fn();
  }
}

export const walkPace = new WalkPace();
