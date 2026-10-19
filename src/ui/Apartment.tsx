/*
 * ─────────────────────────────────────────────────────────────────────────
 * "I LIVE ON THE TWELFTH FLOOR, FACING THE PARK"
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The two questions that turn a building into somebody's flat, and the
 *   answer that comes back. It sits inside the sunlight panel for a building
 *   that is already standing.
 *
 * WHY IT IS NOT THE SPOT-ON-THE-GROUND FLOW WITH A HEIGHT BOX
 *   Because it is a different question and it deserves different words. The
 *   ground flow asks what ONE PROPOSAL takes from a place. A resident is
 *   asking what reaches their window, and most of what does not reach it is
 *   the city that is already there — see windowSunlight.ts, which counts a
 *   different thing and names it differently for the same reason.
 *
 * WHY THE SIDES ARE NOT EIGHT COMPASS BUTTONS
 *   They are the sides the building actually has, read off its footprint by
 *   facadesOf(). A tower with four square faces should not invite somebody to
 *   say their window faces north-west, because none of them does, and an
 *   answer to a question that could not be right is worse than no answer.
 */

import type { Facade } from '../scene/facades';
import { Icon } from './kit/Icon';
import type { WindowSunlight } from '../scene/windowSunlight';
import { formatNumber, t as say, useT } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';
import { compassWord, compassWordInSentence } from './flatProblemText';

/** "4 h 20 min", "50 min" — the same shape the ground result uses. */
function hours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return say('flat.durationMinutes', { minutes: formatNumber(m) });
  return m === 0
    ? say('flat.durationHours', { hours: formatNumber(h) })
    : say('flat.durationHoursMinutes', { hours: formatNumber(h), minutes: formatNumber(m) });
}

/**
 * The two questions: which floor, and which way does it face.
 *
 * Both are controlled from outside — this component holds no state of its
 * own, because App has to know the answers anyway in order to place the
 * marker in the 3D scene and to compute the skyline.
 *
 * `sides` is the list the building actually HAS at the floor being asked
 * about, worked out from its footprint, so it changes as the reader moves up
 * past a podium onto a narrower tower. `floorsAboveGround` is null for most
 * buildings in the extract, and when it is, the note under the stepper says
 * the floor height had to be assumed.
 */
export function ApartmentControls({
  floor,
  onFloor,
  floorsAboveGround,
  sides,
  chosenSide,
  onSide,
  floorHeightAssumed,
}: {
  floor: number;
  onFloor: (next: number) => void;
  /** From the building record. Null for most buildings in the extract. */
  floorsAboveGround: number | null;
  sides: Facade[];
  /** The compass name of the chosen side, or null before anything is chosen. */
  chosenSide: string | null;
  onSide: (compass: string) => void;
  floorHeightAssumed: boolean;
}) {
  const t = useT();
  const top = floorsAboveGround ?? null;
  const atTop = top !== null && floor >= top;
  // One sentence about the floors on record, with the note on assumed floor heights when there is one.
  const floorsKey: MessageKey =
    top === null
      ? floorHeightAssumed ? 'flat.floorsUnknownEstimated' : 'flat.floorsUnknown'
      : top === 1
        ? floorHeightAssumed ? 'flat.floorsOnRecordOneEstimated' : 'flat.floorsOnRecordOne'
        : floorHeightAssumed ? 'flat.floorsOnRecordOtherEstimated' : 'flat.floorsOnRecordOther';

  return (
    <>
      <section className="block">
        <h4 className="block__head">{t('flat.whichFloor')}</h4>

        {/*
          A stepper, not a free text box.

          Nearly every answer is within a press or two of the one before it,
          and the two presses are a 44px target each. The number is still a
          real input, so a resident on the fortieth floor can type it rather
          than hold a button down forty times.
        */}
        <div className="stepper">
          <button
            type="button"
            className="stepper__step"
            onClick={() => onFloor(Math.max(1, floor - 1))}
            disabled={floor <= 1}
            aria-label={t('flat.floorDown')}
          >
            <Icon name="remove" size={18} />
          </button>

          <label className="stepper__value">
            <span className="visually-hidden">{t('flat.floor')}</span>
            <input
              type="number"
              min={1}
              max={top ?? undefined}
              value={floor}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) onFloor(Math.max(1, Math.round(next)));
              }}
            />
          </label>

          <button
            type="button"
            className="stepper__step"
            onClick={() => onFloor(floor + 1)}
            disabled={atTop}
            aria-label={t('flat.floorUp')}
          >
            <Icon name="add" size={18} />
          </button>
        </div>

        {/*
          What the building actually says about itself, and — when it says
          nothing — that the height of a floor had to be assumed. A figure
          resting on a guess should say so beside itself, not in the footer.
        */}
        <p className="block__note">
          {t(floorsKey, top === null ? undefined : { floors: formatNumber(top) })}
        </p>
      </section>

      <section className="block">
        <h4 className="block__head">{t('flat.whichWay')}</h4>

        {/*
          Only the sides this building has. The order is longest wall first,
          because the longest wall is the one most flats look out of.
        */}
        <div className="sides" role="group" aria-label={t('flat.whichWayLabel')}>
          {sides.map((side) => (
            <button
              key={side.compass}
              type="button"
              className="sides__side"
              aria-pressed={side.compass === chosenSide}
              onClick={() => onSide(side.compass)}
            >
              {compassWord(side.compass)}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

/**
 * What the window gets, and what it would lose.
 *
 * EVERY NUMBER HERE IS DIRECT SUN, and the words say so. A window in shade
 * still has daylight; "daylight" would be a different and much larger figure.
 * This interface has already once labelled a with-and-without figure "total
 * daylight" and been wrong, so the wording is part of the contract now.
 */
export function WindowResult({
  sunlight,
  dateLabel,
  floor,
  side,
}: {
  sunlight: WindowSunlight;
  dateLabel: string;
  floor: number;
  side: string;
}) {
  const t = useT();
  const none = sunlight.sunAtWindowMin === 0;

  return (
    <div className="result" aria-live="polite">
      <p className="result__eyebrow">
        {t('flat.windowHeading', { floor: formatNumber(floor), side: compassWordInSentence(side) })}
      </p>

      {none ? (
        <>
          <p className="result__figure result__figure--none">
            {t('flat.noSun', { date: dateLabel })}
          </p>
          {/*
            Said even here — especially here. "None" is a strong claim, and
            the reader is owed the scale of it: none out of a nine-hour
            winter day is a different fact from none out of fifteen.
          */}
          <p className="result__against">
            {t('flat.sunUpFor', { duration: hours(sunlight.sunUpMin) })}
          </p>
        </>
      ) : (
        <>
          <p className="result__figure">{hours(sunlight.sunAtWindowMin)}</p>
          <p className="result__caption">{t('flat.directSunOn', { date: dateLabel })}</p>

          {/*
            The figure above is meaningless on its own. Four hours is most of
            a midwinter day and a third of a midsummer one, and this is the
            only thing on screen that tells the two apart.
          */}
          <p className="result__against">
            {t('flat.outOfSunUp', { duration: hours(sunlight.sunUpMin) })}
          </p>

          {/*
            Two facts, not a range — see the note on firstSunLabel. A south
            window in December is lit at 06:00 and again at 20:30 with a dark
            middle, and a dash between them would claim fourteen hours.
          */}
          <p className="result__against">
            {t('flat.firstLastSun', { first: sunlight.firstSunLabel ?? '', last: sunlight.lastSunLabel ?? '' })}
          </p>
          {sunlight.brokenByShade && (
            <p className="result__against">
              {t('flat.sunComesBack')}
            </p>
          )}
        </>
      )}

      {/*
        Only when there is something proposed to compare against. Null means
        no proposal is being shown, and saying "0 min less" there would
        reassure somebody about a building nobody is assessing.
      */}
      {sunlight.lostToProposalMin !== null && (
        <dl className="stat-row">
          <dt>{t('flat.onceBuilt')}</dt>
          <dd>
            {/*
              IT CAN GO UP, and the wording has to allow for it.
              
              The approved scenario takes down the buildings a proposal is
              built on. Replace something tall with something shorter and this
              window gains sun — so the figure is a difference, not a loss,
              and "-1 h less" would be the sentence if this said "less" always.
            */}
            {sunlight.lostToProposalMin === 0
              ? t('flat.noChange')
              : sunlight.lostToProposalMin > 0
                ? t('flat.less', { duration: hours(sunlight.lostToProposalMin) })
                : t('flat.more', { duration: hours(-sunlight.lostToProposalMin) })}
          </dd>
        </dl>
      )}
    </div>
  );
}
