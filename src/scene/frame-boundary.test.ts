import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enuToWorld, worldToEnu } from './frame';

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
  'WindowMarker.tsx',
  'DevelopmentMassings.tsx',
  'SunArrow.tsx',
  'SunLight.tsx',
  'streetscape/Streetscape.tsx',
  'streetscape/kit.ts',
  'streetscape/surfaces.ts',
  'streetscape/trees.ts',
  'streetscape/street.ts',
  'streetscape/signals.ts',
  'streetscape/tram.ts',
  'streetscape/lights.ts',
  'streetscape/lod.ts',
  'streetscape/pedestrianAudio.ts',
  'streetscape/signalPlan.ts',
  'streetscape/trams/TramLayer.ts',
  'streetscape/trams/tramModel.ts',
  'streetscape/trams/tramSim.ts',
];

/**
 * Rendered as siblings of <WorldFrame>: these must convert.
 *
 * vrPlacement is the one where getting it wrong is hardest to notice. It
 * places the XR origin — the floor under a person in a headset — and the two
 * ways to break the rule put them underground or lying on their side, neither
 * of which any test or type can see, and both of which require somebody to
 * put the headset on before anybody finds out. VrWalk used to do the
 * converting itself; it now hands every placement to vrPlacement's
 * `originFor`, which is checked below so the conversion cannot be bypassed.
 */
const OUTSIDE = ['SiteMarker.tsx', 'StreetLabels.tsx', 'vrPlacement.ts'];

describe('the world-frame boundary', () => {
  it.each(INSIDE)('%s stays in east/north/up and does not convert', (file) => {
    const source = scene(file);
    // A mention in prose is fine; a call is not.
    expect(source).not.toMatch(/enuToWorld\s*\(/);
  });

  it.each(OUTSIDE)('%s converts, because it sits outside the frame', (file) => {
    expect(scene(file)).toMatch(/enuToWorld\s*\(/);
  });

  it('places the headset player only through vrPlacement', () => {
    expect(scene('VrWalk.tsx')).toMatch(/originFor\s*\(/);
  });

  it('converts back exactly what it converts out', () => {
    for (const enu of [
      [0, 0, 0],
      [12.5, -340, 29.5],
      [-702.6, 811, 371.1],
    ] as [number, number, number][]) {
      expect(worldToEnu(enuToWorld(enu))).toEqual(enu.map((v) => v + 0));
    }
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
