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

/** Where the player is: over the city on a platform, on the footpath, or inside the example flat. */
export type VrStage = 'above' | 'street' | 'room';

/**
 * The example flat (scene/room/), as the headset reaches it: a building standing today chosen with the
 * beam, its floor and side, and the way in and out. The same floor and side the page's flat picker sets.
 */
export interface VrFlat {
  /** The building chosen, as the list writes an address; null while none is (or a project is). */
  building: string | null;
  /** The beam is waiting for a building. */
  choosing: boolean;
  onChoose: () => void;
  onCancelChoose: () => void;
  floor: number;
  /** The top floor as modelled, when known. */
  floorsAboveGround: number | null;
  onFloor: (floor: number) => void;
  /** The sides the building has at that floor, as compass names ("NE"). */
  sides: string[];
  side: string | null;
  onSide: (compass: string) => void;
  /** Why the flat does not fit there, in words; null when it does, or before a side is chosen. */
  problem: string | null;
  canEnter: boolean;
  onEnter: () => void;
  onLeave: () => void;
}

/** One approved development, as a row in the panel's list. */
/**
 * What the Place card is about: a project or a building standing today, chosen on the map, in the list
 * of what stands near a spot, or by search (ProjectDoc/vr-ui-redesign/nav-search.html, 2026-10-19).
 */
export interface VrSelected {
  kind: 'development' | 'building';
  /** The project's devKey, or the building's id. */
  key: string;
  /** Its address, as the lists write it. */
  label: string;
  /** "Approved | 120 m", "Standing today | 66 m". */
  detail: string;
  en: [number, number];
  heightM: number;
}

/** One answer to a search: a project, a building or a named place. */
export interface VrHit {
  kind: 'development' | 'building' | 'landmark';
  key: string;
  label: string;
  detail: string;
  en: [number, number];
}

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
  /** The spot itself, as text: new for every spot measured, so "Stand here?" is asked once per spot. */
  spotKey: string;
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

  /** The project or building the Place card is about, or null. */
  selected: VrSelected | null;
  /** Choose one without going there: the map's list and search choose; "Stand in front" goes. */
  onPick: (pick: { kind: 'development' | 'building'; key: string }) => void;
  /** Down to the footpath at a spot chosen on the map (the nearest free point to it). */
  onStandAt: (en: [number, number]) => void;
  /** Addresses, projects and named places matching what was typed; empty under two letters. */
  search: (query: string) => VrHit[];
  /** Whether the approved projects are drawn ("With the project" / "Without"), as the page's Map layers. */
  plan: { shown: boolean; onShow: (shown: boolean) => void };

  seasons: SeasonPreset[];
  season: SeasonPreset['key'] | null;
  onSeason: (key: SeasonPreset['key']) => void;
  dateLabel: string;
  timeLabel: string;
  /** Said above the time when the hour on screen is not the one asked for. */
  note: string | null;
  onNudgeMinutes: (minutes: number) => void;
  /** Straight to an hour: a press or a slide on the day bar. Snapped to the control's step and window. */
  onSetMinutes: (minutes: number) => void;
  /** How high the sun stands at the hour on show, and at the middle of the day: the arc's height. Degrees. */
  sunAltitudeDeg: number;
  noonAltitudeDeg: number;
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
  /** Whether the day and hour on show are Melbourne's present ones. Otherwise the panel says "Preview". */
  isNow: boolean;
  /** Back to the present day and hour (as near as the time control can show). */
  onNow: () => void;

  /** The ground is waiting for a point. */
  armed: boolean;
  onMeasure: () => void;
  onCancelMeasure: () => void;
  measured: VrMeasurement | null;
  /** What the figure does not count. Said beside it, not behind a link. */
  finePrint: string;

  /** Null on the comparison screen and the like, where there is no flat to reach. */
  flat: VrFlat | null;

  onStand: () => void;
  onRise: () => void;
  onExit: () => void;

  /** Attribution the licences require, one line each. */
  credits: string[];
}
