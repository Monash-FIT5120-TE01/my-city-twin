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
  /**
   * Where the street starts and stops along its OWN axis, metres.
   *
   * Measured, not assumed -- see the note above the table. A street's offset
   * says which line it runs down; without these it is an infinite line, and
   * the label slides along it into places the street does not go.
   */
  fromM: number;
  toM: number;
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
/*
 * ── AND WHERE EACH ONE STOPS ─────────────────────────────────────────────
 *
 * fromM and toM come from the building footprints: sampling every 10 m along
 * a street and asking whether there is a frontage within 55 m on EITHER side,
 * then keeping the longest run that has. A street is a street where there is
 * a city facing it; past the last frontage it is a rail yard or a park.
 *
 * They exist because a label slides along its street to stay level with what
 * is being looked at, and an unbounded line does not stop at the end of the
 * road. Bourke Street's last frontage is at -730, just east of Spencer; the
 * bound before this was the grid's outer rectangle, so looking west put the
 * name for Bourke Street out over the station.
 *
 * EITHER SIDE, NOT BOTH, and that is the second correction. Requiring both
 * cut the edge streets in half: Flinders has the railway and the river down
 * its southern flank and measured as -120..780 when it runs -720..1250, so
 * its name stopped travelling a third of the way along the city. A street
 * with a park on one side is still a street.
 */
const STREETS: StreetSpec[] = [
  // Long streets, north to south.
  { name: 'La Trobe Street', axis: 'long', offsetM: -419.3, addressFitM: -467.3, fromM: -740, toM: 1180, buildingCoverage: 0.02 },
  { name: 'Lonsdale Street', axis: 'long', offsetM: -178.6, addressFitM: -190.6, fromM: -740, toM: 1190, buildingCoverage: 0.12 },
  { name: 'Bourke Street', axis: 'long', offsetM: 52.4, addressFitM: 2.4, fromM: -730, toM: 1200, buildingCoverage: 0.1 },
  { name: 'Collins Street', axis: 'long', offsetM: 286.1, addressFitM: 260.1, fromM: -730, toM: 1200, buildingCoverage: 0.12 },
  { name: 'Flinders Street', axis: 'long', offsetM: 519.9, addressFitM: 501.9, fromM: -720, toM: 1250, buildingCoverage: 0 },

  /*
   * Cross streets, west to east.
   *
   * SPENCER STREET WAS 77 m OUT, AND IT IS THE ONE THAT SHOWED.
   *   Its offset was interpolated from block spacing and never measured --
   *   it is the only street with no city on one side, so the gap search that
   *   placed the others had nothing to bite on. At -780 the line lay in the
   *   rail land west of the station, and the name with it.
   *
   *   -702.6 is the spacing the rest of the family actually keeps: King to
   *   William is 235.5, William to Queen 233.3, Queen to Elizabeth 228.2,
   *   Elizabeth to Swanston 232.8, Swanston to Russell 236.5 -- a mean of
   *   233.3, which from King at -469.3 puts Spencer at -702.6. The westmost
   *   CBD frontage along its run is at -682.6, and half a 30.2 m carriageway
   *   inside that is -697.7, so the two methods agree within five metres.
   */
  { name: 'Spencer Street', axis: 'cross', offsetM: -702.6, addressFitM: -780, fromM: -430, toM: 760, buildingCoverage: 0, inferred: true },
  { name: 'King Street', axis: 'cross', offsetM: -469.3, addressFitM: -491.3, fromM: -430, toM: 700, buildingCoverage: 0 },
  { name: 'William Street', axis: 'cross', offsetM: -233.8, addressFitM: -199.8, fromM: -880, toM: 560, buildingCoverage: 0 },
  { name: 'Queen Street', axis: 'cross', offsetM: -0.5, addressFitM: 41.5, fromM: -1060, toM: 660, buildingCoverage: 0 },
  { name: 'Elizabeth Street', axis: 'cross', offsetM: 227.7, addressFitM: 191.7, fromM: -950, toM: 680, buildingCoverage: 0.04 },
  { name: 'Swanston Street', axis: 'cross', offsetM: 460.5, addressFitM: 444.5, fromM: -830, toM: 700, buildingCoverage: 0.03 },
  { name: 'Russell Street', axis: 'cross', offsetM: 697, addressFitM: 665, fromM: -710, toM: 720, buildingCoverage: 0.07, inferred: true },
];

/**
 * How far from a street you can be before its name stops being about you.
 *
 * The grid's main streets are a little over 230 m apart, so this reaches the
 * street you are on and the one either side of it -- about six names on
 * screen instead of twelve, and each of them one you could walk to.
 *
 * It is the fix for a name that would not leave. Every street used to be
 * labelled at all times, and because the label slides along its own line to
 * stay level with the camera, crossing a street did not take its name away:
 * the name came WITH you, sliding along a street now behind your shoulder.
 * The label belonged to the camera rather than to a place.
 */
export const LABEL_RADIUS_M = 340;

/**
 * Where a named street runs, along its own axis. Null if there is no such
 * street. Exported for the tests, which check that no label ever leaves the
 * road it names -- an invariant they cannot state without these numbers.
 */
export function streetExtentOf(name: string): [number, number] | null {
  const street = STREETS.find((candidate) => candidate.name === name);
  return street ? [street.fromM, street.toM] : null;
}

/**
 * How far in from the end of a street to keep the middle of its name.
 *
 * The label is centred on the point, so a name parked exactly on the last
 * metre of the road hangs half its own length off the end of it.
 */
const END_INSET_M = 70;

/**
 * ── WHERE ALONG THE BLOCK, AND WHY NOT SIMPLY "NEAREST TO THE CAMERA" ─────
 *
 * The obvious placement -- the point on the street closest to what is being
 * looked at -- puts every name on an INTERSECTION, and it does it to all of
 * them at once, because they are all measured from the same point. Bourke
 * and Elizabeth ended up twenty pixels apart on the same corner.
 *
 * A junction is the worst spot on a street for its name. The label is a long
 * box centred on the point: along the carriageway it lies in the gap, but
 * across a crossroads it reaches over both corner buildings, which is what
 * makes a correctly placed name look like it is sitting on a roof.
 *
 * So the name snaps to the middle of a block, which is where a map has
 * always put it. The blocks come from the grid itself -- one family's
 * offsets are the crossings of the other -- so this is the midpoint between
 * consecutive crossings, not a spacing invented here.
 */
function midBlockPoints(axis: 'long' | 'cross'): number[] {
  const crossings = STREETS.filter((street) => street.axis !== axis)
    .map((street) => street.offsetM)
    .sort((a, b) => a - b);

  const mids: number[] = [];
  for (let i = 0; i < crossings.length - 1; i++) {
    mids.push((crossings[i] + crossings[i + 1]) / 2);
  }
  return mids;
}

/**
 * Places the name of each nearby street on it, beside a point of interest.
 *
 * A street is a line, so its offset fixes only one coordinate. The other
 * follows the point of interest -- clamped to the length of the street, so
 * the name gathers around what is being looked at without leaving the road it
 * names. Streets too far off to be worth naming are left out entirely.
 */
export function streetLabelsNear(
  east: number,
  north: number,
  /*
   * Overridable so the tests can ask for the whole catalogue with Infinity.
   * What the grid IS and what is worth drawing right now are two questions,
   * and only the second one has a radius.
   */
  radiusM: number = LABEL_RADIUS_M,
): StreetLabel[] {
  // How far along each axis the point of interest sits.
  const alongLong = east * LONG_DIR[0] + north * LONG_DIR[1];
  const alongCross = east * CROSS_DIR[0] + north * CROSS_DIR[1];

  return STREETS.flatMap(({ name, axis, offsetM, fromM, toM, buildingCoverage, inferred }) => {
    const [runE, runN] = axis === 'long' ? LONG_DIR : CROSS_DIR;
    const [offE, offN] = axis === 'long' ? CROSS_DIR : LONG_DIR;

    /*
     * The two coordinates, and which is which.
     *
     * A street's `offsetM` is measured across it, down the axis the OTHER
     * family runs. So the anchor's coordinate on that same axis is what says
     * how far away the street is, and its coordinate on the street's own axis
     * is how far along it to put the name.
     */
    const across = axis === 'long' ? alongCross : alongLong;
    if (Math.abs(across - offsetM) > radiusM) return [];

    /*
     * Clamped to THIS street's own ends, not to the grid's outer rectangle.
     * The inset is dropped rather than inverted on a street shorter than two
     * insets, which would otherwise put the name outside the very bounds it
     * is meant to keep it inside.
     */
    const room = toM - fromM > END_INSET_M * 2 ? END_INSET_M : 0;
    const lower = fromM + room;
    const upper = toM - room;
    const wanted = Math.min(upper, Math.max(lower, axis === 'long' ? alongLong : alongCross));

    /*
     * Then to the middle of the nearest block. Only blocks that fall inside
     * this street's own length are candidates; a street with none -- one
     * shorter than the gap between two crossings -- keeps the plain clamp.
     */
    const blocks = midBlockPoints(axis).filter((at) => at >= lower && at <= upper);
    const alongStreet = blocks.length
      ? blocks.reduce((best, at) =>
          Math.abs(at - wanted) < Math.abs(best - wanted) ? at : best,
        )
      : wanted;

    return [
      {
        name,
        axis,
        buildingCoverage,
        east: runE * alongStreet + offE * offsetM,
        north: runN * alongStreet + offN * offsetM,
        // Text runs along its own +x; turn that onto the street direction.
        rotation: Math.atan2(runN, runE),
        inferred,
      },
    ];
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
  /* Spencer Street. Moved with its name -- see the note on the offset. */
  { axis: 'cross', offsetM: -702.6, widthM: MAIN_WIDTH_M },
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
