/*
 * The solar panel check's column, numbers first: how many panels the roof
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
import { BackLink } from './kit/BackLink';
import { Icon } from './kit/Icon';
import { CloseButton } from './kit/CloseButton';
import { SOLAR_LEVELS } from '../scene/SolarRoof';
import { KWH_PER_KW, LEVEL_FLOORS, PANEL_W, type SolarCheck } from '../scene/useSolarCheck';
import { EDGE_SETBACK_M, LIGHT_MIN } from '../scene/panelLayout';
import { BALLAST_MAX_HEIGHT_M, MODULE } from '../scene/panelModel';
import { co2TonnesFor, GRID_KG_CO2E_PER_KWH, homesFor, HOUSEHOLD_KWH } from '../scene/solarUnits';

/** The two runs of the check and the approved developments near enough to matter (App.tsx). */
export interface PlansCompare { now: SolarCheck | null; planned: SolarCheck | null; nearby: number; named: string[]; lostShown: boolean }

const m2 = (v: number) => Math.round(v).toLocaleString('en-AU');
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Two figures for small numbers, whole ones from ten up. */
const about = (v: number) => (v < 10 ? v.toLocaleString('en-AU', { maximumFractionDigits: 1 }) : Math.round(v).toLocaleString('en-AU'));
/** A year's kWh to the nearest hundred: the method is not finer than that. */
const kwh = (v: number) => (Math.round(v / 100) * 100).toLocaleString('en-AU');
/** A change in a year's kWh, signed; under fifty, which rounds to nothing, said as such. */
const kwhChange = (v: number) => (Math.abs(v) < 50 ? (v === 0 ? '±0' : 'under 100') : signed(v, kwh));
/** A change smaller than this share of today's generation, with the same panels, is shown as none. */
const UNCHANGED_SHARE = 0.005;
const signed = (v: number, f: (x: number) => string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${f(Math.abs(v))}`;

/** Best first, as the key reads. */
const LEVELS = [
  { level: 4, label: `${pct(LEVEL_FLOORS[0])}+ of the light` },
  { level: 3, label: `${pct(LEVEL_FLOORS[1])}–${pct(LEVEL_FLOORS[0])}` },
  { level: 2, label: `${pct(LEVEL_FLOORS[2])}–${pct(LEVEL_FLOORS[1])}` },
  { level: 1, label: `Under ${pct(LEVEL_FLOORS[2])}` },
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
  const { now, planned, nearby, named } = compare;
  let body: ReactNode;
  if (plansBlocked) body = <p className="solar-card__note">An approved development replaces this building.</p>;
  else if (!now?.done) body = null;
  else if (!nearby) body = <p className="solar-card__note">None rises 2° or more above this roof, so none is counted as shading it.</p>;
  else if (!planned?.done) body = <p className="solar-card__note">Measuring the roof with them built… {planned ? Math.round(planned.progress * 100) : 0}%</p>;
  else {
    const dKwh = planned.kwhYear - now.kwhYear, dPanels = planned.panels - now.panels;
    const fromNone = now.kwhYear === 0;
    const share = fromNone ? 0 : dKwh / now.kwhYear;
    const unchanged = dPanels === 0 && (fromNone ? planned.kwhYear === 0 : Math.abs(share) < UNCHANGED_SHARE);
    body = unchanged ? (
      <p className="solar-card__note">
        {dKwh === 0 ? 'No change to the panels or their generation.' : 'The same panels, and less than 0.5% change in their generation.'}
      </p>
    ) : (
      <>
        <p className="solar-diff__main">
          {fromNone
            ? <><strong>New</strong> room for panels, where today there is none</>
            : <><strong>{signed(share * 100, (x) => `${x < 10 ? x.toFixed(1) : Math.round(x)}%`)}</strong> generation</>}
        </p>
        <dl className="solar-diff__units">
          <div><dt>Panels</dt><dd>{signed(dPanels, (x) => x.toLocaleString('en-AU'))}</dd></div>
          <div><dt>kWh / year</dt><dd>{kwhChange(dKwh)}</dd></div>
          <div><dt>Homes</dt><dd>{signed(homesFor(dKwh), about)}</dd></div>
        </dl>
        <p className="solar-card__note">
          {named.length
            ? <>Rising highest over the roof on the sun's side: {named.slice(0, 3).map((a) => a.split(/ MELBOURNE|, Melbourne/)[0]).join('; ')}.</>
            : `${nearby} could reach the roof, none more than 5° above it on the sun's side.`}
        </p>
        {withPlans && compare.lostShown && <p className="solar-card__note">Hatched on the roof: light enough today, not with them built.</p>}
      </>
    );
  }
  return (
    <section className="solar-card solar-plans-card" aria-label="Approved developments">
      <label className="switch solar-plans">
        <span className="switch__text">
          <span className="switch__name">Include approved developments</span>
          <span className="switch__note">Built, with the buildings they replace taken down</span>
        </span>
        <input type="checkbox" className="switch__input" checked={withPlans} disabled={plansBlocked} onChange={(e) => onWithPlans(e.target.checked)} />
        <span className="switch__track" aria-hidden="true" />
      </label>
      {body}
    </section>
  );
}

export function SolarSheet({ title, check, compare, withPlans, plansBlocked, onWithPlans, showPanels, onShowPanels, onBack, onClose }: {
  title: string;
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
  onBack: () => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState(false);
  const detailsId = useId();
  const status = !check ? '' : check.finding ? 'Finding the roof…' : check.done ? 'Measured' : `Measuring the shade… ${Math.round(check.progress * 100)}%`;
  const kw = check ? (check.panels * PANEL_W) / 1000 : 0;
  const noRoof = check && !check.finding && check.candidateM2 === 0;

  return (
    <aside className="panel panel--left sheet solar-sheet" aria-labelledby="solar-title">
      <div className="sheet__head">
        <BackLink onClick={onBack}>Back</BackLink>
        <CloseButton label="Close the solar panel check" onClick={onClose} />
      </div>
      <div>
        <h2 className="panel-title sheet__title" id="solar-title" tabIndex={-1}>Solar panels</h2>
        <p className="sheet__meta">{title}</p>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite">{status}</p>

      {noRoof && <p className="solar-card solar-card__note">This building has no roof that a panel fits on.</p>}

      {check && !noRoof && !check.done && (
        <section className="solar-card solar-hero solar-hero--pending" aria-label="Measuring">
          <p className="solar-hero__label">{check.finding ? 'Finding the roof…' : 'Measuring the shade'}</p>
          {!check.finding && (
            <div className="solar-progress" aria-hidden="true"><span style={{ width: `${Math.round(check.progress * 100)}%` }} /></div>
          )}
          <p className="solar-card__note">The sun from every point of the roof through a year, against every building in the model.</p>
        </section>
      )}

      {check?.done && !noRoof && (
        <>
          <section className="solar-card solar-hero" aria-label="Panels">
            <div className="solar-hero__top">
              <div>
                <p className="solar-hero__label">{check.panels > 0 ? 'About' : 'Room for'}</p>
                <p className="solar-hero__figure"><strong>{check.panels.toLocaleString('en-AU')}</strong> panels</p>
              </div>
              <PanelSunIcon />
            </div>
            <div className="solar-hero__foot">
              <span>{check.panels > 0
                ? `Where they keep ${pct(LIGHT_MIN)}+ of the light`
                : `No pair fits: too little roof keeps ${pct(LIGHT_MIN)}+ of the light, ${EDGE_SETBACK_M} m in from the edges`}</span>
              {check.panels > 0 && <span>Power ≈{about(kw)} kW</span>}
            </div>
          </section>

          {check.panels > 0 && (
            <section className="solar-card solar-energy" aria-label="Generation">
              <div className="solar-energy__top">
                <SunMeterIcon />
                <p className="solar-energy__figure"><strong>{kwh(check.kwhYear)}</strong> kWh / year</p>
              </div>
              <p className="solar-card__note">With the shade counted, panel by panel.</p>
              <dl className="solar-tiles solar-tiles--units">
                <div><dt>Homes' electricity</dt><dd>{about(homesFor(check.kwhYear))}</dd></div>
                <div><dt>Grid CO₂ for the same power</dt><dd>{about(co2TonnesFor(check.kwhYear))} <span>t / year</span></dd></div>
              </dl>
            </section>
          )}
        </>
      )}

      {check && !noRoof && <PlansCard compare={compare} plansBlocked={plansBlocked} withPlans={withPlans} onWithPlans={onWithPlans} />}

      {check && !check.finding && !noRoof && (
        <section aria-labelledby={`${detailsId}-roof`}>
          <div className="solar-section-head">
            <h3 className="solar-section" id={`${detailsId}-roof`}>Roof space</h3>
            {check.done && check.panels > 0 && (
              <div className="solar-show" role="group" aria-label="On the roof">
                <button type="button" aria-pressed={showPanels} onClick={() => onShowPanels(true)}>Panels</button>
                <button type="button" aria-pressed={!showPanels} onClick={() => onShowPanels(false)}>Light</button>
              </div>
            )}
          </div>
          <dl className="solar-tiles">
            <div><dt>Whole roof</dt><dd>{m2(check.roofM2)} <span>m²</span></dd></div>
            <div><dt>Big enough</dt><dd>{m2(check.candidateM2)} <span>m²</span></dd></div>
          </dl>
          {check.done && (
            <dl className="solar-levels" aria-label="How much of a year's light the roof keeps">
              {LEVELS.map(({ level, label }) => (
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
              {details ? 'Hide details' : 'See details'}
              <Icon name={details ? 'expand_less' : 'expand_more'} size={18} />
            </button>
          </h3>
          <div id={detailsId} className="solar-details__body" hidden={!details}>
            <h4>Before you install</h4>
            <p>Air-conditioning, hot water and other plant the model does not show, and what the roof's structure can carry, still need checking on site.</p>
            <p>By the building code's shade test instead (NCC J9D5: shaded no more than a quarter of daylight hours), {check.panelsByRule.toLocaleString('en-AU')} panels.</p>
            <h4>How we counted</h4>
            <p>Panels: {PANEL_W} W, {Math.round(MODULE.lengthM * 1000).toLocaleString('en-AU')} × {Math.round(MODULE.widthM * 1000).toLocaleString('en-AU')} mm, in pairs facing east and west at 10°, {EDGE_SETBACK_M} m in from the roof's edges.</p>
            <p>{check.layout?.frame === 'anchored'
              ? `Frame: fixed to the slab with anchors (buildings over ${BALLAST_MAX_HEIGHT_M} m, too high for ballast).`
              : `Frame: held down by concrete blocks (buildings up to ${BALLAST_MAX_HEIGHT_M} m).`}</p>
            <p>Light: the sun's direct light where it reaches each part of the roof, and the sky's by how much of it is seen, against the same panel with nothing around it; a pair goes only where every part of it keeps {pct(LIGHT_MIN)} (75% of the best a panel facing north could get).</p>
            <p>Generation: {KWH_PER_KW.toLocaleString('en-AU')} kWh per kW a year unshaded (PVGIS), times the light each panel keeps.</p>
            <p>Sun: the 21st of each month, every ten minutes. Shade: every building in the model{withPlans ? ', with the approved developments built and the buildings they replace removed' : ', as it stands today'}. Trees are not included.</p>
            <p>A home: {HOUSEHOLD_KWH.toLocaleString('en-AU')} kWh a year (Essential Services Commission, Victorian Default Offer 2026–27). Grid CO₂: {GRID_KG_CO2E_PER_KWH} kg CO₂-e per kWh (National Greenhouse Accounts Factors 2026) — an equivalent, not a measured cut.</p>
            <p className="solar-details__last">Check the roof on site before installing.</p>
          </div>
        </section>
      )}
    </aside>
  );
}
