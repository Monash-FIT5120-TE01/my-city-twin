import { describe, expect, it } from 'vitest';
import { toPixel, type MapView } from './vrMapDraw';
import { LANDMARKS } from './vrLandmarks';
import type { PolygonEN } from '../data/model';

const view = (over: Partial<MapView> = {}): MapView => ({
  width: 400,
  height: 600,
  centreEN: [100, 200],
  metresPerPx: 2,
  upHeadingRad: 0,
  ...over,
});

describe('the headset map', () => {
  it('puts its centre in the middle of the picture', () => {
    expect(toPixel(view(), [100, 200])).toEqual([200, 300]);
  });

  it('north up: north is up the picture and east is to the right', () => {
    const [nx, ny] = toPixel(view(), [100, 220]);
    expect(nx).toBeCloseTo(200, 9);
    expect(ny).toBeCloseTo(290, 9);
    const [ex, ey] = toPixel(view(), [120, 200]);
    expect(ex).toBeCloseTo(210, 9);
    expect(ey).toBeCloseTo(300, 9);
  });

  it('ahead up: whatever lies along the heading is straight up the picture', () => {
    const heading = (60 * Math.PI) / 180;
    const ahead: [number, number] = [100 + 40 * Math.sin(heading), 200 + 40 * Math.cos(heading)];
    const [x, y] = toPixel(view({ upHeadingRad: heading }), ahead);
    expect(x).toBeCloseTo(200, 9);
    expect(y).toBeCloseTo(280, 9);
  });

  it('names landmarks that stand inside the city the app draws', () => {
    // The CBD grid spans a couple of kilometres around the scene origin.
    for (const landmark of LANDMARKS) {
      expect(Math.hypot(...landmark.en), landmark.name).toBeLessThan(2000);
      expect(landmark.name, landmark.name).toMatch(/^[\x20-\x7E]+$/);
    }
  });
});

describe('the city in squares, for the headset map', () => {
  // Path2D is a browser's; a stand-in that counts what is put in it is enough here.
  class CountingPath {
    rings = 0;
    moveTo() {}
    lineTo() {}
    closePath() {
      this.rings += 1;
    }
  }
  // One polygon of one ring.
  const square = (e: number, n: number): PolygonEN[] => [[[[e, n], [e + 10, n], [e + 10, n + 10], [e, n + 10]]]];

  it('puts each footprint in the square its first corner is in, and is done once all are in', async () => {
    (globalThis as { Path2D?: unknown }).Path2D = CountingPath;
    const { startCityTiles, TILE_M } = await import('./vrMapDraw');
    const tiles = startCityTiles(
      [{ footprint: square(10, 10) }, { footprint: square(20, 20) }, { footprint: square(TILE_M + 5, 10) }],
      [{ footprints: square(30, 30) }],
    );
    expect(tiles.done()).toBe(false);
    while (!tiles.step(5));
    expect(tiles.done()).toBe(true);
    const first = tiles.tiles.get('0,0') as unknown as { buildings: CountingPath; developments: CountingPath };
    expect(first.buildings.rings).toBe(2);
    expect(first.developments.rings).toBe(1);
    expect(tiles.tiles.get('1,0')).toBeDefined();
  });

  it('a picture of part of the city takes only the squares near it; the whole city takes them all', async () => {
    (globalThis as { Path2D?: unknown }).Path2D = CountingPath;
    const { artNear, startCityTiles, TILE_M } = await import('./vrMapDraw');
    const tiles = startCityTiles([{ footprint: square(0, 0) }, { footprint: square(TILE_M * 10, 0) }], []);
    while (!tiles.step(5));
    expect(artNear(tiles, [0, 0], 100, null).layers).toHaveLength(1);
    expect(artNear(tiles, null, 0, null).layers).toHaveLength(2);
  });
});
