/*
 * The sunlight screen's panel, its time bar and the header it sits under,
 * rendered to markup and read.
 *
 * WHAT THESE PIN DOWN
 *   - The panel's controls report their state in markup a screen reader
 *     reads and that is not colour alone: the chosen season is
 *     aria-pressed and the neighbourhood view is a checked radio; the
 *     compare button is a way on to the side-by-side screen.
 *   - What stays on the screen after the redesign: "Details" (what the
 *     Overview tab was), "Choose a spot", "How it works", and the sources
 *     link for a phone, where the strip under the map is hidden.
 *   - The time bar's 12-hour marks, the hour under the handle, and that the
 *     play button names what it will do.
 *   - The header keeps "Map layers" everywhere but the front page — the
 *     sunlight screen is the only place shadows are switched off.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SunlightSheet, TimeBar } from './screens';
import { Header } from './chrome';

const noop = () => undefined;

function sheet(overrides: Partial<Parameters<typeof SunlightSheet>[0]> = {}) {
  return renderToStaticMarkup(
    <SunlightSheet
      title="582-606 Collins Street"
      locality="Melbourne, 3000"
      meta="Office · 172 m"
      date={{ year: 2026, month: 6, day: 21 }}
      onDate={noop}
      nowNote={null}
      dateLabel="21 June"
      measured={null}
      onClearPoint={noop}
      onStand={noop}
      choosing={false}
      onChoose={noop}
      onCancelChoose={noop}
      afterPlans
      onAfterPlans={noop}
      onCompare={noop}
      onDetails={noop}
      onBack={noop}
      {...overrides}
    />,
  );
}

describe('the sunlight panel', () => {
  it('marks the season the date falls on, and only that one', () => {
    const html = sheet();
    expect(html.match(/aria-pressed="true"[^>]*>Winter</)).not.toBeNull();
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it('marks no season for a date that is not one of the four', () => {
    expect(sheet({ date: { year: 2026, month: 10, day: 3 } })).not.toContain('aria-pressed="true"');
  });

  it('checks the radio for the neighbourhood view on the map', () => {
    const after = sheet({ afterPlans: true });
    expect(after).toMatch(/checked=""[^>]*\/>After planned projects are built/);
    const today = sheet({ afterPlans: false });
    expect(today).toMatch(/checked=""[^>]*\/>Today/);
  });

  it('offers the side-by-side comparison as a way on, not a switch', () => {
    const html = sheet();
    expect(html).toContain('Compare side by side');
    // A link to another screen, not a toggle: nothing to be pressed or not.
    expect(html).not.toMatch(/aria-pressed="[^"]*"[^>]*>Compare/);
  });

  it('offers "Show this building" for a standing building only', () => {
    expect(sheet()).not.toContain('Show this building');
    const building = sheet({
      subjectKind: 'building',
      subjectShown: { shown: true, onShown: noop },
    });
    expect(building).toContain('Show this building');
  });

  it('keeps Details, Choose a spot, How it works and a way to the sources', () => {
    const html = sheet();
    expect(html).toContain('>Details<');
    expect(html).toContain('Choose a spot');
    expect(html).toContain('How it works');
    expect(html).toContain('Sources &amp; limitations');
    // The tabs and the "Start over" cross are gone from this screen.
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('Start over');
  });
});

describe('the time bar', () => {
  const bar = (minutes: number, playing = false) =>
    renderToStaticMarkup(
      <TimeBar
        minutes={minutes}
        onChange={noop}
        min={6 * 60}
        max={20 * 60}
        caption="Long south shadow"
        daylight={{ rise: 7 * 60 + 41, set: 17 * 60 + 4 }}
        playing={playing}
        onPlay={noop}
      />,
    );

  it('marks the day every four hours in 12-hour time, with the hour under the handle', () => {
    const html = bar(14 * 60);
    for (const mark of ['8:00 am', '12:00 pm', '4:00 pm', '8:00 pm']) expect(html).toContain(mark);
    expect(html).toMatch(/class="timebar__now"[^>]*>2:00 pm</);
  });

  it('leaves out a mark the hour would print over', () => {
    const html = bar(12 * 60);
    expect(html.match(/timebar__tick[^>]*>12:00 pm</)).toBeNull();
    expect(html).toMatch(/class="timebar__now"[^>]*>12:00 pm</);
  });

  it('reads the hour and the shadow to a screen reader', () => {
    expect(bar(15 * 60)).toContain('aria-valuetext="3:00 pm, Long south shadow"');
  });

  it('names what the play button will do', () => {
    expect(bar(9 * 60, false)).toMatch(/aria-pressed="false" aria-label="Play the day"/);
    expect(bar(9 * 60, true)).toMatch(/aria-pressed="true" aria-label="Pause the day"/);
  });

  it('gives sunrise and sunset in the same 12-hour time', () => {
    const html = bar(9 * 60);
    expect(html).toContain('7:41 am');
    expect(html).toContain('5:04 pm');
  });
});

describe('the header', () => {
  const header = (props: { front?: boolean; hideLayers?: boolean }) =>
    renderToStaticMarkup(
      <Header
        query=""
        onQuery={noop}
        layersOpen={false}
        layersHidden={0}
        onLayers={noop}
        onHome={noop}
        nav={<button type="button">Future plans</button>}
        {...props}
      />,
    );

  it('keeps "Map layers" on the sunlight screen and drops it only on the front page', () => {
    expect(header({ front: true })).toContain('Map layers');
    expect(header({ front: true, hideLayers: true })).not.toContain('Map layers');
  });

  it('takes the page look and the links when asked', () => {
    const html = header({ front: true });
    expect(html).toContain('header--front');
    expect(html).toContain('Future plans');
  });
});
