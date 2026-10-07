/*
 * The cross that closes a card or a dialog, or clears a field: one drawing,
 * a 44px target, and the same quiet green tint on hover wherever it is.
 * It has no words of its own, so `label` is what a screen reader says.
 * Styles: kit.css.
 */

import { Cross } from './icons';

export function CloseButton({
  label,
  onClick,
  className,
}: {
  /** What pressing it does: "Close", "Clear the search", "Back to the map". */
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`close-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Cross />
    </button>
  );
}
