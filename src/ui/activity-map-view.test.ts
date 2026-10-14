import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  centreOn,
  fitView,
  glowAt,
  glowRadiusM,
  panBy,
  SCALE_LIMITS,
  toScreen,
  toWorld,
  zoomAt,
  type Glow,
} from './activityMapView';
import { ACTIVITY_RADII_M } from '../scene/activityPalette';

const W = 1000;
const H = 600;
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('the flat map\'s view', () => {
  it('turns metres into pixels and back, north up', () => {
    const view = { scale: 2, centre: [100, 50] as [number, number] };
    expect(toScreen(view, W, H, 100, 50)).toEqual([500, 300]);
    const [x, y] = toScreen(view, W, H, 110, 60);
    expect(x).toBe(520);
    // Further north is higher on the screen.
    expect(y).toBe(280);
    const [e, n] = toWorld(view, W, H, x, y);
    near(e, 110);
    near(n, 60);
  });

  it('fits the bounds whole in the free part, centred there', () => {
    const bounds = { minE: -500, minN: -300, maxE: 500, maxN: 300 };
    const insets = { left: 400, right: 0, top: 0, bottom: 200 };
    const view = fitView(bounds, W, H, insets);
    const [x0, y0] = toScreen(view, W, H, bounds.minE, bounds.maxN);
    const [x1, y1] = toScreen(view, W, H, bounds.maxE, bounds.minN);
    expect(x0).toBeGreaterThanOrEqual(insets.left - 1e-6);
    expect(x1).toBeLessThanOrEqual(W + 1e-6);
    expect(y0).toBeGreaterThanOrEqual(-1e-6);
    expect(y1).toBeLessThanOrEqual(H - insets.bottom + 1e-6);
    const [cx, cy] = toScreen(view, W, H, 0, 0);
    near(cx, 400 + 300);
    near(cy, 200);
  });

  it('zooms about the pointer: the point under it stays', () => {
    const view = { scale: 1, centre: [0, 0] as [number, number] };
    const before = toWorld(view, W, H, 800, 100);
    const zoomed = zoomAt(view, W, H, 800, 100, 2);
    expect(zoomed.scale).toBe(2);
    const after = toWorld(zoomed, W, H, 800, 100);
    near(after[0], before[0]);
    near(after[1], before[1]);
  });

  it("fits a tiny free part below the zoom's lower limit, and zooms out no further from there", () => {
    const bounds = { minE: -1000, minN: -1000, maxE: 1000, maxN: 1000 };
    // 2 km into 10 px: 0.005 px/m, half the lower limit.
    const tiny = fitView(bounds, 10, 10, { left: 0, right: 0, top: 0, bottom: 0 });
    expect(tiny.scale).toBeLessThan(SCALE_LIMITS.min);
    expect(zoomAt(tiny, 10, 10, 5, 5, 0.5).scale).toBe(tiny.scale);
    expect(zoomAt(tiny, 10, 10, 5, 5, 2).scale).toBeGreaterThan(tiny.scale);
  });

  it('keeps the zoom within its limits', () => {
    const view = { scale: 1, centre: [0, 0] as [number, number] };
    expect(zoomAt(view, W, H, 0, 0, 1000).scale).toBe(SCALE_LIMITS.max);
    expect(zoomAt(view, W, H, 0, 0, 0.0001).scale).toBe(SCALE_LIMITS.min);
  });

  it('moves the city with the pointer when dragged', () => {
    const view = { scale: 2, centre: [0, 0] as [number, number] };
    const moved = panBy(view, 40, -20);
    // What was at the middle is now 40 px right and 20 px up.
    const [x, y] = toScreen(moved, W, H, 0, 0);
    near(x, 540);
    near(y, 280);
  });

  it('centres a point in the free part', () => {
    const view = { scale: 1, centre: [0, 0] as [number, number] };
    const insets = { left: 400, right: 0, top: 0, bottom: 200 };
    const v = centreOn(view, W, H, insets, [250, -80], 3);
    const [x, y] = toScreen(v, W, H, 250, -80);
    near(x, 700);
    near(y, 200);
    expect(v.scale).toBe(3);
  });

  it('gives no bounds for no points, and room around some', () => {
    expect(boundsOf([], 10)).toBeNull();
    expect(boundsOf([[0, 0], [10, 20]], 5)).toEqual({ minE: -5, minN: -5, maxE: 15, maxN: 25 });
  });
});

describe('choosing a counter by its glow on the flat map', () => {
  const glows: Glow[] = [
    { id: 1, en: [0, 0], level: 'busy' },
    { id: 2, en: [40, 0], level: 'quiet' },
  ];

  it('gives the glow drawn on top: the busier where two overlap, else the nearer', () => {
    expect(glowAt(glows, 1, 1, 2, 0)?.id).toBe(1);
    expect(glowAt(glows, 25, 0, 2, 0)?.id).toBe(1);
    expect(glowAt(glows, 70, 0, 2, 0)?.id).toBe(2);
    expect(glowAt(glows, 0, 500, 2, 0)).toBeNull();
  });

  it('keeps a glow at least minPx across when zoomed out, and hits it there', () => {
    // At 0.1 px/m a busy 64 m glow would be 6 px; held at 14 px it reaches 140 m.
    expect(glowRadiusM('busy', 0.1, 14)).toBe(140);
    expect(glowRadiusM('busy', 2, 14)).toBe(ACTIVITY_RADII_M.busy);
    expect(glowAt(glows, 0, 130, 0.1, 14)?.id).toBe(1);
  });
});
