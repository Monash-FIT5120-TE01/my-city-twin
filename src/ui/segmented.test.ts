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
const tokens = read('../styles/tokens.css');
const screens = read('./screens.tsx');

/**
 * A weight as a number, whether it is written as one or as a token.
 *
 * The stylesheet says `font-weight: var(--weight-title)` now, and the point
 * of this test is a comparison between weights — so it has to be able to
 * resolve one. Anything it cannot resolve comes back as 0, which can never
 * be the heaviest and so can never hide a regression.
 */
const weight = (value: string): number => {
  const literal = value.match(/^\s*(\d+)/);
  if (literal) return Number(literal[1]);
  const token = value.match(/var\(\s*(--[a-z-]+)/);
  if (!token) return 0;
  /*
   * Split on the name, then read the number with a regex LITERAL.
   *
   * Built as `new RegExp(\`${name}:\\s*(\\d+)\`)` this silently did not work:
   * inside a template literal `\s` and `\d` are not escape sequences, so they
   * collapse to a bare `s` and `d` and the pattern becomes `name:s*(d+)`,
   * which matches nothing. The test then read every weight as zero and
   * failed on its own first assertion.
   */
  const declared = tokens.split(`${token[1]}:`)[1]?.match(/^\s*(\d+)/);
  return declared ? Number(declared[1]) : 0;
};

describe('segmented controls', () => {
  it('reserves each label at the heaviest weight the control can use', () => {
    const rule = css.slice(
      css.indexOf('.segmented button::before'),
      css.indexOf('.segmented button[aria-pressed'),
    );
    expect(rule).toMatch(/content:\s*attr\(data-label\)/);
    // Collapsed to nothing vertically: it must contribute width only.
    expect(rule).toMatch(/height:\s*0/);
    expect(rule).toMatch(/visibility:\s*hidden/);

    /*
     * This used to read the weight off the SELECTED rule and require the
     * ghost to match it, which assumed selection is marked by going bolder.
     *
     * A restyle made selection a raised surface instead, so that rule
     * declares no weight at all — and the old slice, which ran to the end of
     * the file, went on to find an unrelated 500 further down and compared
     * against that. It was passing on a coincidence.
     *
     * The invariant is not "the ghost matches the selected rule". It is that
     * the ghost is reserved at AT LEAST the heaviest weight any state of the
     * button can take, which holds whether selection is marked by weight, by
     * a surface, or by something not yet thought of.
     */
    const ghost = weight(rule.match(/font-weight:([^;]+)/)?.[1] ?? '');
    expect(ghost).toBeGreaterThan(0);

    const states = [...css.matchAll(/\.segmented button[^{]*\{([^}]*)\}/g)]
      .filter((match) => !match[0].startsWith('.segmented button::before'))
      .map((match) => weight(match[1].match(/font-weight:([^;]+)/)?.[1] ?? ''));

    expect(states.length).toBeGreaterThan(0);
    for (const used of states) {
      expect(ghost).toBeGreaterThanOrEqual(used);
    }
  });

  it('gives every segment the attribute the reservation reads', () => {
    /*
     * The reservation only works if the hidden copy says the same thing as
     * the visible label — a data-label that has drifted from the text
     * reserves the wrong width, which is the original bug wearing a
     * disguise. So rather than naming the labels, this checks that every
     * segment mirrors itself.
     *
     * Named labels would have to be rewritten whenever a control is
     * reworded, which is what happened when the city toggle learned to say
     * "With This Building" for an existing building instead of only
     * "Approved Plan".
     */
    const declared = [...screens.matchAll(/data-label=/g)].length;
    // Four seasons plus the two-way city toggle.
    expect(declared).toBeGreaterThanOrEqual(3);

    /*
     * Anchored at data-label and run to the closing tag, so each button is
     * checked against ITS OWN text. Searching the file for the pair as a
     * substring is not enough: with two segments in a control, a label
     * copied onto the wrong button still finds its match on the right one.
     *
     * data-label is the last attribute on these buttons, which is what lets
     * this start there and avoid tripping over the `>` in `() =>`.
     */
    const pairs = [
      ...screens.matchAll(
        /data-label=(?:"([^"]+)"|\{([^}]+)\})\s*>\s*(?:\{([^}]+)\}|([^<]*?))\s*<\/button>/g,
      ),
    ];
    // Every declared segment matched the shape; none slipped past unchecked.
    expect(pairs.length).toBe(declared);

    for (const [, literal, expression, childExpression, childText] of pairs) {
      if (literal) expect(childText?.trim()).toBe(literal);
      else expect(childExpression?.trim()).toBe(expression.trim());
    }
  });

  it('keeps the season names on one line', () => {
    expect(css.slice(css.indexOf('.segmented button {'))).toMatch(/white-space:\s*nowrap/);
    for (const season of SEASONS) {
      expect(season.label).not.toMatch(/\s/);
    }
  });

  it('holds the simulation date to a single row whatever month it is', () => {
    /*
     * "21 September 2026" is four characters longer than "21 June 2026";
     * wrapped, it adds a line, the row grows, and the panel changes height as
     * the reader pages through the year.
     *
     * The guarantee moved when the native date input was replaced by a
     * written-out calendar — the row is `.daypick__trigger` now and the text
     * inside it `.daypick__value`. It did not move across on its own; this
     * test is what noticed that it had been dropped.
     */
    const row = css.slice(
      css.indexOf('.daypick__trigger {'),
      css.indexOf('.daypick__trigger:hover'),
    );
    expect(row).toMatch(/min-height:/);

    const value = css.slice(css.indexOf('.daypick__value {'));
    expect(value).toMatch(/white-space:\s*nowrap/);
  });
});
