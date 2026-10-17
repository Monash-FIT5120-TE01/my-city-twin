/*
 * The sun's shadow map while the reader is in the flat (SunLight, SceneCanvas): centred on the flat and
 * narrowed, so the window frames, the balcony above and the furniture cast sharp shadows — about 2 cm a
 * pixel rather than half a metre.
 *
 * Across the map only the flat and what is near it are covered. Anything that shades the flat, however
 * far, lies on the line from the sun to the flat, and so is across the map from it too. Along the light
 * the map must still reach the whole city: the flat's distance from the city's middle plus the city's
 * radius (ProjectDoc/studio-room/PLAN.md 4.4). The bias is a couple of centimetres in that depth: at 80
 * or 120 m across, that is too little for the bigger pixels and the sofa came out striped (stage 4).
 */

/** Half-width across the map, metres (4096 pixels: about 2 cm each). */
export const ROOM_SHADOW_SPAN_M = 40;
/** How high above the floor the map is centred: the middle of the room's height. */
const CENTRE_UP_M = 1.5;

export interface RoomShadow {
  centre: [number, number, number];
  spanM: number;
  depthM: number;
  bias: number;
  normalBias: number;
}

/**
 * @param roomEN     the middle of the flat, east/north
 * @param floorAhdM  its floor
 * @param city       the sphere round the whole city that the ordinary shadow map covers
 */
export function roomShadowOf(
  roomEN: [number, number],
  floorAhdM: number,
  city: { centre: [number, number, number]; extentM: number },
): RoomShadow {
  const centre: [number, number, number] = [roomEN[0], roomEN[1], floorAhdM + CENTRE_UP_M];
  const depthM =
    Math.hypot(centre[0] - city.centre[0], centre[1] - city.centre[1], centre[2] - city.centre[2]) + city.extentM;
  // SunLight's frustum runs from the light's distance less 1.2 depths to its distance plus 1.2
  return { centre, spanM: ROOM_SHADOW_SPAN_M, depthM, bias: -0.02 / (depthM * 2.4), normalBias: 0.02 };
}
