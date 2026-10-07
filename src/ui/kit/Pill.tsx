/*
 * A pill: a short label on white, laid over a picture or the map — "Today",
 * "25-45 Collins Street", the explore screen's one line. Pill-shaped, with
 * the chip shadow so it reads over any ground. As a button it is a choice to
 * press ("Bourke Street" under the front page's search). Styles: kit.css.
 */

import type { HTMLAttributes, ReactNode } from 'react';

export function Pill({
  as: Tag = 'span',
  size = 'sm',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  as?: 'span' | 'p' | 'figcaption' | 'button';
  /** As a button: not pressable yet. */
  disabled?: boolean;
  /** xs on a small picture, sm elsewhere. */
  size?: 'xs' | 'sm';
  children?: ReactNode;
}) {
  return (
    <Tag
      className={`pill pill--${size}${Tag === 'button' ? ' pill--button' : ''}${className ? ` ${className}` : ''}`}
      {...(Tag === 'button' ? { type: 'button' as const } : {})}
      {...rest}
    >
      {children}
    </Tag>
  );
}
