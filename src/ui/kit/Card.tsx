/*
 * A card: white, a cream hairline edge, the card radius. `raised` lifts it
 * off the city with the panel shadow, for a card that floats over the map
 * rather than sitting on a page. Every card on the cream pages and over the
 * map is this one, so their edges, corners and shadows agree.
 * Styles: kit.css.
 */

import type { HTMLAttributes, ReactNode } from 'react';

export function Card({
  as: Tag = 'div',
  raised = false,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'section' | 'li' | 'figure' | 'aside' | 'article';
  raised?: boolean;
  children?: ReactNode;
}) {
  return (
    <Tag className={`card${raised ? ' card--raised' : ''}${className ? ` ${className}` : ''}`} {...rest}>
      {children}
    </Tag>
  );
}
