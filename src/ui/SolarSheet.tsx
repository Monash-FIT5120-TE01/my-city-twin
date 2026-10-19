/*
 * The solar panel check's column. It starts as the sunlight column does —
 * the way back, the address, "Details" (SubjectHead), then the "Sunlight |
 * Solar panels" switch — and is the same full-height column on a wide
 * screen (solar.css).
 *
 * Then numbers first: how many panels the roof
 * takes and what they would generate, in homes and the grid's CO2 as well as
 * kWh; what the approved developments would do to that; the roof's space and
 * how much light each part of it keeps; then, behind "See details", what is
 * not in it yet and how it was counted.
 *
 * Progress is announced to screen readers as it changes (role="status"), and
 * the heading takes the keyboard when the column opens (tabIndex -1). The
 * swatches only repeat what the words say.
 */
import { useId, useState, type ReactNode } from 'react';
import { Icon } from './kit/Icon';
import { AnalysisSwitch } from './kit/AnalysisSwitch';
import { SubjectHead } from './screens';
import { SOLAR_LEVELS } from '../scene/SolarRoof';
import { KWH_PER_KW, LEVEL_FLOORS, PANEL_W, type SolarCheck } from '../scene/useSolarCheck';
import { EDGE_SETBACK_M, LIGHT_MIN } from '../scene/panelLayout';
import { BALLAST_MAX_HEIGHT_M, MODULE } from '../scene/panelModel';
import { co2TonnesFor, GRID_KG_CO2E_PER_KWH, homesFor, HOUSEHOLD_KWH } from '../scene/solarUnits';
import { formatNumber, t, useT } from '../i18n/i18n';
import { richText } from './KeyHints';

/** The two runs of the check and the approved developments near enough to matter (App.tsx). */
export interface PlansCompare { now: SolarCheck | null; planned: SolarCheck | null; nearby: number; named: string[]; lostShown: boolean }

const m2 = (v: number) => formatNumber(Math.round(v));
const pct = (v: number) => formatNumber(v, { style: 'percent', maximumFractionDigits: 0 });
/** Two figures for small numbers, whole ones from ten up. */
const about = (v: number) => (v < 10 ? formatNumber(v, { maximumFractionDigits: 1 }) : formatNumber(Math.round(v)));
/** A year's kWh to the nearest hundred: the method is not finer than that. */
const kwh = (v: number) => formatNumber(Math.round(v / 100) * 100);
/** A change in a year's kWh, signed; under fifty, which rounds to nothing, said as such. */
const kwhChange = (v: number) => (Math.abs(v) < 50 ? (v === 0 ? '±0' : t('solar.change.under100')) : signed(v, kwh));
/** A change smaller than this share of today's generation, with the same panels, is shown as none. */
const UNCHANGED_SHARE = 0.005;
const signed = (v: number, f: (x: number) => string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${f(Math.abs(v))}`;

/** Best first, as the key reads; in the language chosen when called. */
const levels = () => [
  { level: 4, label: t('solar.levels.best', { pct: pct(LEVEL_FLOORS[0]) }) },
  { level: 3, label: t('solar.levels.range', { from: pct(LEVEL_FLOORS[1]), to: pct(LEVEL_FLOORS[0]) }) },
  { level: 2, label: t('solar.levels.range', { from: pct(LEVEL_FLOORS[2]), to: pct(LEVEL_FLOORS[1]) }) },
  { level: 1, label: t('solar.levels.under', { pct: pct(LEVEL_FLOORS[2]) }) },
];

function PanelSunIcon() {
  return (
    <Icon name="solar_power" size={40} className="solar-icon" />
  );
}

function SunMeterIcon() {
  return (
    <Icon name="light_mode" size={26} className="solar-icon solar-icon--small" />
  );
}

/** What the approved developments do to this roof's panels. */
function PlansCard({ compare, plansBlocked, withPlans, onWithPlans }: {
  compare: PlansCompare; plansBlocked: boolean; withPlans: boolean; onWithPlans: (on: boolean) => void;
}) {
  const t = useT();
  const { now, planned, nearby, named } = compare;
  let body: ReactNode;
  if (plansBlocked) body = <p className="solar-card__note">{t('solar.plans.replaced')}</p>;
  else if (!now?.done) body = null;
  else if (!nearby) body = <p className="solar-card__note">{t('solar.plans.noneNearby')}</p>;
  else if (!planned?.done) body = <p className="solar-card__note">{t('solar.plans.measuring', { pct: planned ? Math.round(planned.progress * 100) : 0 })}</p>;
  else {
    const dKwh = planned.kwhYear - now.kwhYear, dPanels = planned.panels - now.panels;
    const fromNone = now.kwhYear === 0;
    const share = fromNone ? 0 : dKwh / now.kwhYear;
    const unchanged = dPanels === 0 && (fromNone ? planned.kwhYear === 0 : Math.abs(share) < UNCHANGED_SHARE);
    body = unchanged ? (
      <p className="solar-card__note">
        {dKwh === 0 ? t('solar.plans.noChange') : t('solar.plans.tinyChange')}
      </p>
    ) : (
      <>
        <p className="solar-diff__main">
          {fromNone
            ? richText(t('solar.plans.newRoom'))
            : richText(t('solar.plans.generationChange', {
                change: signed(share * 100, (x) => `${x < 10 ? formatNumber(x, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : formatNumber(Math.round(x))}%`),
              }))}
        </p>
        <dl className="solar-diff__units">
          <div><dt>{t('solar.plans.panels')}</dt><dd>{signed(dPanels, (x) => formatNumber(x))}</dd></div>
          <div><dt>{t('solar.plans.kwhYear')}</dt><dd>{kwhChange(dKwh)}</dd></div>
          <div><dt>{t('solar.plans.homes')}</dt><dd>{signed(homesFor(dKwh), about)}</dd></div>
        </dl>
        <p className="solar-card__note">
          {named.length
            ? t('solar.plans.highest', { names: named.slice(0, 3).map((a) => a.split(/ MELBOURNE|, Melbourne/)[0]).join('; ') })
            : t('solar.plans.notHighEnough', { count: formatNumber(nearby) })}
        </p>
        {withPlans && compare.lostShown && <p className="solar-card__note">{t('solar.plans.hatched')}</p>}
      </>
    );
  }
  return (
    <section className="solar-card solar-plans-card" aria-label={t('solar.plans.label')}>
      <label className="switch solar-plans">
        <span className="switch__text">
          <span className="switch__name">{t('solar.plans.switch')}</span>
          <span className="switch__note">{t('solar.plans.switchNote')}</span>
        </span>
        <input type="checkbox" className="switch__input" checked={withPlans} disabled={plansBlocked} onChange={(e) => onWithPlans(e.target.checked)} />
        <span className="switch__track" aria-hidden="true" />
      </label>
      {body}
    </section>
  );
}

export function SolarSheet({ title, locality, meta, check, compare, withPlans, plansBlocked, onWithPlans, showPanels, onShowPanels, onDetails, onExplore, onSunlight }: {
  /** The street line of the address, as the sunlight screen heads it. */
  title: string;
  /** Suburb, state and postcode, when the address had them. */
  locality?: string;
  /** What the building is: the line under the address. */
  meta: string;
  /** The check shown: with the approved developments when they are switched on and change the roof. */
  check: SolarCheck | null;
  compare: PlansCompare;
  withPlans: boolean;
  /** This building is itself replaced by an approved development: no such figure. */
  plansBlocked: boolean;
  onWithPlans: (on: boolean) => void;
  /** On the roof: the panels laid out, or the light each part keeps. */
  showPanels: boolean;
  onShowPanels: (on: boolean) => void;
  /** "Details": the building's place card. */
  onDetails: () => void;
  /** "Explore the city": the explore screen. */
  onExplore: () => void;
  /** The sunlight screen for the same building: the other half of the switch. */
  onSunlight?: () => void;
}) {
  const t = useT();
  const [details, setDetails] = useState(false);
  const detailsId = useId();
  const status = !check ? '' : check.finding ? t('solar.status.finding') : check.done ? t('solar.status.measured') : t('solar.status.measuringPct', { pct: Math.round(check.progress * 100) });
  const kw = check ? (check.panels * PANEL_W) / 1000 : 0;
  const noRoof = check && !check.finding && check.candidateM2 === 0;

  return (
    <aside className="panel panel--left sheet solar-sheet" aria-labelledby="solar-title">
      {/*
        The same head as the sunlight screen — the way back, the address,
        "Details" — so the switch below it sits at the same height on both
        screens and does not jump when it is pressed.
      */}
      <SubjectHead existing title={title} locality={locality} meta={meta} backLabel={t('solar.sheet.back')} onBack={onExplore} onDetails={onDetails} />
      {onSunlight && <AnalysisSwitch current="solar" onSunlight={onSunlight} onSolar={() => undefined} />}
      <h3 className="sheet__lede solar-sheet__lede" id="solar-title" tabIndex={-1}>{t('solar.sheet.title')}</h3>
      <p className="visually-hidden" role="status" aria-live="polite">{status}</p>

      {noRoof && <p className="solar-card solar-card__note">{t('solar.sheet.noRoof')}</p>}

      {check && !noRoof && !check.done && (
        <section className="solar-card solar-hero solar-hero--pending" aria-label={t('solar.status.measuringLabel')}>
          <p className="solar-hero__label">{check.finding ? t('solar.status.finding') : t('solar.status.measuring')}</p>
          {!check.finding && (
            <div className="solar-progress" aria-hidden="true"><span style={{ width: `${Math.round(check.progress * 100)}%` }} /></div>
          )}
          <p className="solar-card__note">{t('solar.status.measuringNote')}</p>
        </section>
      )}

      {check?.done && !noRoof && (
        <>
          <section className="solar-card solar-hero" aria-label={t('solar.hero.label')}>
            <div className="solar-hero__top">
              <div>
                <p className="solar-hero__label">{check.panels > 0 ? t('solar.hero.about') : t('solar.hero.roomFor')}</p>
                <p className="solar-hero__figure">{richText(t(check.panels === 1 ? 'solar.hero.panelsOne' : 'solar.hero.panelsOther', { count: formatNumber(check.panels) }))}</p>
              </div>
              <PanelSunIcon />
            </div>
            <div className="solar-hero__foot">
              <span>{check.panels > 0
                ? t('solar.hero.where', { pct: pct(LIGHT_MIN) })
                : t('solar.hero.noPair', { pct: pct(LIGHT_MIN), metres: formatNumber(EDGE_SETBACK_M) })}</span>
              {check.panels > 0 && <span>{t('solar.hero.power', { kw: about(kw) })}</span>}
            </div>
          </section>

          {check.panels > 0 && (
            <section className="solar-card solar-energy" aria-label={t('solar.energy.label')}>
              <div className="solar-energy__top">
                <SunMeterIcon />
                <p className="solar-energy__figure">{richText(t('solar.energy.figure', { kwh: kwh(check.kwhYear) }))}</p>
              </div>
              <p className="solar-card__note">{t('solar.energy.note')}</p>
              <dl className="solar-tiles solar-tiles--units">
                <div><dt>{t('solar.energy.homes')}</dt><dd>{about(homesFor(check.kwhYear))}</dd></div>
                <div><dt>{t('solar.energy.co2')}</dt><dd>{about(co2TonnesFor(check.kwhYear))} <span>{t('solar.energy.tonnes')}</span></dd></div>
              </dl>
            </section>
          )}
        </>
      )}

      {check && !noRoof && <PlansCard compare={compare} plansBlocked={plansBlocked} withPlans={withPlans} onWithPlans={onWithPlans} />}

      {check && !check.finding && !noRoof && (
        <section aria-labelledby={`${detailsId}-roof`}>
          <div className="solar-section-head">
            <h3 className="solar-section" id={`${detailsId}-roof`}>{t('solar.roof.heading')}</h3>
            {check.done && check.panels > 0 && (
              <div className="solar-show" role="group" aria-label={t('solar.roof.showLabel')}>
                <button type="button" aria-pressed={showPanels} onClick={() => onShowPanels(true)}>{t('solar.roof.showPanels')}</button>
                <button type="button" aria-pressed={!showPanels} onClick={() => onShowPanels(false)}>{t('solar.roof.showLight')}</button>
              </div>
            )}
          </div>
          <dl className="solar-tiles">
            <div><dt>{t('solar.roof.whole')}</dt><dd>{m2(check.roofM2)} <span>m²</span></dd></div>
            <div><dt>{t('solar.roof.space')}</dt><dd>{m2(check.candidateM2)} <span>m²</span></dd></div>
          </dl>
          {check.done && (
            <dl className="solar-levels" aria-label={t('solar.levels.label')}>
              {levels().map(({ level, label }) => (
                <div key={level}>
                  <dt><span className="solar-swatch" style={{ background: SOLAR_LEVELS[level] }} aria-hidden="true" />{label}</dt>
                  <dd>{m2(check.levelM2[level])} <span>m²</span></dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}

      {check?.done && !noRoof && (
        <section className="solar-details">
          <h3 className="solar-details__heading">
            <button type="button" className="solar-details__toggle" aria-expanded={details} aria-controls={detailsId} onClick={() => setDetails((d) => !d)}>
              {details ? t('solar.details.hide') : t('solar.details.show')}
              <Icon name={details ? 'expand_less' : 'expand_more'} size={18} />
            </button>
          </h3>
          <div id={detailsId} className="solar-details__body" hidden={!details}>
            <h4>{t('solar.details.beforeHeading')}</h4>
            <p>{t('solar.details.plant')}</p>
            <p>{t(check.panelsByRule === 1 ? 'solar.details.byRuleOne' : 'solar.details.byRuleOther', { count: formatNumber(check.panelsByRule) })}</p>
            <h4>{t('solar.details.howHeading')}</h4>
            <p>{t('solar.details.panels', {
              watts: formatNumber(PANEL_W),
              length: formatNumber(Math.round(MODULE.lengthM * 1000)),
              width: formatNumber(Math.round(MODULE.widthM * 1000)),
              metres: formatNumber(EDGE_SETBACK_M),
            })}</p>
            <p>{t(check.layout?.frame === 'anchored' ? 'solar.details.frameAnchored' : 'solar.details.frameBallast', { metres: formatNumber(BALLAST_MAX_HEIGHT_M) })}</p>
            <p>{t('solar.details.light', { pct: pct(LIGHT_MIN) })}</p>
            <p>{t('solar.details.generation', { kwh: formatNumber(KWH_PER_KW) })}</p>
            <p>{t(withPlans ? 'solar.details.sunPlans' : 'solar.details.sunToday')}</p>
            <p>{t('solar.details.home', { kwh: formatNumber(HOUSEHOLD_KWH), kg: formatNumber(GRID_KG_CO2E_PER_KWH, { maximumFractionDigits: 3 }) })}</p>
            <p className="solar-details__last">{t('solar.details.last')}</p>
          </div>
        </section>
      )}
    </aside>
  );
}
