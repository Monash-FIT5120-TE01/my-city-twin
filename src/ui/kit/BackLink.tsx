/*
 * "Back to …": the way to the screen before, drawn one way everywhere — a
 * chevron and the words, in green, underlined on hover. It used to be three
 * different things (a chevron with a tinted hover, an arrow with an
 * underline, and an outlined button) for the same journey. Styles: kit.css.
 */

import type { ReactNode } from 'react';
import { ChevronLeft } from './icons';

export function BackLink({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  /** Where it goes, in words: "Back to sunlight". */
  children: ReactNode;
}) {
  return (
    <button type="button" className={`back-link${className ? ` ${className}` : ''}`} onClick={onClick}>
      <ChevronLeft />
      <span>{children}</span>
    </button>
  );
}
