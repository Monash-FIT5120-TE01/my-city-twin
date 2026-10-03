/*
 * The How it works page, rendered to markup and read.
 *
 * WHAT THESE PIN DOWN
 *   - The design's words: the title, the three steps and their sentences.
 *   - Step 02 shows the moment the app is set to, not a fixed one.
 *   - The key names only colours the map draws — no "In progress" — and
 *     each swatch has its word beside it, so no entry is colour alone.
 *   - "Back to sunlight" is offered only when there is a place to go back to.
 *   - The map's credit and the sources are on the page.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HowItWorksPage } from './HowItWorksPage';

const noop = () => undefined;

function page(onBack?: () => void) {
  return renderToStaticMarkup(
    <HowItWorksPage
      dateText="21 June 2026"
      timeText="12:00 pm"
      season="Winter"
      reducedMotion
      onExplore={noop}
      onBack={onBack}
    />,
  );
}

describe('the How it works page', () => {
  it('carries the title and the three steps in order', () => {
    const html = page();
    expect(html).toContain('Your city, understood.');
    const steps = ['Find any building', 'Follow the sun', 'Compare the change'].map((step) =>
      html.indexOf(`how__step-title">${step}<`),
    );
    expect(steps.every((at) => at > 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('shows the moment the app is set to', () => {
    const html = page();
    for (const part of ['21 June 2026', '12:00 pm', 'Winter']) expect(html).toContain(`>${part}<`);
    expect(html).toContain('aria-label="Set to 21 June 2026, 12:00 pm, Winter"');
  });

  it('keys only the colours the map draws, each with its word', () => {
    const html = page();
    expect(html).not.toContain('In progress');
    for (const key of ['Existing', 'Approved', 'Searched building', 'Selected']) {
      expect(html).toMatch(new RegExp(`how__swatch[^"]*" aria-hidden="true"></span>${key}<`));
    }
  });

  it('describes the pictures, and credits the map they show', () => {
    const html = page();
    expect(html.match(/<img [^>]*alt="[^"]+"/g)).toHaveLength(4);
    expect(html).toContain('© Mapbox © OpenStreetMap');
    expect(html).toContain('Sources &amp; limitations');
  });

  it('offers "Back to sunlight" only when there is a place to go back to', () => {
    expect(page()).not.toContain('Back to sunlight');
    expect(page(noop)).toContain('Back to sunlight');
    expect(page()).toContain('Explore the city');
  });
});
