/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE SEARCH FIELD
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The one search box, wherever it appears: in the header (md) and on the
 * front page (lg, the page's main way in). They used to be two different
 * drawings — a grey filled bar in the header, a white bordered box on the
 * front page, with different heights, placeholder greys and focus rings —
 * for the same thing. Now one box: white, a cream hairline, the green edge
 * and ring while it has the keyboard.
 *
 * WHAT IS IN IT
 *   - The magnifier, the input, and at the end either the "/" key that
 *     finds the field (while it is empty) or a cross that clears it.
 *   - `children`: a row inside the same box, under the input — the front
 *     page's chosen place.
 *   - `dropdown`: the search results, hung from under the box at its width
 *     (SearchResults; the look of the list is in kit.css too).
 *
 * The input carries data-search-field: the "/" key focuses whichever one is
 * on screen (see Header). Styles: kit.css.
 */

import type { ReactNode, Ref } from 'react';
import { CloseButton } from './CloseButton';

export function SearchField({
  ref,
  value,
  onChange,
  onClear,
  onFocus,
  placeholder = 'Search a street or address',
  disabled = false,
  size = 'md',
  shortcut = false,
  className,
  children,
  dropdown,
}: {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (next: string) => void;
  /** The cross at the end, once something is typed. */
  onClear?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
  /** Show the "/" key that focuses the field, while it is empty. */
  shortcut?: boolean;
  className?: string;
  /** A row under the input, inside the box. */
  children?: ReactNode;
  /** The results, hung under the box. */
  dropdown?: ReactNode;
}) {
  return (
    <div className={`search search--${size}${className ? ` ${className}` : ''}`}>
      <div className="search__box">
        <label className="search__field">
          <svg className="search__icon" width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
            <circle cx="7" cy="7" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <line
              x1="11"
              y1="11"
              x2="15.4"
              y2="15.4"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={ref}
            data-search-field
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={onFocus}
            placeholder={placeholder}
            aria-label="Search for a street or address"
            disabled={disabled}
          />
          {value && onClear ? (
            <CloseButton label="Clear the search" onClick={onClear} />
          ) : (
            shortcut &&
            !value && (
              /*
               * Drawn as a key rather than written in the placeholder, so it
               * reads as a thing to press rather than as part of the prompt.
               */
              <kbd className="search__key" aria-hidden="true">
                /
              </kbd>
            )
          )}
        </label>
        {children}
      </div>
      {dropdown}
    </div>
  );
}
