/*
 * Where the flat goes in a building: behind one side, on one floor.
 *
 * This first version (stage 3a of ProjectDoc/studio-room/PLAN.md) places it
 * and nothing more: the facade's middle on the middle of the longest wall
 * facing that way, the facade looking out of it, the floor at the floor's
 * height. Whether the flat actually FITS there — the wall long enough, the
 * building deep enough, nothing in the way — is stage 3b.
 */
import type { Massing } from '../../data/model';
import { facadesOf, floorAhdM } from '../facades';
import { FACADE_MID_Y, FACADE_OUT_X } from './apartmentLayout';

/** The sill height floorAhdM adds above a floor (facades.ts SILL_M). */
const SILL_M = 1.2;

export interface RoomPlacement {
  /** Where the flat's local origin lands, east/north metres. */
  originEN: [number, number];
  /** The flat's turn about the vertical, radians anticlockwise from east: local +x points this way. */
  angle: number;
  /** Floor level, metres AHD. */
  floorAhdM: number;
  /** The compass name of the side, for the hint. */
  side: string;
}

/** Local (x, y) of the flat to east/north. */
export function toEN(p: RoomPlacement, x: number, y: number): [number, number] {
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  return [p.originEN[0] + x * c - y * s, p.originEN[1] + x * s + y * c];
}

export function placeRoom(
  parts: Massing[],
  side: string,
  floor: number,
  floorsAboveGround: number | null,
): RoomPlacement | null {
  const sill = floorAhdM(parts, floor, floorsAboveGround);
  if (sill === null) return null;
  const facade = facadesOf(parts, sill).find((f) => f.compass.toLowerCase() === side.toLowerCase());
  if (!facade) return null;
  // the outward direction as an angle from east, anticlockwise (the bearing is from north, clockwise)
  const angle = Math.PI / 2 - (facade.bearingDeg * Math.PI) / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // local (FACADE_OUT_X, FACADE_MID_Y) sits on the wall's midpoint
  const [mx, my] = facade.midpointEN;
  const originEN: [number, number] = [mx - (FACADE_OUT_X * c - FACADE_MID_Y * s), my - (FACADE_OUT_X * s + FACADE_MID_Y * c)];
  return { originEN, angle, floorAhdM: sill - SILL_M, side: facade.compass };
}
