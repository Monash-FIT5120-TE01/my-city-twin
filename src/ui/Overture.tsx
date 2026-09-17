/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE WAY IN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   A still page over the whole app, shown before anything else: white, then
 *   a short film of the city, then the words. One button leaves it and the
 *   model is underneath, already loaded.
 *
 * WHY IT IS A COVER AND NOT A SCREEN
 *   It is drawn OVER the existing app rather than replacing its landing
 *   screen, and it is dismissed rather than navigated away from. Two reasons.
 *
 *   The city takes a few seconds to build — 4,443 roof planes, a five
 *   megabyte snapshot — and that has always happened behind a loading bar
 *   somebody has to watch. Behind this it happens while they are reading.
 *
 *   And the address bar carries the whole state of this app: `?view=sunlight
 *   &dev=X0015700&d=2026-06-21&t=900` is somebody saying "look at this, at
 *   this hour". Putting a front door in front of that would break every link
 *   ever shared. So a URL that states anything skips this entirely — see the
 *   condition in App.
 *
 * WHAT PLAYS
 *   A 0.34 MB film, muted and inline, which is what browsers require before
 *   they will start one without being asked. Under a reduced-motion
 *   preference it does not play at all: the poster frame stands in, and the
 *   words are simply there rather than arriving.
 *
 * HOW IT LEAVES
 *   Not all at once. The press does two separate things, and the gap between
 *   them is the whole effect:
 *
 *     `onEnter`  fires immediately — the city behind begins its descent while
 *                the cover is still on screen. By the time anything of it can
 *                be seen it is already moving.
 *     `onGone`   fires when the cover has finished fading — only then is it
 *                taken off the page.
 *
 *   One callback could not do both. Unmounting on the press is the cut this
 *   was written to remove; waiting to start the camera until after the fade
 *   gives a still frame followed by a lurch. They have to overlap.
 */

import { useEffect, useRef, useState } from 'react';
import { bundled } from '../data/bundled';

/**
 * How long the cover takes to go, milliseconds.
 *
 * Shorter than the camera's descent on purpose: the curtain is out of the way
 * while the city is still settling, so the last thing seen is the city
 * arriving rather than the cover departing.
 *
 * Kept in step with the transition on `.overture--leaving` by hand. A
 * `transitionend` listener would read the real figure, but it does not fire
 * for a cover the compositor decided not to animate, and a door that
 * sometimes never opens is worse than one number written twice.
 */
const LEAVE_MS = 620;

export function Overture({
  onEnter,
  onGone,
  reducedMotion,
}: {
  /** The press. Called at once, so the city can start moving under the cover. */
  onEnter: () => void;
  /** The cover has finished leaving and can be taken off the page. */
  onGone: () => void;
  /** Somebody has asked their system for less movement. */
  reducedMotion: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  /*
   * The film is hidden until it is actually running.
   *
   * A video element paints before its first frame is decoded, and what it
   * paints is white — a flash of it, over a warm ground, at the exact moment
   * the page is supposed to be arriving quietly. Waiting for `playing` means
   * the first thing ever drawn is a frame of the film.
   */
  const [rolling, setRolling] = useState(reducedMotion);
  /*
   * The white moment, then everything.
   *
   * A frame of plain white before anything arrives is the point of it: the
   * page has to be empty first for the film to be an entrance rather than
   * just the top of a page. Under reduced motion there is no white moment,
   * because there is nothing for it to introduce.
   */
  const [shown, setShown] = useState(reducedMotion);
  /** The press has happened and the cover is on its way out. */
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setShown(true), 220);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  /*
   * Once. A second press during the fade would start a second timer, and the
   * cover would be taken off the page twice — the first while the descent it
   * asked for was still under way.
   */
  const going = useRef(false);

  /*
   * The callback, held where the timer can reach the current one without
   * being restarted by it.
   *
   * App writes `onGone={() => setOverture(false)}` inline, so its identity
   * changes on every render — and App re-renders on every tick of the
   * download progress. With `onGone` in the effect's dependencies, each of
   * those ticks cleared the pending timeout and started a new 620 ms one.
   * Progress arriving faster than that pushed the dismissal back
   * indefinitely: the cover had finished fading, the city was visible
   * through it, and it simply stayed there.
   *
   * A ref is the fix rather than asking App to memoise, because a component
   * that breaks when its parent writes an ordinary inline callback is a
   * component with a trap in it.
   */
  const gone = useRef(onGone);
  useEffect(() => {
    gone.current = onGone;
  });

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => gone.current(), LEAVE_MS);
    return () => window.clearTimeout(timer);
    // `leaving` alone, and it only ever goes false to true once. The timer
    // must be started by the press and by nothing else.
  }, [leaving]);

  const enter = () => {
    if (going.current) return;
    going.current = true;

    // The city starts moving now, not when the cover is gone.
    onEnter();

    // Nothing to watch under reduced motion, so nothing to wait for either.
    if (reducedMotion) onGone();
    else setLeaving(true);
  };

  useEffect(() => {
    if (!reducedMotion || !video.current) return;
    // Held on its first frame rather than removed: the composition is built
    // around it, and an empty space where the city was is worse than a still.
    video.current.pause();
  }, [reducedMotion]);

  return (
    <section
      className={`overture${shown ? ' overture--shown' : ''}${leaving ? ' overture--leaving' : ''}`}
      aria-label="Melbourne"
      // Out of the way the instant it starts leaving, so a click meant for
      // the city it is fading to reveal is not eaten by a dying cover.
      inert={leaving || undefined}
    >
      <div className="overture__marks">
        <p className="overture__mark">37°48&apos; S&ensp;144°58&apos; E</p>
        <p className="overture__mark">A portrait of place / 001</p>
      </div>

      <div className="overture__film">
        <video
          ref={video}
          className={rolling ? 'is-rolling' : undefined}
          src={bundled('landing-animation.mp4')}
          autoPlay={!reducedMotion}
          muted
          playsInline
          preload="auto"
          onPlaying={() => setRolling(true)}
          // Decorative: the words below say everything it says.
          aria-hidden="true"
        />
      </div>

      <div className="overture__words">
        <h1 className="overture__title">Melbourne</h1>

        <div className="overture__foot">
          <p className="overture__blurb">
            A city of quiet corners, bold ideas and life by the river.
            <br />
            Take your time. Let Melbourne unfold.
          </p>

          <button type="button" className="overture__enter" onClick={enter}>
            Explore Melbourne
            <svg width="17" height="10" viewBox="0 0 17 10" aria-hidden="true">
              <path
                d="M0 5h15M11 1l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <p className="overture__mark overture__mark--footer">
          Melbourne, Victoria — Australia
        </p>
      </div>
    </section>
  );
}
