/*
 * "Sunlight | Solar panels": the two things the app can work out about a
 * building that is standing, as one switch at the top of either screen.
 *
 * The solar check used to be reachable only from the place card, after a
 * double-click on the building — nothing on the sunlight screen said it
 * existed. Both screens are now the same column, so the switch sits in the
 * same place on both and goes both ways.
 *
 * Each half is a button that moves to the other screen, so the one showing
 * is marked aria-current rather than being a tab with a panel. The current
 * one is told by its white lifted ground, its weight and aria-current — not
 * by a colour. Styles: kit.css.
 */

import { Icon } from './Icon';

export type Analysis = 'sunlight' | 'solar';

export function AnalysisSwitch({
  current,
  onSunlight,
  onSolar,
}: {
  current: Analysis;
  onSunlight: () => void;
  onSolar: () => void;
}) {
  const half = (which: Analysis, label: string, icon: 'light_mode' | 'solar_power', go: () => void) => {
    const on = current === which;
    return (
      <button
        type="button"
        className={`analysis-switch__half${on ? ' analysis-switch__half--on' : ''}`}
        aria-current={on ? 'page' : undefined}
        onClick={on ? undefined : go}
      >
        <Icon name={icon} size={20} />
        {label}
      </button>
    );
  };
  return (
    <nav className="analysis-switch" aria-label="What to work out for this building">
      {half('sunlight', 'Sunlight', 'light_mode', onSunlight)}
      {half('solar', 'Solar panels', 'solar_power', onSolar)}
    </nav>
  );
}
