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
import { useId } from "react";
import type { RoomProblem } from "../scene/room/roomPlacement";
import type { Facade } from "../scene/facades";
import { Button } from "./kit/Button";
import { Icon } from "./kit/Icon";
import { compassWord, flatProblemText } from "./flatProblemText";
import { useT } from "../i18n/i18n";

export type FlatFit = { ok: true } | { ok: false; problem: RoomProblem };

export function LookOutFromFlat({
  fit,
  onEnter,
}: {
  fit: FlatFit;
  onEnter: () => void;
}) {
  const t = useT();
  const note = useId();
  return (
    <div className="look-out">
      <Button
        variant="secondary"
        block
        disabled={!fit.ok}
        aria-describedby={note}
        onClick={onEnter}
      >
        {t("flat.lookOutFromThis")}
      </Button>
      <p className="block__note" id={note} aria-live="polite">
        {fit.ok
          ? t("flat.lookOutNote")
          : flatProblemText(fit.problem)}
      </p>
    </div>
  );
}

/**
 * The building card's way in: the floor and the side on one line, the button, and one line under it —
 * an example layout, or why not here, or what is still to choose. Small enough that the card hardly grows.
 * The floor and the side are the same ones the sunlight panel's window uses (App keeps them).
 */
export function FlatPicker({
  floor,
  onFloor,
  floorsAboveGround,
  sides,
  side,
  onSide,
  fit,
  onEnter,
}: {
  floor: number;
  onFloor: (next: number) => void;
  floorsAboveGround: number | null;
  sides: Facade[];
  side: string | null;
  onSide: (compass: string) => void;
  fit: FlatFit | null;
  onEnter: () => void;
}) {
  const t = useT();
  const note = useId();
  const floorLabel = useId();
  const titleId = useId();
  const atTop = floorsAboveGround !== null && floor >= floorsAboveGround;
  return (
    <section className="flat-picker" aria-labelledby={titleId}>
      <div className="flat-picker__head">
        <span className="flat-picker__icon" aria-hidden="true">
          <Icon name="visibility" size={20} />
        </span>
        <span>
          <span className="flat-picker__title" id={titleId}>
            {t("flat.lookOutFromA")}
          </span>
          <span className="flat-picker__text">
            {t("flat.lookOutLede")}
          </span>
        </span>
      </div>
      <div className="flat-picker__row">
        <div className="flat-picker__field">
          <span className="flat-picker__label" id={floorLabel}>
            {t("flat.floor")}
          </span>
          <div
            className="stepper stepper--compact"
            role="group"
            aria-labelledby={floorLabel}
          >
            <button
              type="button"
              className="stepper__step"
              onClick={() => onFloor(Math.max(1, floor - 1))}
              disabled={floor <= 1}
              aria-label={t("flat.floorDown")}
            >
              <Icon name="remove" size={16} />
            </button>
            <label className="stepper__value">
              <span className="visually-hidden">{t("flat.floor")}</span>
              <input
                type="number"
                min={1}
                max={floorsAboveGround ?? undefined}
                value={floor}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next))
                    onFloor(Math.max(1, Math.round(next)));
                }}
              />
            </label>
            <button
              type="button"
              className="stepper__step"
              onClick={() => onFloor(floor + 1)}
              disabled={atTop}
              aria-label={t("flat.floorUp")}
            >
              <Icon name="add" size={16} />
            </button>
          </div>
        </div>
        <label className="flat-picker__field">
          <span className="flat-picker__label">{t("flat.facing")}</span>
          <select
            className="flat-picker__select"
            value={side ?? ""}
            onChange={(event) => onSide(event.target.value)}
          >
            <option value="" disabled>
              {t("flat.choose")}
            </option>
            {sides.map((s) => (
              <option key={s.compass} value={s.compass}>
                {compassWord(s.compass)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* asks for both answers first: off until the floor and the side make a place the flat fits */}
      <button
        type="button"
        className="flat-picker__go"
        disabled={!fit?.ok}
        aria-describedby={note}
        onClick={onEnter}
      >
        {t("flat.lookOut")}
        <Icon name="arrow_forward" size={16} />
      </button>
      <p className="flat-picker__note" id={note} aria-live="polite">
        <Icon name="info" size={14} />
        <span>
          {!side
            ? t("flat.chooseFloorAndSide")
            : !fit
              ? t("flat.problemNoSuchSide")
              : fit.ok
                ? t("flat.exampleFlat")
                : flatProblemText(fit.problem)}
        </span>
      </p>
    </section>
  );
}
