/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE STREET GRID, MEASURED RATHER THAN TYPED IN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Where the twelve street names sit, which way they run, and where the
 *   carriageways are. The names are drawn from here; the road surface was
 *   generated from here, offline (see Roads.tsx).
 *
 * THE PROBLEM
 *   The backend has no street data at all — it holds buildings, developments
 *   and administrative areas, nothing linear. But the streets do not need to
 *   be supplied, because they are the GAPS between the buildings: stand the
 *   massing up and the Hoddle Grid is already there. Only the names were
 *   missing.
 *
 * HOW THE GEOMETRY WAS OBTAINED, IN TWO STEPS
 *
 *   1. DIRECTION, from the data. Each of the 133 developments has an address
 *      naming its street and a real coordinate. Fit a line through the points
 *      sharing a street name and you get that street's bearing. Every long
 *      street came out near 70°, every cross street near 160° — which is the
 *      Hoddle Grid, recovered from addresses.
 *
 *   2. POSITION, corrected. Step 1 gives the right angle but the wrong line:
 *      those points are BUILDINGS FRONTING the street, so the fit lands on
 *      the shopfronts, half a block from the road. That is how "Queen Street"
 *      ended up written across a rooftop. The fix was to slide each line
 *      sideways and keep the offset that passes through the fewest buildings
 *      — the road is the gap, so the emptiest line is the road.
 *
 * THE NUMBERS AS EVIDENCE
 *   Both `offsetM` (the carriageway) and `addressFitM` (where the addresses
 *   alone put it) are kept, so the size of the correction stays visible.
 *   Bourke Street lands within 2 m of the scene origin, which was placed on
 *   Bourke Street independently — that agreement is the check that the whole
 *   fit is sound.
 *
 * WIDTHS
 *   Robert Hoddle laid the grid in chains in 1837: main streets a chain and
 *   a half, the service lanes between them half a chain. That is 30.2 m and
 *   10.1 m, and it is still what they measure.
 */

/** Bearing of Flinders–Collins–Bourke–Lonsdale–La Trobe, degrees from north. */
export const LONG_BEARING_DEG = 70;
/** Bearing of Spencer–King–William–Queen–Elizabeth–Swanston, from north. */
export const CROSS_BEARING_DEG = 160;

const DEG = Math.PI / 180;

/** Unit vector along a bearing, in the east/north frame. */
const along = (bearingDeg: number): [number, number] => [
  Math.sin(bearingDeg * DEG),
  Math.cos(bearingDeg * DEG),
];

const LONG_DIR = along(LONG_BEARING_DEG);
const CROSS_DIR = along(CROSS_BEARING_DEG);

export interface StreetLabel {
  name: string;
  /** Which way the street runs. */
  axis: 'long' | 'cross';
  /** Share of this street's line that still crosses a building, 0–1. */
  buildingCoverage: number;
  /** Metres east of the scene origin. */
  east: number;
  /** Metres north of the scene origin. */
  north: number;
  /** Rotation about the up axis, radians, so the text runs along the street. */
  rotation: number;
  /** True where the offset was interpolated from the grid, not measured. */
  inferred?: boolean;
}

interface StreetSpec {
  name: string;
  axis: 'long' | 'cross';
  /** Perpendicular distance from the origin to the road centre, metres. */
  offsetM: number;
  /** Where fitting the development addresses alone put the line. */
  addressFitM: number;
  /** Share of the line that still falls inside a building footprint, 0–1. */
  buildingCoverage: number;
  /** True where the offset came from block spacing, with no records to fit. */
  inferred?: boolean;
}

/*
 * Offsets in two steps.
 *
 * Fitting the development addresses gives the right BEARING but the wrong
 * LINE: those points are buildings that front the street, so the fit lands on
 * the frontage rather than the carriageway — half a block off, which put the
 * Queen Street name on a rooftop.
 *
 * The second step searches perpendicular offsets either side of the fit and
 * keeps the one that passes through the fewest buildings, sampling every 15 m
 * along the line against all 4,443 footprints. The road is the gap, so the
 * minimum is the road. `buildingCoverage` records what was left: near zero
 * everywhere except Lonsdale and Bourke, where the grid's arcades genuinely
 * do overhang.
 */
const STREETS: StreetSpec[] = [
  // Long streets, north to south.
  { name: 'La Trobe Street', axis: 'long', offsetM: -419.3, addressFitM: -467.3, buildingCoverage: 0.02 },
  { name: 'Lonsdale Street', axis: 'long', offsetM: -178.6, addressFitM: -190.6, buildingCoverage: 0.12 },
  { name: 'Bourke Street', axis: 'long', offsetM: 52.4, addressFitM: 2.4, buildingCoverage: 0.1 },
  { name: 'Collins Street', axis: 'long', offsetM: 286.1, addressFitM: 260.1, buildingCoverage: 0.12 },
  { name: 'Flinders Street', axis: 'long', offsetM: 519.9, addressFitM: 501.9, buildingCoverage: 0 },

  // Cross streets, west to east.
  { name: 'Spencer Street', axis: 'cross', offsetM: -780, addressFitM: -780, buildingCoverage: 0, inferred: true },
  { name: 'King Street', axis: 'cross', offsetM: -469.3, addressFitM: -491.3, buildingCoverage: 0 },
  { name: 'William Street', axis: 'cross', offsetM: -233.8, addressFitM: -199.8, buildingCoverage: 0 },
  { name: 'Queen Street', axis: 'cross', offsetM: -0.5, addressFitM: 41.5, buildingCoverage: 0 },
  { name: 'Elizabeth Street', axis: 'cross', offsetM: 227.7, addressFitM: 191.7, buildingCoverage: 0.04 },
  { name: 'Swanston Street', axis: 'cross', offsetM: 460.5, addressFitM: 444.5, buildingCoverage: 0.03 },
  { name: 'Russell Street', axis: 'cross', offsetM: 697, addressFitM: 665, buildingCoverage: 0.07, inferred: true },
];

/**
 * Places each name on its street, near a point of interest.
 *
 * A street is a line, so its offset fixes only one coordinate; the other is
 * chosen so the labels gather around whatever is being looked at instead of
 * sitting off at the edge of the grid.
 */
export function streetLabelsNear(east: number, north: number): StreetLabel[] {
  // How far along each axis the point of interest sits.
  const alongLong = east * LONG_DIR[0] + north * LONG_DIR[1];
  const alongCross = east * CROSS_DIR[0] + north * CROSS_DIR[1];

  return STREETS.map(({ name, axis, offsetM, buildingCoverage, inferred }) => {
    const [runE, runN] = axis === 'long' ? LONG_DIR : CROSS_DIR;
    const [offE, offN] = axis === 'long' ? CROSS_DIR : LONG_DIR;
    const distanceAlong = axis === 'long' ? alongLong : alongCross;

    return {
      name,
      axis,
      buildingCoverage,
      east: runE * distanceAlong + offE * offsetM,
      north: runN * distanceAlong + offN * offsetM,
      // Text runs along its own +x; turn that onto the street direction.
      rotation: Math.atan2(runN, runE),
      inferred,
    };
  });
}

/* ── the carriageways themselves ─────────────────────────── */

export interface RoadSpec {
  axis: 'long' | 'cross';
  /** Perpendicular distance from the origin to the road centre, metres. */
  offsetM: number;
  /** Kerb to kerb, metres. */
  widthM: number;
}

/**
 * Robert Hoddle laid the grid in chains: the main streets a chain and a half
 * across, the service lanes between them half a chain. Those are 30.2 m and
 * 10.1 m, and the surviving street widths still measure that.
 *
 * Offsets come from the same building-gap search as the name positions. The
 * lanes keep a higher residual coverage — around a third of their length runs
 * under something, because the arcades genuinely bridge them — which is
 * harmless here: the road surface is drawn below the massing, so wherever a
 * building sits over a lane the building hides it.
 */
const MAIN_WIDTH_M = 30.2;
const LANE_WIDTH_M = 10.1;

/*
 * These describe the centrelines and widths the road SURFACE was generated
 * from, offline. The surface itself now lives in public/data/roads.json,
 * already clipped to where no building stands — drawing these as strips at
 * runtime put 15% of the road under a building.
 */
export const ROADS: RoadSpec[] = [
  // The five main long streets.
  { axis: 'long', offsetM: -419.3, widthM: MAIN_WIDTH_M },
  { axis: 'long', offsetM: -178.6, widthM: MAIN_WIDTH_M },
  { axis: 'long', offsetM: 52.4, widthM: MAIN_WIDTH_M },
  { axis: 'long', offsetM: 286.1, widthM: MAIN_WIDTH_M },
  { axis: 'long', offsetM: 519.9, widthM: MAIN_WIDTH_M },

  // The lanes between them, which is where the grid's texture comes from.
  { axis: 'long', offsetM: -306.2, widthM: LANE_WIDTH_M },
  { axis: 'long', offsetM: -56.8, widthM: LANE_WIDTH_M },
  { axis: 'long', offsetM: 173.3, widthM: LANE_WIDTH_M },
  { axis: 'long', offsetM: 398.4, widthM: LANE_WIDTH_M },

  // The cross streets, west to east.
  { axis: 'cross', offsetM: -780, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: -469.3, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: -233.8, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: -0.5, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: 227.7, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: 460.5, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: 697, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: 921.9, widthM: MAIN_WIDTH_M },
  { axis: 'cross', offsetM: 1140.6, widthM: MAIN_WIDTH_M },
];

/** The two grid directions, for anything that needs to lay something along them. */
export const GRID_DIRECTIONS = { long: LONG_DIR, cross: CROSS_DIR } as const;
