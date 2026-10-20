/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE COLOURS THE CITY IS DRAWN IN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * One place for them, because the same colours appear three times: on the
 * buildings (CityMassing, DevelopmentMassings) and in the map key
 * (sources.css). palette.test.ts holds the stylesheets to these values.
 *
 * THE DESIGN
 *   Warm cream for the city as it stands, teal for an approved project and
 *   orange for one already under construction — the colours of the design's
 *   city illustration.
 *
 * WHAT IS SET HERE AND WHAT IS SEEN
 *   A material's colour is not what reaches the screen: the sun, the cool
 *   sky light and the renderer's tone mapping take about a fifth off a lit
 *   face and grey warm colours most. So the materials (`base`) are set
 *   lighter and warmer than the design, chosen by rendering the city and
 *   measuring lit faces until they matched it (design → on screen):
 *
 *     existing     base #ffeedd   design #dacfc4   on screen #dbd5cd
 *     approved     base #72c6c3   design #a2d4d4   on screen #80c0b9
 *     in progress  base #ffae86   design #f1bb97   on screen #dda781
 *
 *   The orange is lifted further by its own glow (glowStrength). The keys
 *   show the ON-SCREEN colour (`KEY` below), so a swatch matches the
 *   buildings it names rather than a paler colour nobody sees.
 *
 * TOLD APART WITHOUT RELYING ON HUE
 *   On screen (CIELAB L*, and ΔE76 under Machado 2009 full-severity
 *   simulations — protanopia / deuteranopia / tritanopia):
 *
 *     existing vs approved     ΔL* 12.1   ΔE 10.9 / 16.6 / 34.6
 *     existing vs in progress  ΔL* 12.9   ΔE 25.7 / 27.0 / 30.7
 *     approved vs in progress  ΔL*  0.8   ΔE 25.4 / 34.4 / 60.1
 *
 *   Existing is the lightest by a clear step. The two project colours share
 *   a lightness but sit at the two ends of the blue–yellow axis, which
 *   survives red–green colour blindness (the 25+ above). The teal is darker
 *   than the design's on purpose: at the design's own teal, existing and
 *   approved were 6.9 apart under protanopia. The selected building is also
 *   outlined (SelectionEdges), and every key names its colours in words.
 */

/** A kind of building, with the colours it is drawn in. */
export interface BuildingTone {
  /** Clickable: the normal state. */
  base: string;
  /** The one being read about. Lighter, and outlined. */
  selected: string;
  /** Nothing responds (focus mode), so nothing looks pressable. */
  quiet: string;
  /** The faint glow that keeps it legible in another building's shadow. */
  glow: string;
  /**
   * How strong that glow is when clickable. A pale orange loses its warmth
   * to the scene's light sooner than a teal does, so it is lifted more.
   */
  glowStrength: number;
}

/** The city as it stands. */
export const EXISTING = '#ffeedd';
/** A building standing today under the mouse pointer: lit, so it stands out by day and by night. */
export const HOVER_LIT = '#fff6e6';
/** How strongly it glows: a little, so its faces keep their shading and its shape still reads, as in the redesigned interface. */
export const HOVER_GLOW = 0.15;
/** Rows whose height columns disagree — muted, but still standing. */
export const UNRESOLVED = '#ddd3c6';

/** An approved project. */
export const APPROVED: BuildingTone = {
  base: '#72c6c3',
  selected: '#95dcdc',
  quiet: '#d3ecea',
  glow: '#2fb3ae',
  glowStrength: 0.16,
};

/** A project already under construction. */
export const IN_PROGRESS: BuildingTone = {
  base: '#ffae86',
  selected: '#ffc9a8',
  quiet: '#fbe5d6',
  glow: '#f08c62',
  glowStrength: 0.5,
};

/**
 * The keys' swatches: the colour each kind shows on screen, and a darker
 * edge so the pale ones are not dots on white paper.
 */
export const KEY = {
  existing: { fill: '#dbd5cd', edge: '#7a8087' },
  approved: { fill: '#80c0b9', edge: '#2c7a77' },
  progress: { fill: '#dda781', edge: '#a8653a' },
} as const;

/** The colours a project is drawn in, by its stage — and in the colour-blind friendly set, if asked. */
export function toneOf(status: string, colourSafe = false): BuildingTone {
  if (colourSafe) return status === 'UNDER CONSTRUCTION' ? IN_PROGRESS_SAFE : APPROVED_SAFE;
  return status === 'UNDER CONSTRUCTION' ? IN_PROGRESS : APPROVED;
}

/*
 * ── COLOUR-BLIND FRIENDLY (settings/display.ts) ──────────────────────────
 *
 * The three kinds set far apart in LIGHTNESS, which every common colour vision difference keeps, and in
 * hues that the red-green ones keep apart too: blue and yellow rather than teal and orange. Lightness
 * L* of each under normal vision / protan / deutan / tritan (simulated, Machado 2009):
 *
 *   existing     #f4f2ee   96 / 96 / 96 / 96
 *   in progress  #f2c14e   80 / 78 / 82 / 79   and striped (DevelopmentMassings)
 *   approved     #1f4f86   33 / 35 / 32 / 35   and outlined
 *   (the searched building's pink #e0569a: 57 / 51 / 61 / 57)
 *
 * so no two kinds are nearer than 14 in any of them (palette-safe.test.ts). The building that could not be reconciled
 * (#d6d2cc, 84) is near the yellow in lightness; the stripes are what tell them apart.
 */
export const EXISTING_SAFE = '#f4f2ee';
export const UNRESOLVED_SAFE = '#d6d2cc';

export const APPROVED_SAFE: BuildingTone = {
  base: '#1f4f86',
  selected: '#3f74b3',
  quiet: '#b9cbe0',
  glow: '#1f4f86',
  glowStrength: 0.12,
};

export const IN_PROGRESS_SAFE: BuildingTone = {
  base: '#f2c14e',
  selected: '#f7d47a',
  quiet: '#f6e6bd',
  glow: '#d9a21f',
  glowStrength: 0.3,
};

/** The outline drawn round every approved project in the colour-blind friendly set. */
export const APPROVED_SAFE_EDGE = '#0b1f36';
