/*
 * The sections under the front page (LandingMore) and the shared sources /
 * map key (Sources), rendered to markup and read.
 *
 * WHAT THESE PIN DOWN
 *   - The three figures say exactly what their sources say — the 26% is NOT
 *     labelled as the Hoddle Grid's, the 40% reads as a target — and each
 *     links to the page of the PDF it was read from.
 *   - Every drawing and film the page asks for exists in public/, so a
 *     renamed or missing file fails here rather than as a broken image on
 *     the site.
 *   - The page's structure: h2 sections under the first screen's h1, the
 *     sources folded under the numbers.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingMore } from './LandingMore';
import { SourcesLink } from './Sources';
import { MapKey } from './kit/MapKey';

const markup = renderToStaticMarkup(<LandingMore onExplore={() => undefined} />);
/** The sections alone, without the foot of the page (its fine print opens Sources & limitations, links and all). */
const sections = markup.slice(0, markup.indexOf('<footer'));
/** The markup as plain words, for reading sentences across tags. */
const words = markup
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;|&#39;/g, '’')
  .replace(/\s+/g, ' ');

const TRANSPORT =
  'https://www.melbourne.vic.gov.au/media-files/2024-05/transport-strategy-2030-city-of-melbourne.pdf#page=21';
const URBAN_FOREST =
  'https://www.melbourne.vic.gov.au/media-files/2024-07/urban-forest-strategy.pdf#page=7';

describe('the city in three numbers', () => {
  it('states each figure as its source states it', () => {
    expect(words).toContain('89% of trips within the Hoddle Grid are made on foot.');
    expect(words).toContain('26% of street space is allocated to footpaths.');
    expect(words).toContain('40% canopy cover of public streets and parks by 2040, up from 22%.');
  });

  it('does not label the street-space figure as the Hoddle Grid’s', () => {
    // The source's body text gives 26% for the whole municipality.
    expect(words).not.toMatch(/26%[^.]*Hoddle Grid/);
    expect(words).toContain('Street space: across the municipality.');
  });

  it('links each source to the page of the PDF the figure is on', () => {
    expect(markup).toContain(`href="${TRANSPORT}"`);
    expect(markup).toContain(`href="${URBAN_FOREST}"`);
    expect(words).toContain('Transport Strategy 2030 (2019), p. 39');
    expect(words).toContain('Urban Forest Strategy 2012–2032, p. 7');
  });

  it('opens the sources in a new tab and says so to a screen reader', () => {
    const links = sections.match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBe(2);
    for (const link of links) {
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noreferrer noopener"');
    }
    expect(sections.match(/\(PDF, opens in a new tab\)/g)).toHaveLength(2);
  });
});

describe('the sections under the first screen', () => {
  it('gives every section an h2, and never a second h1', () => {
    expect(markup).not.toContain('<h1');
    expect(sections.match(/<h2 /g)).toHaveLength(3);
  });

  it('folds the sources under the numbers, one press away', () => {
    expect(markup).toMatch(/<details class="more__source-details"><summary>Sources &amp; scope<\/summary>/);
  });

  it('acknowledges the Traditional Owners by name', () => {
    expect(words).toContain('Wurundjeri Woi-wurrung and Bunurong Boon Wurrung peoples');
    expect(words).toContain('Eastern Kulin Nation');
  });

  it('asks only for drawings and films that exist in public/', () => {
    const asked = [...markup.matchAll(/(?:src|poster)="[^"]*?(landing\/[^"]+)"/g)].map((m) => m[1]);
    // The city film and its poster, and the three marks.
    expect(asked).toHaveLength(5);
    for (const path of asked) {
      expect(existsSync(resolve(__dirname, '../../public', path)), path).toBe(true);
    }
  });

  it('keeps the drawings out of the reading order', () => {
    for (const img of markup.match(/<img [^>]*>/g) ?? []) expect(img).toContain('alt=""');
  });
});

describe('the shared sources and key', () => {
  it('names every colour of the map key in words', () => {
    const key = renderToStaticMarkup(<MapKey />);
    // Projects under construction are drawn apart from approved ones (palette.ts).
    for (const word of ['Existing', 'Approved', 'In progress']) {
      expect(key).toMatch(new RegExp(`aria-hidden="true"></span>${word}<`));
    }
  });

  it('cites the walking figure at its PDF page, not the strategy’s home page', () => {
    const sources = renderToStaticMarkup(<SourcesLink />);
    expect(sources).toContain(TRANSPORT);
    expect(sources).not.toContain('href="https://www.melbourne.vic.gov.au/transport-strategy-2030"');
  });
});
