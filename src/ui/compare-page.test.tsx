/*
 * The comparison page (ComparePage), rendered to markup and read: what each
 * view is said to show, the way back, and the date offered as a season.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComparePage } from './ComparePage';

const noop = () => undefined;

const page = (date = { year: 2026, month: 6, day: 21 }) =>
  renderToStaticMarkup(
    <ComparePage
      title="123 Collins Street"
      kindLabel="Existing building"
      date={date}
      onDate={noop}
      minutes={12 * 60}
      onMinutes={noop}
      min={6 * 60}
      max={20 * 60}
      caption="Long south shadow"
      daylight={{ rise: 7 * 60 + 41, set: 17 * 60 + 4 }}
      onBack={noop}
      onChooseSpot={noop}
      onFrames={noop}
    />,
  );

describe('the comparison page', () => {
  it('names the place and what each view shows', () => {
    const html = page();
    expect(html).toContain('Compare sunlight');
    expect(html).toContain('123 Collins Street · Existing building');
    expect(html).toContain('What is here today');
    expect(html).toContain('Planned projects at full height');
    // "Today" draws no approved project at all, including those being built.
    expect(html).toContain('Approved and in-progress projects are not shown.');
  });

  it('has the way back, the way to another spot, and the sources', () => {
    const html = page();
    expect(html).toContain('Back to sunlight');
    expect(html).toContain('Choose another spot');
    expect(html).toContain('Sources &amp; limitations');
    expect(html).toContain('Views move together');
  });

  it('offers the date as one of the four seasons, keeping the day', () => {
    const html = page();
    expect(html).toContain('21 June 2026, Winter');
    expect(html).toContain('21 December 2026, Summer');
    expect(html).not.toContain('value="custom"');
  });

  it('offers a date that is not a preset as itself, so it can stay', () => {
    const html = page({ year: 2026, month: 10, day: 3 });
    expect(html).toContain('<option value="custom" selected="">3 October 2026</option>');
  });

  it('carries the hour rail without a second play button or key', () => {
    const html = page();
    expect(html).toContain('timebar--inline');
    expect(html).not.toContain('Play the day');
    expect(html.match(/Map key/g)).toHaveLength(1);
  });
});
