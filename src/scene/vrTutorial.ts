/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONTROLS, SHOWN BEFORE ANYTHING ELSE IN THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY IT EXISTS
 *   Most people who put this headset on have never held a VR controller.
 *   Without being told, nobody knows that the beam is how you point, that the
 *   trigger is the click, which stick walks, or that A and B move the sun —
 *   and from inside a headset there is no page to read it on.
 *
 * WHY EVERY TIME, NOT ONCE
 *   The headset is passed from one tester to the next, so "this device has seen it" says nothing about the person wearing
 *   it now. Skip is on every page for anybody who already knows.
 *
 * ONE THING PER PAGE
 *   Each page teaches one action, and its picture lights up only the part of
 *   the controller that action uses. The pictures carry no text at all — the
 *   names of the buttons are in the legend, in the panel's own font — so
 *   there is nothing in them to read wrongly.
 *
 * THE PICTURES
 *   Generated for this tutorial (ProjectDoc/vr-tutorial/), drawn as
 *   a current headset's two controllers, 960 x 640 WebP, about 230 KB for all
 *   seven. They are in public/ and fetched only when the panel draws them,
 *   so a desktop visitor never downloads them.
 *
 * Only data here; VrPanel draws it. Every string goes through the panel's
 * `plain`, so ASCII only.
 */

import { bundled } from '../data/bundled';

export type TutorialPage = {
  title: string;
  body: string;
  /** In public/, as `bundled` takes it. */
  image: string;
  /** Button name, and what it does here. */
  legend: [key: string, does: string][];
  /** A button to press with the beam, to learn the trigger by doing it. */
  practice?: true;
};

export const TUTORIAL: TutorialPage[] = [
  /*
   * Pressing comes first, on the first page. The first page itself asks to be
   * pressed — Next, or Skip — and people who had never held a controller did
   * not know how: a welcome page before the page about pressing was a page
   * they could not get past.
   */
  {
    title: 'Welcome to Live Melbourne',
    body: 'First, how to press a button: point the beam from either controller at it, then pull the trigger under your index finger. Try it below.',
    image: 'vr-tutorial/02-point-trigger.webp',
    legend: [['Trigger', 'Press what the beam is on (either hand)']],
    practice: true,
  },
  {
    title: 'Walk and turn',
    body: 'Push the left stick to walk; push it further to go faster. Push the right stick left or right to turn.',
    image: 'vr-tutorial/03-walk-turn.webp',
    legend: [
      ['Left stick', 'Walk'],
      ['Right stick', 'Turn left or right'],
    ],
  },
  {
    title: 'Move the sun',
    body: 'Hold A to move the time forward, B to move it back, and watch the shadows sweep across the street.',
    image: 'vr-tutorial/04-sun-ab.webp',
    legend: [
      ['A', 'Hold: later in the day'],
      ['B', 'Hold: earlier in the day'],
    ],
  },
  {
    title: 'Open or close the menu',
    body: 'Press X on the left controller to close the menu, and again to open it. A small map stays in the upper left.',
    image: 'vr-tutorial/05-menu-x.webp',
    legend: [
      ['X', 'Menu open or closed'],
      ['Right stick', 'Up or down: scroll a list'],
      ['Trigger, held', 'On the white bar under the menu: move it'],
    ],
  },
  {
    title: 'In the street',
    body: 'When a tram stops, point at its door and pull the trigger to get on. Do the same at a stop to get off.',
    image: 'vr-tutorial/06-tram-door.webp',
    legend: [['Trigger', 'On a tram door: get on or off']],
  },
  {
    title: 'Leaving VR',
    body: 'Choose Leave VR under More, or squeeze and hold a grip for a second. Either way you are asked first. Help shows these pages again.',
    image: 'vr-tutorial/07-grip-exit.webp',
    legend: [['Grip, held', 'Leave VR (asks first)']],
  },
];

/** The picture's URL from wherever this build is served (see bundled.ts). */
export const tutorialImage = (page: TutorialPage) => bundled(page.image);
