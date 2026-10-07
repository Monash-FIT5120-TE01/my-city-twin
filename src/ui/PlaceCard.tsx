/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE CARD BESIDE A CHOSEN BUILDING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   What opens when a building is chosen — by a double click on the map, or
 *   from search. It replaced the full column that used to take the left of
 *   the screen: the building stays the thing being looked at, and the card
 *   sits beside it saying what it is and how big, with the way on to its
 *   sunlight.
 *
 * WHAT IS ON IT
 *   - The address.
 *   - What it is, in words, after a dot in the colour it is drawn in:
 *     "Under construction · Office + Retail", "Existing building · Mainly
 *     office". The words carry it; the dot is a shortcut.
 *   - Up to three figures, large, each with what it counts under it — see
 *     placeFacts.ts for which, and why a missing one is left out.
 *   - "Explore sunlight →", and a cross that goes back to the map.
 *
 * WHERE IT SITS
 *   Two copies are drawn and CSS shows one. On a wide screen it stands in
 *   the city beside the building (`anchored`, placed by SiteMarker). On a
 *   phone there is no room beside a building, so it is docked along the
 *   foot of the screen (`docked`, drawn by App). The hidden copy is
 *   display: none, so it is not read twice.
 */

import { useEffect, useRef } from 'react';
import type { PlaceFacts } from './placeFacts';
import { Card } from './kit/Card';
import { CloseButton } from './kit/CloseButton';
import { DemoNote } from './kit/DemoNote';
import { Swatch } from './kit/Swatch';
import { TextButton } from './kit/TextButton';
import '../styles/place-card.css';

export function PlaceCard({
  title,
  facts,
  tone,
  variant,
  onSunlight,
  onClose,
}: {
  title: string;
  facts: PlaceFacts;
  /**
   * Which colour the dot takes — the colour the building is drawn in while
   * chosen: pink for a building standing today, teal or orange for a project.
   */
  tone: 'searched' | 'approved' | 'progress';
  variant: 'anchored' | 'docked';
  onSunlight: () => void;
  /** Back to the map. */
  onClose: () => void;
}) {
  /*
   * The keyboard is given the card's heading when it opens, if this is the
   * copy on screen: the building was chosen on the map, and without this a
   * keyboard reader would not know anything had opened.
   */
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = heading.current;
    // No focus ring for it: nobody pressed a key to get here. Tabbing on shows one as usual.
    if (element && element.offsetParent !== null) {
      element.focus({ preventScroll: true, focusVisible: false });
    }
  }, [title]);

  return (
    <Card
      as="section"
      raised
      className={`place-card place-card--${variant}`}
      aria-label={`${title}, ${facts.kind}`}
      /*
       * The card beside the building is drawn inside the map's own box, so a
       * press on it reached the camera controls there: dragging across the
       * card moved the map, and the wheel over it zoomed. Neither leaves the
       * card now. (The docked copy sits outside the map; this costs it nothing.)
       */
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <CloseButton label="Back to the map" className="place-card__close" onClick={onClose} />

      {/* The address first, then what it is — the order the design reads in. */}
      <h2 className="panel-title place-card__title" ref={heading} tabIndex={-1}>
        {title}
      </h2>
      <p className="place-card__kind">
        <Swatch tone={tone} size="sm" />
        {facts.kind}
        {facts.use && <span className="place-card__use"> · {facts.use}</span>}
      </p>

      <dl className="place-card__figures">
        {facts.figures.map((figure) => (
          // The label first, as a description list wants; CSS sets the figure above it.
          <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd>
              <FigureValue value={figure.value} />
            </dd>
          </div>
        ))}
      </dl>

      <TextButton className="place-card__go" onClick={onSunlight}>
        Explore sunlight
      </TextButton>
      <DemoNote className="place-card__fine" />
    </Card>
  );
}

/**
 * "62,754 m²" with the unit set smaller than the number: the number is what
 * is read, and a unit at full size made the widest figure overrun its column.
 */
function FigureValue({ value }: { value: string }) {
  const unit = value.match(/^(.*\S)\s+(m²|m)$/);
  if (!unit) return <>{value}</>;
  return (
    <>
      {unit[1]}
      <span className="place-card__unit"> {unit[2]}</span>
    </>
  );
}
