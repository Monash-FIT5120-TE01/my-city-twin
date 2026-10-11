/*
 * A year's generation put in terms people know: how many homes' electricity,
 * and how much carbon dioxide the grid would have emitted making it.
 *
 * HOUSEHOLD_KWH: the Essential Services Commission's "representative" home,
 *   "the average consumption assumes 4,000 kilowatt hours per year"
 *   (Victorian Default Offer 2026-27 Final Decision Paper, p.6, footnote 13;
 *   ProjectDoc/solar/references/pdf/esc-vdo-2026-27-final-decision.pdf).
 * GRID_KG_CO2E_PER_KWH: Victoria's scope 2 location-based factor for
 *   electricity from the grid, 0.74 kg CO2-e/kWh (National Greenhouse Accounts
 *   Factors 2026, Table 1; references/pdf/nga-factors-2026.pdf p.10). The
 *   scope 3 factor for network losses (0.11) is left out, so the saving is if
 *   anything understated.
 */
export const HOUSEHOLD_KWH = 4000;
export const GRID_KG_CO2E_PER_KWH = 0.74;

/** Homes whose year of electricity this matches. */
export function homesFor(kwhYear: number): number {
  return kwhYear / HOUSEHOLD_KWH;
}

/** Tonnes of CO2-e the grid would have emitted for the same electricity. */
export function co2TonnesFor(kwhYear: number): number {
  return (kwhYear * GRID_KG_CO2E_PER_KWH) / 1000;
}
