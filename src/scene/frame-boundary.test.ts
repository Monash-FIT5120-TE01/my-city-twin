import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * One rule, checked mechanically: `enuToWorld` is for things OUTSIDE
 * <WorldFrame>, and only for those.
 *
 * Inside the frame, x/y/z already mean east/north/up, so converting again
 * scatters the object somewhere meaningless — and the rotations that go with
 * the conversion stand flat things on their edge. That is exactly what
 * happened twice: the street names ended up face-down under the road, and the
 * receptor ring stood vertically in the air. Both were written by copying a
 * component from the other side of the boundary, where the same lines are
 * correct.
 *
 * Reading the source is a blunt instrument, but the failure is invisible to
 * the type system — both sides are three numbers — and the two bugs it has
 * already caused took a person looking at the screen to notice.
 */

const scene = (name: string) => readFileSync(resolve(__dirname, name), 'utf-8');

/** Rendered within <WorldFrame>: coordinates are east/north/up as they are. */
const INSIDE = [
  'CityMassing.tsx',
  'Ground.tsx',
  'Roads.tsx',
  'OpenSpace.tsx',
  'ReceptorMarker.tsx',
  'DevelopmentMassings.tsx',
  'SunArrow.tsx',
  'SunLight.tsx',
];

/** Rendered as siblings of <WorldFrame>: these must convert. */
const OUTSIDE = ['SiteLabel.tsx', 'SitePin.tsx', 'StreetLabels.tsx'];

describe('the world-frame boundary', () => {
  it.each(INSIDE)('%s stays in east/north/up and does not convert', (file) => {
    const source = scene(file);
    // A mention in prose is fine; a call is not.
    expect(source).not.toMatch(/enuToWorld\s*\(/);
  });

  it.each(OUTSIDE)('%s converts, because it sits outside the frame', (file) => {
    expect(scene(file)).toMatch(/enuToWorld\s*\(/);
  });

  it('keeps the conversion itself in one place', () => {
    const frame = scene('frame.ts');
    expect(frame).toMatch(/export function enuToWorld/);
    // (east, north, up) -> (east, up, -north). If this ever changes, every
    // component on the outside changes with it.
    expect(frame).toMatch(/return \[east, up, -north\]/);
  });

  it('lays flat things flat without a rotation, inside the frame', () => {
    // Inside, +z is already up, so a ring or a plane needs no turning. The
    // -90° about X that a Y-up world wants is what stood the marker upright.
    expect(scene('ReceptorMarker.tsx')).not.toMatch(/rotation=/);
  });
});
