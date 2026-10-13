/*
 * "Stand here?" — asked over the map the moment a spot is chosen.
 *
 * Standing in the street at the measured spot is the best way to see what
 * the figure means, and it used to be a ghost button at the foot of the
 * sunlight column, under the result, beside "Clear point". People chose a
 * spot, read the number and never found it. Now the question is put where
 * they are looking, once per spot: "Stand here" goes down to the footpath,
 * "Not now" (or Escape) leaves the map as it is. The button in the column
 * stays, for later.
 *
 * Not modal: the map and the column still work behind it. It takes the
 * keyboard when it appears, so the answer is one key away, and gives it
 * back on "Not now" — to where it was, or to the sunlight column's heading
 * when that place has gone. Never shown in the headset, which asks the
 * same question on its own Measure card (VrPanel). Styles: sunlight.css.
 */

import { useEffect, useRef } from 'react';
import { Button } from './kit/Button';
import { Icon } from './kit/Icon';

export function StandPrompt({
  onStand,
  onDismiss,
  returnTo = 'subject-title',
}: {
  onStand: () => void;
  onDismiss: () => void;
  /**
   * The id to give the keyboard to on "Not now" when the element that had it
   * before is gone — "Choose a spot" goes as soon as the spot is chosen.
   * The sunlight column's heading by default.
   */
  returnTo?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** Where the keyboard was before the prompt took it, to give it back on "Not now". */
  const before = useRef<Element | null>(null);
  const close = () => {
    onDismiss();
    const back = before.current;
    if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
    // Gone, or not something that takes the keyboard (the map's canvas): the fallback.
    if (!back || document.activeElement !== back) {
      document.getElementById(returnTo)?.focus({ preventScroll: true });
    }
  };
  // The latest handler, so the key listener below is added once.
  const dismiss = useRef(close);
  dismiss.current = close;

  // Once, on arrival: not on every render of the screen behind it.
  useEffect(() => {
    // The first time only: run twice in development, the second pass would
    // find the prompt's own button already holding the keyboard.
    const active = document.activeElement;
    if (before.current === null && !box.current?.contains(active)) before.current = active;
    box.current?.querySelector<HTMLButtonElement>('.stand-prompt__go')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={box} className="stand-prompt" role="dialog" aria-modal="false" aria-labelledby="stand-prompt-title" aria-describedby="stand-prompt-words">
      <span className="stand-prompt__mark" aria-hidden="true">
        <Icon name="person_pin_circle" size={26} />
      </span>
      <div className="stand-prompt__words">
        <p className="stand-prompt__title" id="stand-prompt-title">
          Stand here?
        </p>
        <p className="stand-prompt__text" id="stand-prompt-words">
          See this spot from the footpath, at eye level.
        </p>
      </div>
      <div className="stand-prompt__actions">
        <Button variant="ghost" onClick={close}>
          Not now
        </Button>
        <Button className="stand-prompt__go" onClick={onStand} icon={<Icon name="person_pin_circle" size={18} />}>
          Stand here
        </Button>
      </div>
    </div>
  );
}
