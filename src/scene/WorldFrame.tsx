import type { ReactNode } from 'react';
import { WORLD_FRAME_ROTATION } from './frame';

/**
 * The single bridge between the east/north/up data frame and three.js's Y-up
 * world. Everything with a position goes inside — buildings, ground, and the
 * sun light, so that the light direction is expressed in the same frame as
 * the geometry it falls on.
 *
 * See frame.ts for why this exists exactly once.
 */
export function WorldFrame({ children }: { children: ReactNode }) {
  return <group rotation={WORLD_FRAME_ROTATION}>{children}</group>;
}
