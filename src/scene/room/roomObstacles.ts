/*
 * What the walker bumps into inside the flat: its walls, the closed glass and
 * the balcony rail — the same obstacle index the street uses (obstacles.ts),
 * built from rectangles in the flat's own frame. Not the furniture: the user
 * asked to walk freely through it (2026-10-17).
 *
 * The rectangles come from the finished Blender scene, the same one the
 * model was exported from (ProjectDoc/studio-room/blender/export_collision.py),
 * so what stops the walker is what they see.
 */
import { indexObstacles, type ObstacleIndex } from '../obstacles';
import collision from './collision.json';
import { toEN, type RoomPlacement } from './roomPlacement';

type Box = [number, number, number, number];

/** Every solid's footprint, local metres: [x0, y0, x1, y1]. */
const BOXES = collision.walls as Box[];

/** The walker is indexed at waist height; anything in the list counts at that height. */
const WAIST_M = 0.5;

export function roomObstacles(p: RoomPlacement): ObstacleIndex {
  const parts = BOXES.map(([x0, y0, x1, y1]) => ({
    footprint: [[[toEN(p, x0, y0), toEN(p, x1, y0), toEN(p, x1, y1), toEN(p, x0, y1)]]],
    baseAhdM: p.floorAhdM,
    topAhdM: p.floorAhdM + 1.8,
    sinksToGround: false,
  }));
  return indexObstacles(parts, p.floorAhdM + WAIST_M);
}
