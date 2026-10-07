/*
 * The line that says what this is — "Illustrative model · Demo data" — and
 * the way to its sources and limits. The same words, separator and link on
 * every screen; they had drifted into four versions ("scenarios" on one
 * page, no separator on another, no link on the card). `children` goes
 * after it, for a screen that adds something of its own (the front page's
 * date). Styles: kit.css.
 */

import type { ReactNode } from 'react';
import { SourcesLink } from '../Sources';

export function DemoNote({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <p className={`demo-note${className ? ` ${className}` : ''}`}>
      <span>Illustrative model · Demo data</span>
      <span className="demo-note__sep" aria-hidden="true">
        |
      </span>
      <SourcesLink />
      {children}
    </p>
  );
}
