/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE HEADSET PANEL IS GIVEN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The panel inside a headset does the same jobs as the 2D screens — choose a
 * place, set the season and hour, measure a spot, stand in the street — and
 * it does them by calling the SAME state setters in App. The product's state
 * — the place, the date and hour, the measured spot — lives in App alone;
 * the panel keeps only how it is being used: which page shows, how the list
 * is sorted and which page of it, where the reader stood when it was last
 * sorted, whether it is minimised, whether leaving is being confirmed. That
 * is the whole design: one source of truth, two ways of reaching it, so the
 * address bar, the figures and both interfaces can never disagree about what
 * is being looked at.
 *
 * Types only, in a file of their own, so that App and SceneCanvas can name
 * them without pulling in the panel — which carries a UI library and a font
 * nobody on a desktop needs to download.
 */

import type { SeasonPreset } from './solar';

/** Where the player is: over the city on a platform, or on the footpath. */
export type VrStage = 'above' | 'street';

/** One approved development, as a row in the panel's list. */
export interface VrPlaceOption {
  key: string;
  /** The street line of its address. */
  label: string;
  /** "Approved · 120 m". */
  detail: string;
  en: [number, number];
  /** For sorting tallest first. */
  heightM: number;
}

/** The measured figure, already worded — see ui/words.ts. */
export interface VrMeasurement {
  /** Present when the subject takes no sun from the spot at all. */
  none: string | null;
  figure: string | null;
  caption: string | null;
  against: string | null;
  shadowWindow: string | null;
  /** The two sums the figure is the difference of, for drawing them. */
  withoutMin: number;
  withMin: number;
}

export interface VrMenu {
  stage: VrStage;

  place: {
    label: string;
    detail: string;
    /** "project" or "building", as the 2D sheet says it. */
    noun: string;
  } | null;
  options: VrPlaceOption[];
  onChoose: (key: string) => void;

  seasons: SeasonPreset[];
  season: SeasonPreset['key'] | null;
  onSeason: (key: SeasonPreset['key']) => void;
  dateLabel: string;
  timeLabel: string;
  /** Said above the time when the hour on screen is not the one asked for. */
  note: string | null;
  onNudgeMinutes: (minutes: number) => void;
  /**
   * The clock as a number, and the day it sits in: where the handle goes on
   * the time rail and which part of the rail is daylight. Minutes since
   * midnight; rise and set are null when the sun does not cross the horizon
   * inside the rail.
   */
  minutes: number;
  railStart: number;
  railEnd: number;
  sunrise: number | null;
  sunset: number | null;

  /** The before/after switch: the subject shown, or taken away. */
  showSubject: boolean;
  onShowSubject: (show: boolean) => void;

  /** The ground is waiting for a point. */
  armed: boolean;
  onMeasure: () => void;
  onCancelMeasure: () => void;
  measured: VrMeasurement | null;
  /** What the figure does not count. Said beside it, not behind a link. */
  finePrint: string;

  onStand: () => void;
  onRise: () => void;
  onExit: () => void;

  /** Attribution the licences require, one line each. */
  credits: string[];
}
