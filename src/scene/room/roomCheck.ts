/*
 * DEVELOPMENT ONLY: ?roomcheck=<floor>,<side> with &bldg=<id> on the sunlight
 * screen. Puts the flat in that building and holds the camera still in the
 * living room, looking out, so the view, the cut and the shadows can be
 * screenshotted. Nothing else reads it.
 *
 * Only the inside is checked: the flat is shown only while the reader is in
 * it, never from the city above (decided 2026-10-17).
 */
export interface RoomCheck {
  floor: number;
  side: string;
}

function parseRoomCheck(search: string): RoomCheck | null {
  const raw = new URLSearchParams(search).get('roomcheck');
  if (!raw) return null;
  const [f, side] = raw.split(',');
  const floor = Number(f);
  if (!Number.isInteger(floor) || floor < 1 || !side) return null;
  return { floor, side };
}

/*
 * Read once, when this module loads: the app rewrites the address bar to its
 * own state soon after it starts (urlState.ts), and by the time the city has
 * loaded and this is asked, the parameter is gone.
 */
const ROOM_CHECK = typeof window === 'undefined' ? null : parseRoomCheck(window.location.search);

export function readRoomCheck(): RoomCheck | null {
  return ROOM_CHECK;
}

