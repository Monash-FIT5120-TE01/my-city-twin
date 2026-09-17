import { describe, expect, it } from 'vitest';
import {
  CROSS_BEARING_DEG,
  LONG_BEARING_DEG,
  streetLabelsNear,
  streetExtentOf,
  LABEL_RADIUS_M,
} from './streets';

/*
 * The street grid was fitted from development addresses rather than typed in,
 * so these tests check the fit still describes the Hoddle Grid: two
 * perpendicular families, regular block spacing, and each name on its own
 * line however the view moves.
 */

/* The whole catalogue. What is worth DRAWING has a radius; the grid does not. */
const labels = streetLabelsNear(0, 0, Infinity);
const byName = (name: string) => labels.find((l) => l.name === name)!;

describe('the Hoddle Grid', () => {
  it('has twelve named streets', () => {
    expect(labels).toHaveLength(12);
  });

  it('has two perpendicular families', () => {
    expect(CROSS_BEARING_DEG - LONG_BEARING_DEG).toBe(90);
  });

  it('runs Bourke Street close to the scene origin', () => {
    /*
     * The origin was placed on Bourke Street. The line sits about 50 m off it
     * because it follows the carriageway, not the frontages the addresses sit
     * on -- but it is still the nearest long street to the origin.
     *
     * Measured on the LINE, not on the label. The label slides along its
     * street and snaps to the middle of a block, so how far the name happens
     * to be from the origin says nothing about which street is nearest; the
     * perpendicular offset is the thing that does.
     */
    const across = (label: { east: number; north: number }) =>
      Math.abs(alongAxis(CROSS_BEARING_DEG, label.east, label.north));

    const bourke = across(byName('Bourke Street'));
    expect(bourke).toBeLessThan(80);

    for (const other of labels.filter((l) => l.axis === 'long' && l.name !== 'Bourke Street')) {
      expect(across(other)).toBeGreaterThan(bourke);
    }
  });

  it('keeps every name off the rooftops', () => {
    // Placing a label on the address fit rather than the carriageway is what
    // put "Queen Street" on a building. Anything above a fifth of its length
    // inside a footprint means the search found no real gap.
    for (const label of labels) {
      expect(label.buildingCoverage).toBeLessThan(0.2);
    }
  });

  it('spaces the long streets about a block apart', () => {
    const order = [
      'La Trobe Street',
      'Lonsdale Street',
      'Bourke Street',
      'Collins Street',
      'Flinders Street',
    ].map(byName);

    for (let i = 1; i < order.length; i++) {
      const gap = Math.hypot(
        order[i].east - order[i - 1].east,
        order[i].north - order[i - 1].north,
      );
      expect(gap).toBeGreaterThan(150);
      expect(gap).toBeLessThan(300);
    }
  });

  it('orders the cross streets west to east', () => {
    const order = [
      'Spencer Street',
      'King Street',
      'William Street',
      'Queen Street',
      'Elizabeth Street',
      'Swanston Street',
      'Russell Street',
    ].map(byName);

    for (let i = 1; i < order.length; i++) {
      expect(order[i].east).toBeGreaterThan(order[i - 1].east);
    }
  });

  it('runs each name along its own street', () => {
    const long = byName('Bourke Street').rotation;
    const cross = byName('Queen Street').rotation;
    const between = Math.abs(long - cross) * (180 / Math.PI);
    expect(between).toBeCloseTo(90, 4);
  });

  it('marks the two offsets that were interpolated rather than measured', () => {
    const inferred = labels.filter((l) => l.inferred).map((l) => l.name);
    expect(inferred).toEqual(['Spencer Street', 'Russell Street']);
  });
});

describe('labels follow the view', () => {
  it('slides each name along its street without ever leaving it', () => {
    const here = streetLabelsNear(0, 0, Infinity);
    /*
     * A step that crosses a block on BOTH axes. (-532, -198) does not: it
     * projects 568 m along the long axis and six along the cross one, so the
     * cross streets correctly stay in the block they were in, and a test that
     * demanded they move was measuring the step, not the code.
     */
    const away = streetLabelsNear(500, 500, Infinity);

    let moved = 0;
    for (const name of here.map((l) => l.name)) {
      const a = here.find((l) => l.name === name)!;
      const b = away.find((l) => l.name === name)!;

      /*
       * Whatever it does, it does ALONG the street: the perpendicular offset
       * is the one thing that may never change, because that is the street.
       */
      const runE = Math.cos(a.rotation);
      const runN = Math.sin(a.rotation);
      const perpendicular = (b.east - a.east) * -runN + (b.north - a.north) * runE;
      expect(Math.abs(perpendicular)).toBeLessThan(0.001);

      if (Math.hypot(b.east - a.east, b.north - a.north) > 1) moved++;
    }

    /*
     * This step is more than a block on both axes, so every name that has a
     * block to move to should have moved. Snapping means a smaller step may
     * legitimately move none of them.
     */
    expect(moved).toBe(here.length);
  });

  it('puts the name mid-block rather than on the crossroads', () => {
    /*
     * The fault this fixes: every label was placed at the point on its street
     * nearest the view, and since they all measure from the same point they
     * all landed on the same intersection -- Bourke and Elizabeth twenty
     * pixels apart on one corner. A name centred on a junction reaches over
     * both corner buildings, which is what made correctly placed names look
     * like they were sitting on roofs.
     */
    const crossings = (axis: 'long' | 'cross') =>
      streetLabelsNear(0, 0, Infinity)
        .filter((l) => l.axis !== axis)
        .map((l) =>
          alongAxis(l.axis === 'long' ? CROSS_BEARING_DEG : LONG_BEARING_DEG, l.east, l.north),
        );

    for (const [east, north] of [
      [0, 0],
      [200, -150],
      [-400, 250],
    ] as const) {
      for (const label of streetLabelsNear(east, north, Infinity)) {
        const along = alongAxis(
          label.axis === 'long' ? LONG_BEARING_DEG : CROSS_BEARING_DEG,
          label.east,
          label.north,
        );
        const nearestCrossing = crossings(label.axis).reduce((best, at) =>
          Math.abs(at - along) < Math.abs(best - along) ? at : best,
        );
        // Half a block is ~115 m; anything inside 60 m of a crossing is on it.
        expect(Math.abs(along - nearestCrossing)).toBeGreaterThan(60);
      }
    }
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHICH NAMES ARE WORTH DRAWING, AND WHERE THEY MAY SIT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Two faults, one cause. Every street was labelled at all times, and each
 * label slides along its own line to stay level with the camera -- so a name
 * belonged to the viewer rather than to a place. Crossing a street did not
 * take its name away, it dragged the name along behind the shoulder; and a
 * street on the far side of the grid was still named, at the projection of
 * the camera onto its line, which could be past the end of the street.
 */

const DEG = Math.PI / 180;
const alongAxis = (bearingDeg: number, east: number, north: number) =>
  east * Math.sin(bearingDeg * DEG) + north * Math.cos(bearingDeg * DEG);

/** A point standing on the named street, `across` metres to one side of it. */
function beside(name: string, across: number): [number, number] {
  const street = streetLabelsNear(0, 0, Infinity).find((l) => l.name === name)!;
  // The street's own perpendicular is its run turned a quarter turn.
  const runE = Math.cos(street.rotation);
  const runN = Math.sin(street.rotation);
  return [street.east - runN * across, street.north + runE * across];
}

describe('which street names are drawn', () => {
  it('names the street you are standing on', () => {
    const [east, north] = beside('Bourke Street', 0);
    expect(streetLabelsNear(east, north).map((l) => l.name)).toContain('Bourke Street');
  });

  it('stops naming a street once you are well past it', () => {
    // A block and a half away on Bourke's own perpendicular.
    const [east, north] = beside('Bourke Street', LABEL_RADIUS_M + 40);
    expect(streetLabelsNear(east, north).map((l) => l.name)).not.toContain('Bourke Street');
  });

  it('drops the name as you cross and keep going, rather than dragging it', () => {
    const seen = (across: number) => {
      const [east, north] = beside('Collins Street', across);
      return streetLabelsNear(east, north).map((l) => l.name).includes('Collins Street');
    };
    expect(seen(0)).toBe(true);
    expect(seen(120)).toBe(true);
    expect(seen(LABEL_RADIUS_M + 60)).toBe(false);
  });

  it('draws fewer than the whole catalogue from anywhere in the grid', () => {
    for (const [east, north] of [
      [0, 0],
      [-400, 200],
      [300, -350],
      [600, 600],
    ] as const) {
      const drawn = streetLabelsNear(east, north);
      expect(drawn.length).toBeLessThan(12);
      expect(drawn.length).toBeGreaterThan(0);
    }
  });

  it('still names every street somewhere on the grid', () => {
    const everywhere = new Set<string>();
    for (let east = -900; east <= 900; east += 60) {
      for (let north = -900; north <= 900; north += 60) {
        for (const label of streetLabelsNear(east, north)) everywhere.add(label.name);
      }
    }
    expect(everywhere.size).toBe(12);
  });
});

describe('where along a street its name may sit', () => {
  /*
   * The bound is the grid's own: a long street is labelled only between the
   * outermost cross streets it meets, and the other way round. Beyond that
   * the name was floating over blocks, or over nothing.
   */
  it('keeps every name on the road it names, however far the camera goes', () => {
    /*
     * The bound is the street's OWN length, measured from the frontages
     * either side of it -- not the outer rectangle of the grid. Bourke Street
     * stops at Spencer; the rectangle carried on another 130 m, and looking
     * west put the name for Bourke Street out over the railway station.
     */
    for (const distance of [900, 2000, 8000, -900, -2000, -8000]) {
      for (const label of streetLabelsNear(distance, distance, Infinity)) {
        const [from, to] = streetExtentOf(label.name)!;
        const along = alongAxis(
          label.axis === 'long' ? LONG_BEARING_DEG : CROSS_BEARING_DEG,
          label.east,
          label.north,
        );
        expect(along).toBeGreaterThanOrEqual(from - 0.001);
        expect(along).toBeLessThanOrEqual(to + 0.001);
      }
    }
  });

  it('does not carry a long street’s name out over the railway station', () => {
    /*
     * The reported fault, as a test. Looking west of the grid used to slide
     * Bourke, Collins and Flinders out past their last frontage and park
     * their names over Southern Cross and the rail yards -- places those
     * streets do not reach.
     *
     * Spencer Street is the westernmost cross street at -780, and it is the
     * landmark here: a long street's name must stay EAST of it, because that
     * is where the long streets stop.
     */
    const SPENCER = -780;
    for (const [east, north] of [
      [-1200, -600],
      [-2000, -900],
      [-900, 300],
    ] as const) {
      for (const label of streetLabelsNear(east, north, Infinity)) {
        if (label.axis !== 'long') continue;
        const along = alongAxis(LONG_BEARING_DEG, label.east, label.north);
        expect(along).toBeGreaterThan(SPENCER);
      }
    }
  });

  it('bounds every street to something shorter than the sampled world', () => {
    /*
     * Guards the measurement itself. The extents are sampled over -1300..1300;
     * a street that came back spanning all of it would mean the search found
     * no edge, and the clamp would be decorative.
     *
     * Bourke's west end is named explicitly because it is the one the station
     * fault turned on: its last frontage is just east of Spencer, and any
     * change that carries it further west puts the name over the rail yards
     * again.
     */
    for (const { name } of [{ name: 'Bourke Street' }, { name: 'Flinders Street' }, { name: 'Spencer Street' }]) {
      const [from, to] = streetExtentOf(name)!;
      expect(to - from).toBeLessThan(2400);
      expect(to).toBeGreaterThan(from);
    }
    expect(streetExtentOf('Bourke Street')![0]).toBeGreaterThan(-800);
  });

  it('still follows the camera while the camera is inside the grid', () => {
    const at = (east: number, north: number) =>
      streetLabelsNear(east, north, Infinity).find((l) => l.name === 'Queen Street')!;
    const a = at(0, 0);
    const b = at(-300, 260);
    expect(Math.hypot(b.east - a.east, b.north - a.north)).toBeGreaterThan(1);
  });
});
