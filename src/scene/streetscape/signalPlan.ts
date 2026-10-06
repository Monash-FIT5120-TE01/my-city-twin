/*
 * SIGNAL TIMING — how long each CBD intersection gives each road, from what has been published.
 *
 * WHAT IS SOURCED
 *   Amber 3.0 s at 40 km/h and an all-red of about 2 s for a 20-30 m crossing: DTP, Supplement to Austroads
 *   Guide to Traffic Management Part 9 (v2.0, 2023), Tables 2 and 3. Pedestrian walk comes up automatically
 *   with the parallel green in the CBD (DTP; Victoria Walks), so there is no push to wait for.
 *   Cycle lengths along Bourke St, timed in the field (Daniel Bowen, 2014): Swanston 60 s (30/30),
 *   Elizabeth 70 s (35/35), Queen 90 s (Bourke 40 / Queen 50), William 90 s (30/60), King 100 s (30/70).
 *
 * WHAT IS ESTIMATED
 *   No cycle lengths are published. Each intersection takes the cycle and split timed at Bourke St for its
 *   north-south street; the other north-south streets (Spencer, Russell, Exhibition, Spring and the rest)
 *   80 s, half each. Little streets give the main street two thirds. Mid-block crossings (POS): 70 s, 20 s
 *   of it for people crossing. Offsets between intersections are not published; each site's comes from its
 *   id, so neighbours are not in step (CBD signals are not a tram green wave: Bowen, 2014). SCATS varies all
 *   of this by time of day and gives trams priority; neither is modelled.
 *
 * ROADS
 *   A is traffic along the grid's north-south axis, B along east-west (build-streetscape.mjs). A phase is the
 *   green of one road followed by amber and all-red; pedestrians walk across the other road during it.
 */

export const AMBER_S = 3, ALL_RED_S = 2;
/** Flashing red (pedestrian clearance) before the parallel amber: about a 20 m crossing at 1.5 m/s. */
const CLEAR_S = 13;

/** [cycle s, share of it for road A (north-south)] by the north-south street (Bowen 2014; others EST). */
const BY_NS_STREET: Record<string, [number, number]> = {
  SWANSTON: [60, 0.5], ELIZABETH: [70, 0.5], QUEEN: [90, 50 / 90], WILLIAM: [90, 60 / 90], KING: [100, 0.7],
};
const DEFAULT_PLAN: [number, number] = [80, 0.5];

export interface SignalPlan { cycle: number; aEnd: number; offset: number; flashing: boolean }

/** The plan of one site, from its name ("NORTH-SOUTH/EAST-WEST"), type and id. */
export function planFor(site: { id: string; name: string; type: string }): SignalPlan {
  const offset = (parseInt(site.id, 10) * 7.3) % 100 || 0;
  if (/FLASH/i.test(site.type)) return { cycle: 60, aEnd: 60, offset, flashing: true };
  if (site.type === 'POS') return { cycle: 70, aEnd: 50, offset, flashing: false };
  const [ns = '', ew = ''] = site.name.toUpperCase().split('/').map((s) => s.trim());
  const key = Object.keys(BY_NS_STREET).find((k) => ns.startsWith(k));
  const [cycle, share0] = key ? BY_NS_STREET[key] : DEFAULT_PLAN;
  const share = /^LITTLE /.test(ew) || /LANE$/.test(ew) ? Math.max(share0, 2 / 3) : share0;
  return { cycle, aEnd: Math.round(cycle * share), offset, flashing: false };
}

/** 2 green, 1 amber, 0 red for roads A and B, and which road pedestrians may walk across. */
export interface Phase { A: number; B: number; walk: 'A' | 'B' | null }

/**
 * The phase at time t (s). Road A's phase runs [0, aEnd): green, then amber, then all-red; road B's phase
 * runs [aEnd, cycle) the same way. People walk across B while A is green, until the clearance begins.
 */
export function phaseOf(plan: SignalPlan, t: number): Phase {
  if (plan.flashing) return { A: 2, B: 2, walk: null };
  const x = (((t + plan.offset) % plan.cycle) + plan.cycle) % plan.cycle;
  const inA = x < plan.aEnd, start = inA ? 0 : plan.aEnd, end = inA ? plan.aEnd : plan.cycle, into = x - start;
  const green = end - start - AMBER_S - ALL_RED_S;
  const state = into < green ? 2 : into < green + AMBER_S ? 1 : 0;
  const walk = state === 2 && into < Math.max(6, green - CLEAR_S) ? (inA ? 'B' : 'A') : null;
  return inA ? { A: state, B: 0, walk } : { A: 0, B: state, walk };
}
