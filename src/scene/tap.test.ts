import { describe, expect, it } from 'vitest';
import { TAP_SLOP_PX, beginTap, trackTap, wasDragged } from './tap';

/*
 * The left button pans the camera AND picks things, and a pan ends with a
 * release over whatever it finished on — which the renderer reports as an
 * ordinary click. Every camera move was therefore also placing a measurement
 * point, or opening whichever building the drag happened to end over.
 *
 * These hold the line between the two.
 */

const at = (clientX: number, clientY: number) => ({ clientX, clientY });

/** A press, then any moves, then the release — as the handlers see it. */
const gesture = (
  from: { clientX: number; clientY: number },
  ...moves: { clientX: number; clientY: number }[]
) => {
  const held = beginTap(from);
  for (const move of moves) trackTap(held, move);
  return held;
};

describe('telling a click from the end of a drag', () => {
  it('counts a press and release at the same point as a click', () => {
    expect(wasDragged(gesture(at(400, 300)), at(400, 300))).toBe(false);
  });

  it('allows the hand to wobble', () => {
    // A mouse moves a pixel or two during a real click; a fingertip more.
    expect(wasDragged(gesture(at(400, 300), at(402, 301)), at(402, 301))).toBe(false);
    expect(wasDragged(gesture(at(400, 300), at(400, 304)), at(400, 304))).toBe(false);
  });

  it('rejects a drag of the camera', () => {
    expect(wasDragged(gesture(at(400, 300), at(460, 330)), at(460, 330))).toBe(true);
  });

  it('measures the distance, not either axis alone', () => {
    /*
     * 4 across and 4 down is 5.66 apart — over the threshold — while either
     * on its own is under it. Comparing the axes separately would let a
     * diagonal drag of any length through as long as it stayed shallow.
     */
    expect(wasDragged(gesture(at(0, 0), at(4, 0)), at(4, 0))).toBe(false);
    expect(wasDragged(gesture(at(0, 0), at(0, 4)), at(0, 4))).toBe(false);
    expect(wasDragged(gesture(at(0, 0), at(4, 4)), at(4, 4))).toBe(true);
  });

  it('is exclusive at the threshold, so exactly the slop still clicks', () => {
    expect(wasDragged(gesture(at(0, 0), at(TAP_SLOP_PX, 0)), at(TAP_SLOP_PX, 0))).toBe(false);
    expect(
      wasDragged(gesture(at(0, 0), at(TAP_SLOP_PX + 1, 0)), at(TAP_SLOP_PX + 1, 0)),
    ).toBe(true);
  });

  it('treats a release with no press of its own as a drag', () => {
    /*
     * The press happened somewhere else and the release landed here — most
     * often a drag that began on a panel and finished over the city. By no
     * reading is that a click on this object, and the old code had no way to
     * tell it from one.
     */
    expect(wasDragged(null, at(400, 300))).toBe(true);
  });

  it('does not care how long the button was held', () => {
    // Duration is not a parameter, and deliberately so: a careful click can
    // be slow, and a flick of the camera can be fast.
    expect(wasDragged(gesture(at(10, 10)), at(10, 10))).toBe(false);
  });

  it('remembers a drag that wandered back to where it started', () => {
    /*
     * THE ONE THE FIRST VERSION GOT WRONG.
     *
     * Comparing only the ends asks "did the pointer finish somewhere else",
     * which is not the question. Pan a hundred pixels across the city, bring
     * the pointer back to the pixel it started on, and release: the
     * displacement is zero and the camera moved the whole time.
     */
    const held = gesture(at(400, 300), at(500, 300), at(460, 340), at(400, 300));
    expect(wasDragged(held, at(400, 300))).toBe(true);
  });

  it('latches: one stray step makes the whole gesture a drag', () => {
    const held = gesture(at(0, 0), at(40, 0));
    expect(held.strayed).toBe(true);
    // Every later move is within the slop of the ORIGIN, and it stays a drag.
    trackTap(held, at(1, 1));
    expect(wasDragged(held, at(1, 1))).toBe(true);
  });

  it('still catches a release far away with no moves in between', () => {
    // A pointer captured elsewhere for the duration reports no moves here.
    expect(wasDragged(gesture(at(0, 0)), at(200, 120))).toBe(true);
  });

  it('ignores moves on a gesture that was never begun', () => {
    expect(trackTap(null, at(5, 5))).toBe(null);
  });
});
