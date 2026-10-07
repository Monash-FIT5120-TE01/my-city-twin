/*
 * ─────────────────────────────────────────────────────────────────────────
 * BUTTONS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every filled or outlined button in the interface. Four kinds, two sizes:
 *
 *   primary    green, white words — the one thing to do here
 *   secondary  green edge and words on paper — the other way on
 *   ghost      a quiet edge — cancel, clear, a side action
 *   mint       the design's mint with a dark edge — "Choose a spot"; still a
 *              button by its edge and dark words to someone who does not
 *              see the mint
 *
 *   md 44px (the smallest target), lg 48px (the action a screen is for).
 *
 * `arrow` adds the forward arrow after the words, for a button that goes on
 * to another screen. `icon` puts a mark before them. Styles: kit.css.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowRight } from './icons';

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  arrow = false,
  className,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'mint';
  size?: 'md' | 'lg';
  /** The full width of its container. */
  block?: boolean;
  /** A mark before the words. */
  icon?: ReactNode;
  /** The forward arrow after the words: this goes on to another screen. */
  arrow?: boolean;
}) {
  const classes = [
    'button',
    variant !== 'primary' && `button--${variant}`,
    size === 'lg' && 'button--lg',
    block && 'button--block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...rest}>
      {icon}
      {children}
      {arrow && <ArrowRight />}
    </button>
  );
}
