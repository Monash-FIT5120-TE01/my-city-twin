import { describe, expect, it } from 'vitest';
import { toPixel, type MapView } from './vrMapDraw';
import { LANDMARKS } from './vrLandmarks';

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
