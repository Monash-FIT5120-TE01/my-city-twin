/*
 * A pill: a short label on white, laid over a picture or the map — "Today",
 * "25-45 Collins Street", the explore screen's one line. Pill-shaped, with
 * the chip shadow so it reads over any ground. Styles: kit.css.
 */

import type { HTMLAttributes, ReactNode } from 'react';

export function Pill({
  as: Tag = 'span',
  size = 'sm',
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  as?: 'span' | 'p' | 'figcaption';
  /** xs on a small picture, sm elsewhere. */
  size?: 'xs' | 'sm';
  children?: ReactNode;
}) {
  return (
    <Tag className={`pill pill--${size}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Tag>
  );
}
