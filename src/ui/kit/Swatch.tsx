/*
 * A colour key's mark: a dot in the colour a kind of building shows on
 * screen, with a darker edge (--key-* in tokens.css). "selected" is a ring,
 * not a fill — the chosen building is outlined on the map, so it is
 * outlined here: told apart by shape as well as colour. Decorative: the
 * words beside it say what it is. Styles: kit.css.
 */

export type SwatchTone = 'existing' | 'approved' | 'progress' | 'searched' | 'selected';

export function Swatch({ tone, size = 'md' }: { tone: SwatchTone; size?: 'sm' | 'md' }) {
  return <span className={`swatch swatch--${tone} swatch--${size}`} aria-hidden="true" />;
}
