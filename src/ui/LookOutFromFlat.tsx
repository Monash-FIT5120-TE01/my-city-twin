/*
 * "Look out from this flat": the way into the example one-bedroom flat behind the chosen side, on the
 * chosen floor (scene/room/). The same block on the sunlight panel and in the building card.
 *
 * Where the flat does not fit, the button is there but cannot be pressed, and the sentence under it says
 * what is in the way (flatProblemText.ts) — a missing button would leave the reader wondering whether
 * the feature exists here at all.
 *
 * The note says, every time, that the flat is an example and not the building's real plan: it is the
 * same layout wherever it is put.
 */
import { useId } from 'react';
import type { RoomProblem } from '../scene/room/roomPlacement';
import { Button } from './kit/Button';
import { flatProblemText } from './flatProblemText';

export type FlatFit = { ok: true } | { ok: false; problem: RoomProblem };

export function LookOutFromFlat({ fit, onEnter }: { fit: FlatFit; onEnter: () => void }) {
  const note = useId();
  return (
    <div className="look-out">
      <Button variant="secondary" block disabled={!fit.ok} aria-describedby={note} onClick={onEnter}>
        Look out from this flat
      </Button>
      <p className="block__note" id={note} aria-live="polite">
        {fit.ok
          ? 'Walk around an example one-bedroom flat on this floor, behind this side, and see the sun come in. It is not this building’s real plan.'
          : flatProblemText(fit.problem)}
      </p>
    </div>
  );
}
