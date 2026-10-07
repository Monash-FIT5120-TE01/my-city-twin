/*
 * The shared pieces (src/ui/kit), rendered to markup and read.
 *
 * WHAT THESE PIN DOWN
 *   - A Button's kind and size come out as the classes kit.css draws, and
 *     `arrow` adds the one forward arrow — the same drawing as a TextButton's.
 *   - A BackLink and a CloseButton say where they go in words a screen
 *     reader reads: the visible label, or aria-label for the bare cross.
 *   - A reference TextButton has no arrow; an action one does, unless told.
 *   - The map key names every colour in words, and the full key adds the two
 *     states of a chosen building, the selected one drawn as a ring.
 *   - The demo note carries the same words, separator and sources link
 *     everywhere.
 *   - The search field shows the "/" key while empty and a named cross once
 *     something is typed, never both; a row and the results go where the
 *     header and the front page expect them.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './Button';
import { BackLink } from './BackLink';
import { CloseButton } from './CloseButton';
import { TextButton } from './TextButton';
import { MapKey } from './MapKey';
import { DemoNote } from './DemoNote';
import { Card } from './Card';
import { Pill } from './Pill';
import { SearchField } from './SearchField';

const noop = () => undefined;
const ARROW = 'M0 5h15M11 1l4 4-4 4';

describe('Button', () => {
  it('is a primary, medium button by default, of type button', () => {
    const html = renderToStaticMarkup(<Button>Done</Button>);
    expect(html).toBe('<button type="button" class="button">Done</button>');
  });

  it('carries its kind, size and width as classes', () => {
    const html = renderToStaticMarkup(
      <Button variant="mint" size="lg" block className="extra">
        Choose a spot
      </Button>,
    );
    expect(html).toContain('class="button button--mint button--lg button--block extra"');
  });

  it('adds the forward arrow after the words when asked', () => {
    const html = renderToStaticMarkup(<Button arrow>Explore the city</Button>);
    expect(html.indexOf('Explore the city')).toBeLessThan(html.indexOf(ARROW));
    expect(renderToStaticMarkup(<Button>Explore the city</Button>)).not.toContain(ARROW);
  });
});

describe('the back link and the close button', () => {
  it('names where the back link goes in its own words', () => {
    const html = renderToStaticMarkup(<BackLink onClick={noop}>Back to sunlight</BackLink>);
    expect(html).toContain('class="back-link"');
    expect(html).toContain('<span>Back to sunlight</span>');
  });

  it('gives the bare cross a name', () => {
    const html = renderToStaticMarkup(<CloseButton label="Clear the search" onClick={noop} />);
    expect(html).toContain('aria-label="Clear the search"');
    expect(html).toContain('class="close-button"');
  });
});

describe('TextButton', () => {
  it('has the arrow as an action and not as a reference', () => {
    expect(renderToStaticMarkup(<TextButton>Explore sunlight</TextButton>)).toContain(ARROW);
    const reference = renderToStaticMarkup(<TextButton variant="reference">Details</TextButton>);
    expect(reference).not.toContain(ARROW);
    expect(reference).toContain('text-button--reference');
  });
});

describe('MapKey', () => {
  it('names the three building colours in words', () => {
    const html = renderToStaticMarkup(<MapKey />);
    for (const word of ['Existing', 'Approved', 'In progress']) {
      expect(html).toMatch(new RegExp(`aria-hidden="true"></span>${word}<`));
    }
    expect(html).not.toContain('Selected');
  });

  it('adds the searched and selected states, the selected one as a ring', () => {
    const html = renderToStaticMarkup(<MapKey full title="Read the map legend" note="A note." />);
    expect(html).toContain('Searched building');
    expect(html).toContain('swatch--selected');
    expect(html).toContain('aria-label="Read the map legend"');
    expect(html).toContain('A note.');
  });
});

describe('DemoNote, Card and Pill', () => {
  it('says the same words with the sources link', () => {
    const html = renderToStaticMarkup(<DemoNote />);
    expect(html).toContain('Illustrative model · Demo data');
    expect(html).toContain('Sources &amp; limitations');
    expect(html).toContain('class="demo-note__sep" aria-hidden="true"');
  });

  it('draws a card and a pill with their shared classes', () => {
    expect(renderToStaticMarkup(<Card as="li" raised>x</Card>)).toBe('<li class="card card--raised">x</li>');
    expect(renderToStaticMarkup(<Pill size="xs">Today</Pill>)).toBe('<span class="pill pill--xs">Today</span>');
  });
});

describe('SearchField', () => {
  it('shows the "/" key while empty, and a named cross once something is typed', () => {
    const empty = renderToStaticMarkup(<SearchField value="" onChange={noop} onClear={noop} shortcut />);
    expect(empty).toContain('class="search__key"');
    expect(empty).not.toContain('Clear the search');
    const typed = renderToStaticMarkup(<SearchField value="Collins" onChange={noop} onClear={noop} shortcut />);
    expect(typed).toContain('aria-label="Clear the search"');
    expect(typed).not.toContain('search__key');
  });

  it('keeps the field findable by the "/" key, at its size', () => {
    const html = renderToStaticMarkup(<SearchField value="" onChange={noop} size="lg" />);
    expect(html).toContain('data-search-field');
    expect(html).toContain('class="search search--lg"');
  });

  it('puts a row inside the box and the results after it', () => {
    const html = renderToStaticMarkup(
      <SearchField value="" onChange={noop} dropdown={<div className="results">r</div>}>
        <div className="row">chosen</div>
      </SearchField>,
    );
    expect(html.indexOf('class="row"')).toBeLessThan(html.indexOf('class="results"'));
    // The row is inside the box; the results are outside it.
    expect(html).toMatch(/search__box">.*class="row">chosen<\/div><\/div><div class="results"/);
  });
});
