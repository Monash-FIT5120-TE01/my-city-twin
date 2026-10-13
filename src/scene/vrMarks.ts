/*
 * Notes the headset's scene leaves for the ?vrdebug log (src/vrDebug.ts).
 *
 * The log is loaded only with ?vrdebug, and lazily; the scene must not
 * import it. So the scene writes here, and the log listens when it is on.
 * With nobody listening, `vrMarksOn()` is false and nothing is measured.
 */

type Listener = (text: string) => void;
let listener: Listener | null = null;

export function vrMarksOn(): boolean {
  return listener !== null;
}

export function vrMark(text: string) {
  listener?.(text);
}

export function listenVrMarks(fn: Listener) {
  listener = fn;
}
