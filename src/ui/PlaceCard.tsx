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
 *   - "Explore sunlight →", and a cross that goes back to the map. For a
 *     building standing today, also "Check solar panels →": its own screen,
 *     because it asks a different question (what panels on this roof would do).
 *
 * WHERE IT SITS
 *   Two copies are drawn and CSS shows one. On a wide screen it stands in
 *   the city beside the building (`anchored`, placed by SiteMarker). On a
 *   phone there is no room beside a building, so it is docked along the
 *   foot of the screen (`docked`, drawn by App). The hidden copy is
 *   display: none, so it is not read twice.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import type { PlaceFacts } from './placeFacts';
import { Card } from './kit/Card';
import { CloseButton } from './kit/CloseButton';
import { SourcesLink } from './Sources';
import { Icon, type IconName } from './kit/Icon';
import { Swatch } from './kit/Swatch';
import { t as translate, useT } from '../i18n/i18n';
import '../styles/place-card.css';

export function PlaceCard({
  title,
  facts,
  tone,
  variant,
  onSunlight,
  onSolar,
  flat,
  imageUrl = null,
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
  /** The solar panel check; only for a building standing today. */
  onSolar?: () => void;
  /** "Look out from a flat" (FlatPicker): only for a building standing today. App draws it. */
  flat?: ReactNode;
  /**
   * A photograph of the building, when there is one. The records have none today, so the corner shows
   * a drawn building instead: a placeholder that says what it is, never somebody else's photograph.
   */
  imageUrl?: string | null;
  /** Back to the map. */
  onClose: () => void;
}) {
  /*
   * The keyboard is given the card's heading when it opens, if this is the
   * copy on screen: the building was chosen on the map, and without this a
   * keyboard reader would not know anything had opened.
   */
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = heading.current;
    // No focus ring for it: nobody pressed a key to get here. Tabbing on shows one as usual.
    if (element && element.offsetParent !== null) {
      element.focus({ preventScroll: true, focusVisible: false });
    }
  }, [title]);

  /*
   * Beside the building the card is centred on a point up its side, and it is tall now: near the top of
   * the map it ran up under the header, near the foot off the screen. Watched each frame (the point moves
   * with the camera) and moved just far enough to stay between the header and the bottom of the window.
   */
  useEffect(() => {
    if (variant !== 'anchored') return;
    const card = heading.current?.closest<HTMLElement>('.place-card');
    if (!card) return;
    let shift = 0;
    let id = 0;
    const tick = () => {
      // not the copy on screen (a phone shows the docked one): nothing to keep in view, look again later
      if (card.offsetParent === null) {
        id = window.setTimeout(() => (id = window.requestAnimationFrame(tick)), 500) as unknown as number;
        return;
      }
      const r = card.getBoundingClientRect();
      if (r.height > 0) {
        const top = r.top - shift;
        const bottom = r.bottom - shift;
        const minTop = (document.querySelector('.header')?.getBoundingClientRect().bottom ?? 64) + 8;
        const maxBottom = window.innerHeight - 8;
        let want = 0;
        if (top < minTop) want = minTop - top;
        else if (bottom > maxBottom) want = Math.max(minTop - top, maxBottom - bottom);
        if (Math.abs(want - shift) > 0.5) {
          shift = want;
          card.style.setProperty('--pc-shift', `${Math.round(shift)}px`);
        }
      }
      id = window.requestAnimationFrame(tick);
    };
    id = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearTimeout(id);
    };
  }, [variant]);

  return (
    <Card
      as="section"
      raised
      className={`place-card place-card--${variant}`}
      aria-label={t('card.label', { title, kind: facts.kind })}
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
      <CloseButton label={t('card.close')} className="place-card__close" onClick={onClose} />

      {/* The address and what it is on the left; the building's picture on the right. */}
      <div className="place-card__head">
        <div className="place-card__head-text">
          <h2 className="panel-title place-card__title" ref={heading} tabIndex={-1}>
            {title}
          </h2>
          <p className="place-card__kind">
            <Swatch tone={tone} size="sm" />
            {facts.kind}
            {facts.use && <span className="place-card__use"> · {facts.use}</span>}
          </p>
        </div>
        {/*
          Without a photograph, a drawing of what it is, on the colour it is drawn in on the map: a
          building standing today, a project approved (its plans), one under construction (the tools).
          The shape tells them apart as well as the colour; the words beside it say it too.
        */}
        <div
          className={`place-card__image${imageUrl ? '' : ` place-card__image--none place-card__image--${tone}`}`}
          title={imageUrl ? undefined : facts.kind}
        >
          {imageUrl ? <img src={imageUrl} alt="" /> : <Icon name={KIND_ICON[tone]} size={30} />}
        </div>
      </div>

      <dl className="place-card__figures">
        {facts.figures.map((figure) => (
          // The label first, as a description list wants; CSS sets the figure above it.
          <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd>
              <Icon name={figureIcon(figure.label)} size={16} className="place-card__figure-icon" />
              <FigureValue value={figure.value} />
            </dd>
          </div>
        ))}
      </dl>

      {/*
        The ways on, as two cards of equal weight: each one button from edge to edge, with its own
        colour, its own icon and its words, so none of them is found by colour alone.
      */}
      <h3 className="place-card__section">{t('card.section')}</h3>
      <div className={`place-card__features${onSolar ? '' : ' place-card__features--one'}`}>
        <FeatureCard tone="sun" icon="light_mode" title={t('card.sunlight')} text={t('card.sunlightText')} onClick={onSunlight} />
        {onSolar && (
          <FeatureCard tone="solar" icon="solar_power" title={t('card.solar')} text={t('card.solarText')} onClick={onSolar} />
        )}
      </div>
      {flat}
      {/* what this is and where it comes from, as the "About the data" button elsewhere in the app */}
      <div className="place-card__fine">
        <SourcesLink look="about" />
      </div>
    </Card>
  );
}

/** The drawing in the corner, by what the building is (the tone it is drawn in). */
const KIND_ICON: Record<'searched' | 'approved' | 'progress', IconName> = {
  searched: 'apartment',
  approved: 'description',
  progress: 'construction',
};

/**
 * A figure's icon, by what it counts; anything else (a project's floor area or count) a plain mark.
 * The labels are in the language chosen (placeFacts), so they are compared with the same words.
 */
function figureIcon(label: string): IconName {
  if (label === translate('card.figure.height')) return 'height';
  if (label === translate('card.figure.storeys')) return 'stairs';
  if (label === translate('card.figure.built') || label === translate('card.figure.refurbished')) return 'calendar_month';
  return 'info';
}

/** One of the card's ways on: the whole card is the button. */
function FeatureCard({
  tone,
  icon,
  title,
  text,
  onClick,
}: {
  tone: 'sun' | 'solar';
  icon: IconName;
  title: string;
  text: string;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button type="button" className={`feature-card feature-card--${tone}`} onClick={onClick}>
      <span className="feature-card__top">
        <span className="feature-card__icon">
          <Icon name={icon} size={20} />
        </span>
        <span className="feature-card__go" aria-hidden="true">
          <Icon name="arrow_forward" size={14} />
        </span>
      </span>
      <span className="feature-card__title">{title}</span>
      <span className="feature-card__text">{text}</span>
      <span className="feature-card__action" aria-hidden="true">
        {t('card.explore')}
      </span>
    </button>
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
