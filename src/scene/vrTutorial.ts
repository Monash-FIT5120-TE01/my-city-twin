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
 *   At the reader's request. The headset is passed from one tester to the
 *   next, so "this device has seen it" says nothing about the person wearing
 *   it now. Skip is on every page for anybody who already knows.
 *
 * ONE THING PER PAGE
 *   Each page teaches one action, and its picture lights up only the part of
 *   the controller that action uses. The pictures carry no text at all — the
 *   names of the buttons are in the legend, in the panel's own font — so
 *   there is nothing in them to read wrongly.
 *
 * THE PICTURES
 *   Generated for this tutorial (ProjectDoc/vr-tutorial/), drawn as Meta
 *   Quest 3 Touch Plus controllers, 960 x 640 WebP, about 230 KB for all
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
  {
    title: 'Welcome to VR',
    body: 'A quick look at your controllers first. It takes about a minute. Already know them? Press Skip.',
    image: 'vr-tutorial/01-welcome.webp',
    legend: [],
  },
  {
    title: 'Point and press',
    body: 'A beam comes out of each controller. Point it at a button, then pull the trigger under your index finger.',
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
    title: 'Show or hide this panel',
    body: 'Press X on the left controller to put this panel away, and again to bring it back.',
    image: 'vr-tutorial/05-menu-x.webp',
    legend: [
      ['X', 'Panel away or back'],
      ['Right stick', 'Up or down: next page of a list'],
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
    body: 'Squeeze and hold a grip for one second to leave VR. Either hand works. Controls, at the top of this panel, shows these pages again.',
    image: 'vr-tutorial/07-grip-exit.webp',
    legend: [['Grip, held', 'Leave VR']],
  },
];

/** The picture's URL from wherever this build is served (see bundled.ts). */
export const tutorialImage = (page: TutorialPage) => bundled(page.image);
