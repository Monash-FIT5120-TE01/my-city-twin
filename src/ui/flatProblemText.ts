/*
 * Why the example flat cannot be stood in behind this side, on this floor — in words, for the sunlight
 * panel and the building card alike (ProjectDoc/studio-room/PLAN.md 3.7). One sentence each, saying what
 * is in the way rather than that something failed.
 */
import type { RoomProblem } from '../scene/room/roomPlacement';

const TEXT: Record<RoomProblem, string> = {
  'no-such-floor': 'This building does not reach that floor as it is modelled.',
  'no-such-side': 'This building has no wall facing that way at this floor.',
  'wall-too-short': 'This side is too narrow at this floor to fit the flat behind it.',
  'building-too-shallow': 'The building is too shallow here to fit the flat behind this side.',
  'window-moved': 'The window had to be measured away from this wall, so the flat would not match the figure.',
  'ceiling-too-low': 'The floors here are too low for this flat.',
  'above-the-roof': 'The flat would stick out of the roof here.',
  'next-building-in-the-way': 'Another building stands where the flat would be.',
  'balcony-in-the-way': 'There is no room for the balcony on this side at this floor.',
  'outlook-blocked': 'A wall stands a few metres past the balcony here, so there would be nothing to look out at.',
  'below-the-street': 'This floor is below the street on this side: the ground is higher here.',
};

export function flatProblemText(problem: RoomProblem): string {
  return TEXT[problem];
}
