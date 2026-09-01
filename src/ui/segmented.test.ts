import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEASONS } from '../scene/solar';

/*
 * The segmented controls must not change size when the selection moves.
 *
 * The selected segment is set in a heavier weight, and bold text is wider
 * than regular text of the same length — so "Spring" fitted its column until
 * it was chosen, and then it did not. The four season names are all six
 * letters, which is why this looked like a font-size problem rather than a
 * weight problem.
 *
 * The fix is a hidden copy of the label rendered at the bold weight, which
 * reserves the width in every state. These tests hold both halves of that in
 * place: the CSS that measures the copy, and the attribute that supplies it.
 */

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');
const css = read('../styles/ui.css');
const screens = read('./screens.tsx');

describe('segmented controls', () => {
  it('reserves each label at the weight the selected state uses', () => {
    const rule = css.slice(
      css.indexOf('.segmented button::before'),
      css.indexOf('.segmented button[aria-pressed'),
    );
    expect(rule).toMatch(/content:\s*attr\(data-label\)/);
    // Collapsed to nothing vertically: it must contribute width only.
    expect(rule).toMatch(/height:\s*0/);
    expect(rule).toMatch(/visibility:\s*hidden/);

    const selected = css.slice(css.indexOf(".segmented button[aria-pressed='true']"));
    const weight = selected.match(/font-weight:\s*(\d+)/)?.[1];
    expect(rule).toMatch(new RegExp(`font-weight:\\s*${weight}`));
  });

  it('gives every segment the attribute the reservation reads', () => {
    // Four seasons plus the two-way city toggle.
    const labels = [...screens.matchAll(/data-label=(?:"([^"]+)"|\{([^}]+)\})/g)];
    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(screens).toMatch(/data-label="Existing City"/);
    expect(screens).toMatch(/data-label="Approved Plan"/);
    expect(screens).toMatch(/data-label=\{option\.label\}/);
  });

  it('keeps the season names on one line', () => {
    expect(css.slice(css.indexOf('.segmented button {'))).toMatch(/white-space:\s*nowrap/);
    for (const season of SEASONS) {
      expect(season.label).not.toMatch(/\s/);
    }
  });

  it('holds the simulation date to a single row whatever month it is', () => {
    // "21 September" is four characters longer than "21 June"; wrapped, it
    // added a line and the panel grew.
    const rule = css.slice(css.indexOf('.datebox__head {'), css.indexOf('.datebox__head b'));
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/min-height:/);
  });
});
