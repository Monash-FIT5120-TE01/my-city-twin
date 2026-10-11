/*
 * ─────────────────────────────────────────────────────────────────────────
 * 72 FRAMES A SECOND IN THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A headset may run a session at 90 Hz or more, which leaves 11 ms to draw
 * each frame for both eyes. This city does not fit in that on a standalone
 * headset, and a frame that misses its slot is felt as lag. 72 Hz gives
 * 13.9 ms — a quarter more time for every frame — and is the rate such
 * headsets are designed around.
 *
 * Asked for once, when the session starts, and only if the device says it
 * can; a browser without the frame-rate part of WebXR keeps its own rate.
 */

const TARGET_HZ = 72;

type FrameRateSession = XRSession & {
  supportedFrameRates?: Float32Array | number[];
  updateTargetFrameRate?: (rate: number) => Promise<void>;
};

export function preferFrameRate(session: XRSession) {
  const s = session as FrameRateSession;
  const rates = s.supportedFrameRates ? Array.from(s.supportedFrameRates) : [];
  if (!s.updateTargetFrameRate || rates.length === 0) return;
  // 72 if offered; otherwise the lowest rate that is still smooth.
  const smooth = rates.filter((rate) => rate >= 60).sort((a, b) => a - b);
  const target = rates.includes(TARGET_HZ) ? TARGET_HZ : smooth[0];
  if (target === undefined) return;
  s.updateTargetFrameRate(target).catch((error: unknown) => console.warn('The headset kept its own frame rate:', error));
}
