/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE EACH FUTURE PLAN IS, ON THE TWIN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The place on the 3D map for each plan the API lists, so that opening a
 *   plan can show where it is (PlanMapSheet, scene/PlanHighlight). The API
 *   gives a plan's name and theme and nothing about where it is, so the
 *   places are kept here, by the plan's whole name, until the backend has
 *   them (decided 2026-10-29). A plan this file does not know is "not on the
 *   map yet", never guessed at.
 *
 * THREE KINDS OF POSITION, AND THE PAGE SAYS WHICH
 *   - On the grid: a street or lane of the Hoddle Grid, drawn on the same
 *     lines the street names and the road surface come from (streets.ts).
 *     As good as the model's own streets.
 *   - Traced: followed along the gap between the model's own buildings —
 *     a street off the grid (Franklin Street), and the lanes, whose lines
 *     on the grid run under buildings for long stretches.
 *   - Placed by hand: a point read off the plan's own description ("the
 *     north bank, from Birrarung Marr towards Victoria Harbour") and looked
 *     up in OpenStreetMap (Nominatim for a named place, Overpass for a
 *     street corner), 2026-10-29. Positions typed from memory first were up
 *     to 500 m out (Central Pier, Dodds Street, Edmund Herring Oval). Still
 *     a point for a place, so approximate, and said to be.
 *
 * A BAND ONLY WHERE THE MODEL BEARS IT OUT
 *   A pink band says "here, exactly". It is drawn only for a place checked
 *   against the model itself — the grid, or a trace through the buildings.
 *   A place set by hand gets the pin alone: a band drawn from hand-placed
 *   points crossed open ground beside Queens Bridge and lit nothing that
 *   was there (2026-10-29), which is worse than no band.
 *
 * WHAT IS NOT ON THE MAP
 *   City-wide programmes (many streets, no one place), the plans out in the
 *   suburbs (outside the area the twin covers) and any plan whose sources
 *   do not say where it is. Each says why, rather than being dropped.
 *
 * NO "ONCE BUILT" YET
 *   None of these plans is a building in the development data, so none has
 *   a 3D shape to switch on and off. The highlight is the place, not the
 *   finished thing.
 */

import type { FuturePlan } from '../data/useFuturePlans';
import { landmarkEN } from '../data/landmarks';
import { GRID_DIRECTIONS, gridStreets } from '../scene/streets';
import { isProgramme, isWiderMelbourne } from './FuturePlanList';

/** East/north metres from the scene origin. */
export type EN = [number, number];

export type PlanShape =
  /** A street or a path, drawn as a band along the ground this wide. */
  | { kind: 'line'; points: EN[]; widthM: number }
  /** The edge of an area, drawn as a band round it. */
  | { kind: 'ring'; points: EN[] };

export type PlanPlace =
  | {
      onMap: true;
      /** What is highlighted, in the places' own names (the same in every language). */
      where: string;
      shapes: PlanShape[];
      /** Where the pin stands and the camera looks. */
      pin: EN;
      /** How much ground the place covers, metres: how far back the camera stands. */
      spanM: number;
      /** On the model's own street grid, traced through its buildings, or placed by hand from the plan's description. */
      basis: 'grid' | 'traced' | 'approx';
      /** Past the 3D buildings, on the base map only. */
      beyondModel: boolean;
    }
  | {
      onMap: false;
      why: 'citywide' | 'wider' | 'unknown';
    };

/* ── the grid ─────────────────────────────────────────────── */

const [LONG_E, LONG_N] = GRID_DIRECTIONS.long;
const [CROSS_E, CROSS_N] = GRID_DIRECTIONS.cross;

/** A point by how far along each of the grid's two directions it lies (streets.ts). */
const onGrid = (alongLong: number, alongCross: number): EN => [
  LONG_E * alongLong + CROSS_E * alongCross,
  LONG_N * alongLong + CROSS_N * alongCross,
];

const alongCrossOf = ([e, n]: EN) => e * CROSS_E + n * CROSS_N;
const alongLongOf = ([e, n]: EN) => e * LONG_E + n * LONG_N;

/** Where a named street of the grid runs, across its own direction. */
function offsetOf(name: string): number {
  const street = gridStreets().find((candidate) => candidate.name === name);
  if (!street) throw new Error(`no street ${name} in the grid`);
  return street.offsetM;
}

/*
 * The lanes, only where they are open in the model (2026-10-29). Their lines
 * in streets.ts (ROADS) put half of each lane under a building: the lanes
 * are narrow, and the footprints genuinely cover long stretches of them
 * (arcades, buildings over the lane). So each lane was traced as Franklin
 * Street was — the best shift across for the whole lane, then every 5 m the
 * offset within 3 m of it whose 6 m by 4 m patch is free of all 4,443
 * footprints — and only the clear runs of 40 m or more are kept. The rest is
 * left undrawn rather than lit over roofs.
 *
 * [from, to] along the grid's long direction, and the offset across it, metres.
 */
type LaneRun = [number, number, number];
const LANES: Record<'Little Lonsdale Street' | 'Little Bourke Street' | 'Flinders Lane', LaneRun[]> = {
  'Little Lonsdale Street': [
    [-250, -130, -313.2],
    [-20, 55, -313.2],
    [440, 980, -313.5],
    [1140, 1180, -313.2],
  ],
  'Little Bourke Street': [[-730, -75, -53.1]],
  'Flinders Lane': [
    [-730, -680, 392.4],
    [-245, -115, 392.4],
    [195, 710, 392.2],
  ],
};

const laneBands = (runs: LaneRun[]): PlanShape[] =>
  runs.map(([from, to, across]) => ({ kind: 'line', points: [onGrid(from, across), onGrid(to, across)], widthM: LANE_M }));

/** The grid's east and west ends: Spencer Street and Spring Street (streets.ts ROADS). */
const SPENCER = offsetOf('Spencer Street');
const SPRING = 1140.6;
const LA_TROBE = offsetOf('La Trobe Street');
const FLINDERS = offsetOf('Flinders Street');

/** A main street's band: the grid's own street width, a chain and a half (streets.ts). */
const MAIN_M = 30.2;
/** A lane's band: narrower than its 10.1 m, so it stays inside the clear run it was traced in. */
const LANE_M = 8;

const crossStreet = (offset: number, from = LA_TROBE, to = FLINDERS): EN[] => [onGrid(offset, from), onGrid(offset, to)];

const middleOf = (points: EN[]): EN => {
  const e = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const n = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [e, n];
};

const spanOf = (points: EN[]): number => {
  let span = 0;
  for (const a of points) for (const b of points) span = Math.max(span, Math.hypot(a[0] - b[0], a[1] - b[1]));
  return span;
};

/* ── placed by hand ───────────────────────────────────────── */

/** Latitude and longitude to the scene, the way the landmarks are placed. */
const ll = (lat: number, lon: number): EN => landmarkEN({ latitude: String(lat), longitude: String(lon) });

/*
 * Franklin Street, north of the grid, traced along the gap between the
 * buildings (2026-10-29). Every 20 m along the grid's long direction, the
 * offset across it was found whose surroundings — 20 m along, 16 m across —
 * fall inside none of the 4,443 building footprints, each step allowed to
 * move at most 6 m from the last, starting beside the City Baths (on the
 * street's north side at the Swanston Street corner). From just west of
 * Queen Street to Swanston Street every step came out clear; the street
 * drifts 8 m across the grid over that length, which is why one straight
 * line at any bearing could not stay in it. Past those two ends the trace
 * ran into buildings — the street bends there, towards Peel Street and
 * Stewart Street — so they are not drawn rather than drawn wrong.
 *
 * [along the grid's long direction, across it], metres (streets.ts).
 */
const FRANKLIN_TRACE: [number, number][] = [
  [-60, -670.3],
  [50, -670.3],
  [150, -672.3],
  [250, -675.3],
  [350, -676.3],
  [455, -678.3],
];

/* ── the places ───────────────────────────────────────────── */

/** A place as kept here: the pin and the span are worked out from its shapes unless given. */
type Entry = Omit<Extract<PlanPlace, { onMap: true }>, 'onMap' | 'pin' | 'spanM'> & { pin?: EN; spanM?: number };

const pinAt = (where: string, at: EN, beyondModel = false): Entry => ({
  where,
  shapes: [],
  pin: at,
  basis: 'approx',
  beyondModel,
});

const PLACES: Record<string, Entry> = {
  /*
   * A precinct, not a boundary. The plan says the Central City lies largely
   * within the Hoddle Grid and sets planting priorities in it; it draws no
   * line round it, so neither does this (a ring round the grid was drawn
   * first, and claimed a boundary the plan does not have; review 2026-10-29).
   * A pin in the middle of the grid, with the camera back far enough to take
   * the whole grid in.
   */
  'Central City Urban Forest Precinct Plan 2025–2035': {
    ...pinAt('The Central City, largely within the Hoddle Grid', onGrid((SPENCER + SPRING) / 2, (LA_TROBE + FLINDERS) / 2)),
    spanM: Math.hypot(SPRING - SPENCER, FLINDERS - LA_TROBE),
  },
  'Franklin Street transformation': {
    where: 'Franklin Street, Queen St – Swanston St',
    shapes: [{ kind: 'line', points: FRANKLIN_TRACE.map(([along, across]) => onGrid(along, across)), widthM: 20 }],
    basis: 'traced',
    beyondModel: false,
  },
  // OpenStreetMap: Enterprize Park
  Greenline: pinAt('The Yarra’s north bank, Birrarung Marr – Victoria Harbour', ll(-37.8202, 144.95943)),
  // OpenStreetMap: Town Hall station (the Federation Square entrance itself is not in it yet)
  'Town Hall Station finishing works': pinAt('Town Hall Station, as a reference point: the works are at its Federation Square entrance', ll(-37.81661, 144.96709)),
  // OpenStreetMap: Queen Victoria Market Car Park
  'Queen Victoria Market — Market Square': pinAt('Queen Victoria Market, the open-air car park', ll(-37.80837, 144.95671)),
  'Flinders Lane streetscape upgrade': {
    where: 'Flinders Lane, where it is open in the model',
    shapes: laneBands(LANES['Flinders Lane']),
    basis: 'traced',
    beyondModel: false,
  },
  'Little Bourke Street streetscape upgrade': {
    where: 'Little Bourke Street, where it is open in the model',
    shapes: laneBands(LANES['Little Bourke Street']),
    basis: 'traced',
    beyondModel: false,
  },
  'Little Lonsdale Street upgrade': {
    where: 'Little Lonsdale Street, where it is open in the model',
    shapes: laneBands(LANES['Little Lonsdale Street']),
    basis: 'traced',
    beyondModel: false,
  },
  'Elizabeth Street Strategic Opportunities Plan': {
    where: 'Elizabeth Street, Lonsdale St – La Trobe St (the phase on record)',
    shapes: [
      {
        kind: 'line',
        points: crossStreet(offsetOf('Elizabeth Street'), LA_TROBE, offsetOf('Lonsdale Street')),
        widthM: MAIN_M,
      },
    ],
    basis: 'grid',
    beyondModel: false,
  },
  // OpenStreetMap: Queens Bridge
  'Queens Bridge restoration and repairs': pinAt('Queens Bridge', ll(-37.82047, 144.96139)),
  // OpenStreetMap: Riverslide Skate Park
  'Riverslide Skate Park redevelopment': pinAt('Riverslide Skate Park, Alexandra Gardens', ll(-37.82051, 144.97302)),
  // OpenStreetMap: City Road at Kings Way (Overpass)
  'City Road Undercroft Park': pinAt('Under Kings Way at City Road, Southbank', ll(-37.8258, 144.96035), true),
  // OpenStreetMap: City Road
  'City Road Master Plan works': pinAt('City Road, Southbank', ll(-37.82591, 144.96022), true),
  // OpenStreetMap: Southbank Boulevard
  'Southbank Boulevard Stage 6': pinAt('Southbank Boulevard, Southbank', ll(-37.8231, 144.96559), true),
  // OpenStreetMap: Queensbridge Square
  'Queensbridge Square — Red Stairs redevelopment': pinAt('Queensbridge Square, Southbank', ll(-37.82121, 144.96192)),
  // OpenStreetMap: Miles Street at Dodds Street (Overpass)
  'Miles and Dodds Street Reserve expansion': pinAt('Miles Street and Dodds Street, Southbank', ll(-37.82865, 144.96715), true),
  // OpenStreetMap: the Central Pier tram stop, Harbour Esplanade
  'Central Pier waterfront revitalisation': pinAt('Central Pier, Docklands', ll(-37.8142, 144.9446), true),
  // OpenStreetMap: Newquay Promenade
  'NewQuay Wharf pile rehabilitation': pinAt('NewQuay, Docklands', ll(-37.81529, 144.94098), true),
  // OpenStreetMap: Hawke Street
  'Hawke Street greening': pinAt('Hawke Street, West Melbourne', ll(-37.80528, 144.94904), true),
  // OpenStreetMap: University Square
  'University Square Stage 2': pinAt('University Square, Carlton', ll(-37.80103, 144.96038), true),
  // OpenStreetMap: Carlton Gardens
  'Carlton Gardens master-plan works': pinAt('Carlton Gardens', ll(-37.80626, 144.97123), true),
  'Next Generation Trams — Route 57 enabling works': {
    where: 'Elizabeth Street, where Route 57 runs through the CBD',
    shapes: [{ kind: 'line', points: crossStreet(offsetOf('Elizabeth Street')), widthM: MAIN_M }],
    basis: 'grid',
    beyondModel: false,
  },
};

/*
 * Plans outside the area the twin covers, besides the ones tagged Wider
 * Melbourne. Victoria Harbour (2.1 km out) and Edmund Herring Oval (2.4 km)
 * are on the ground plane but past where its map fades into the haze: their
 * pins stood on blank grey, which places nothing (checked in screenshots,
 * 2026-10-29). Newquay, at 2.0 km, still shows its piers.
 */
const ALSO_WIDER = new Set([
  'melbourne airport rail',
  'brunswick tram depot upgrade — service impacts',
  'victoria harbour promenade rectification',
  'edmund herring oval precinct upgrade',
]);

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const BY_KEY = new Map(Object.entries(PLACES).map(([name, entry]) => [key(name), entry]));

/** Where a plan is on the twin, or why it is not on it. */
export function planPlaceFor(plan: FuturePlan): PlanPlace {
  if (isProgramme(plan)) return { onMap: false, why: 'citywide' };
  if (isWiderMelbourne(plan) || ALSO_WIDER.has(key(plan.name))) return { onMap: false, why: 'wider' };
  const entry = BY_KEY.get(key(plan.name));
  if (!entry) return { onMap: false, why: 'unknown' };
  /*
   * The camera frames the longest piece rather than all of them. A lane open
   * in three stretches along 1.9 km, framed whole, put the camera so far back
   * that an 8 m band came out a few pixels wide.
   */
  const longest = entry.shapes.reduce<PlanShape | null>(
    (best, shape) => (!best || spanOf(shape.points) > spanOf(best.points) ? shape : best),
    null,
  );
  const points = longest?.points ?? [];
  return {
    ...entry,
    onMap: true,
    pin: entry.pin ?? middleOf(points),
    spanM: entry.spanM ?? (points.length > 1 ? spanOf(points) : 0),
  };
}

/** The plans' names this file places, for the tests. */
export const PLACED_NAMES = Object.keys(PLACES);

/** Where a point lies along each of the grid's two directions, for the tests. */
export { alongCrossOf, alongLongOf };
