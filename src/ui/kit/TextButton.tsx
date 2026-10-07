/*
 * A button drawn as a link: green words, no box.
 *
 *   action     a way on ("Explore sunlight →"): the arrow, underlined on
 *              hover — it stands on its own, so it does not need the line
 *              until the pointer is on it
 *   reference  a thing to look up ("Details", "Sources & limitations"):
 *              always underlined, because it sits among other words and the
 *              line is what says it can be pressed
 *
 * Styles: kit.css.
 */

import type { ButtonHTMLAttributes } from 'react';
import { ArrowRight } from './icons';

export function TextButton({
  variant = 'action',
  arrow = variant === 'action',
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: 'action' | 'reference';
  /** The forward arrow; on by default for an action. */
  arrow?: boolean;
}) {
  return (
    <button
      type="button"
      className={`text-button text-button--${variant}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
      {arrow && <ArrowRight />}
    </button>
  );
}
