/*
 * ─────────────────────────────────────────────────────────────────────────
 * FUTURE PLANS — FINDING ONE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The list half of FuturePlansPage: the page's head, a bar that stays at
 * the top while the cards scroll (the kind of plan, the theme, how many are
 * showing), and the cards. There is no search field: thirty-odd plans are
 * found by kind and theme (removed 2026-10-21, as in the team's redesign).
 *
 * HOW SOMEBODY FINDS A PLAN
 *   - By kind: projects, or the city-wide programmes (footpath renewal,
 *     tree planting, cameras…), which are not single projects and read as
 *     one more project when mixed in.
 *   - By theme: nine broad themes (streets, transport, parks…), the
 *     commonest first, each with its count and its mark. The API has
 *     eighteen topics, half of them with one plan; eighteen chips were a
 *     second list to read before the first.
 *   The two combine, the count says what is left, and one press clears
 *   them both.
 *
 * COLOUR
 *   Every theme has a mark (a leaf, a road, a train…) and its name on the
 *   card. The tint behind the mark is decoration on top of that, never the
 *   only way two themes differ. The chosen kind and theme carry a tick and
 *   aria-pressed as well as their filled ground.
 */

import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import type { FuturePlan } from '../data/useFuturePlans';
import { Icon, type IconName } from './kit/Icon';
import { richText } from './KeyHints';
import { formatNumber, t, useLocale } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';

/** The position in a list, for the CSS stagger. */
export const nth = (i: number) => ({ '--i': i }) as CSSProperties;

/** A city-wide programme or a planning watch, rather than one project. */
export const isProgramme = (plan: FuturePlan) => /programmes|watchlist/i.test(plan.topic);

type Kind = 'all' | 'projects' | 'programmes';

/**
 * What the list is narrowed to. Kept by FuturePlansPage rather than here, so
 * opening a plan and coming back with "Choose another plan" finds the list
 * as it was left.
 */
export interface PlanFilters {
  kind: Kind;
  theme: Family | null;
}

export const NO_FILTERS: PlanFilters = { kind: 'all', theme: null };

const KINDS: { kind: Kind; label: MessageKey; short: MessageKey }[] = [
  { kind: 'all', label: 'future.kinds.all', short: 'future.kinds.allShort' },
  { kind: 'projects', label: 'future.kinds.projects', short: 'future.kinds.projectsShort' },
  { kind: 'programmes', label: 'future.kinds.programmes', short: 'future.kinds.programmesShort' },
];

const ofKind = (plans: FuturePlan[], kind: Kind) =>
  kind === 'all' ? plans : plans.filter((p) => isProgramme(p) === (kind === 'programmes'));

export function PlanFinder({
  plans,
  onOpen,
  filters,
  onFilters,
}: {
  plans: FuturePlan[];
  onOpen: (id: number) => void;
  filters: PlanFilters;
  onFilters: (next: PlanFilters) => void;
}) {
  // Drawn again in a new language; the theme chips are ordered by their names in it.
  const locale = useLocale();
  const { kind, theme } = filters;
  const setTheme = (next: Family | null) => onFilters({ ...filters, theme: next });

  /*
   * The heading takes the keyboard on arrival, as PageHead does elsewhere —
   * but only if nothing else has it. The list appears when the plans have
   * loaded, and somebody who moved to the header meanwhile must not be
   * pulled back. Coming back from a plan, the button that was pressed has
   * gone, so the heading takes it then.
   */
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body || active.id === 'future-page-title') {
      heading.current?.focus({ preventScroll: true });
    }
  }, []);

  const ofThisKind = useMemo(() => ofKind(plans, kind), [plans, kind]);

  /** The broad themes of the kind chosen, the commonest first, each with its count. */
  const themes = useMemo(() => {
    const counts = new Map<Family, number>();
    for (const p of ofThisKind) {
      const family = themeFamily(p.topic);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1] || familyName(a[0]).localeCompare(familyName(b[0])))
      .map(([family, count]) => [family, count] as const);
  }, [ofThisKind, locale]);

  const shown = ofThisKind.filter((p) => !theme || themeFamily(p.topic) === theme);
  const narrowed = kind !== 'all' || theme !== null;

  const clear = () => onFilters(NO_FILTERS);

  /*
   * With every kind showing, the two kinds are still two groups, so the
   * programmes do not read as more projects. Otherwise one grid.
   */
  const groups =
    kind === 'all'
      ? [
          { key: 'projects', title: t('future.group.projects'), note: null, plans: shown.filter((p) => !isProgramme(p)) },
          {
            key: 'programmes',
            title: t('future.group.programmes'),
            note: t('future.group.programmesNote'),
            plans: shown.filter(isProgramme),
          },
        ].filter((g) => g.plans.length > 0)
      : [{ key: kind, title: null, note: null, plans: shown }];

  return (
    <>
      <div className="future__hero">
        <div className="future__hero-words">
          <p className="future__eyebrow">{t('future.eyebrow')}</p>
          <h1 className="page-title" id="future-page-title" ref={heading} tabIndex={-1}>
            {t('future.title')}
          </h1>
          <p className="page-lede">{t('future.lede')}</p>
        </div>
      </div>

      <section className="future__browse" aria-labelledby="future-list-title">
        <div className="future__browse-head">
          <p className="future__eyebrow">{t('future.browse.eyebrow')}</p>
          <h2 className="panel-title" id="future-list-title">
            {t('future.browse.title')}
          </h2>
          <p className="future__lead">{t('future.browse.lead')}</p>
        </div>

        {/* Stays at the top of the page while the cards scroll under it. */}
        <div className="future__bar">
          <div className="future__kinds" role="group" aria-label={t('future.kinds.label')}>
            {KINDS.map(({ kind: k, label, short }) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  className={`future__kind${on ? ' future__kind--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onFilters({ ...filters, kind: k, theme: null })}
                >
                  {on && <Tick />}
                  <span className="future__wide">{t(label)}</span>
                  <span className="future__narrow">{t(short)}</span>
                  <span className="future__n">{ofKind(plans, k).length}</span>
                </button>
              );
            })}
          </div>

          <ul className="future__themes" role="list" aria-label={t('future.themes.label')}>
            {themes.map(([name, count]) => {
              const on = theme === name;
              return (
                <li key={name}>
                  <button
                    type="button"
                    className={`future__theme${on ? ' future__theme--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => setTheme(on ? null : name)}
                  >
                    {on ? <Tick /> : <FamilyMark family={name} />}
                    {familyName(name)}
                    <span className="future__n">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="future__result">
            <p aria-live="polite">
              {richText(t('future.result.showing'), {
                shown: formatNumber(shown.length),
                total: formatNumber(plans.length),
              })}
            </p>
            {narrowed && (
              <button type="button" className="future__reset" onClick={clear}>
                {t('future.result.clear')}
              </button>
            )}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="future__none">
            <p className="card-title">{t('future.none.title')}</p>
            <p>{t('future.none.body')}</p>
            <button type="button" className="future__reset" onClick={clear}>
              {t('future.result.clear')}
            </button>
          </div>
        ) : (
          /* Keyed by kind and theme, so the cards come in again when they change. */
          <div className="future__groups" key={`${kind}|${theme ?? ''}`}>
            {groups.map((group) => (
              <section
                key={group.key}
                className="future__group"
                aria-label={group.title ?? undefined}
              >
                {group.title && (
                  <div className="future__group-head">
                    <h3 className="card-title">
                      {group.title} <span className="future__n">{group.plans.length}</span>
                    </h3>
                    {group.note && <p className="future__group-note">{group.note}</p>}
                  </div>
                )}
                <ol className="future__grid" role="list">
                  {group.plans.map((plan, i) => (
                    <li key={plan.id} style={nth(i)}>
                      <PlanCard plan={plan} onOpen={onOpen} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function PlanCard({ plan, onOpen }: { plan: FuturePlan; onOpen: (id: number) => void }) {
  useLocale();
  return (
    <button
      type="button"
      className="future__plan"
      data-family={themeFamily(plan.topic)}
      onClick={() => onOpen(plan.id)}
    >
      <span className="future__plan-top">
        <span className="future__plan-mark">
          <ThemeMark topic={plan.topic} />
        </span>
        <span className="future__plan-topic">{plan.topic}</span>
      </span>
      <span className="future__plan-name">{plan.name}</span>
      <span className="future__plan-go">
        {t('future.card.open')}
        <span className="future__plan-arrow" aria-hidden="true">
          <Icon name="arrow_forward" size={18} />
        </span>
      </span>
    </button>
  );
}

/* ── the marks ───────────────────────────────────────────── */

type Family =
  | 'trees'
  | 'water'
  | 'transport'
  | 'bridges'
  | 'walking'
  | 'parks'
  | 'streets'
  | 'tech'
  | 'planning';

/** The broad theme's name, for the chips, in the language chosen. */
const familyName = (family: Family): string => t(`future.family.${family}`);

/**
 * Which broad theme a topic belongs to, read from its words. The first that
 * fits wins. Words are matched from their start: "streets" has "tree" in it.
 */
export function themeFamily(topic: string): Family {
  const t = topic.toLowerCase();
  if (/\b(tree|green|forest|shade)/.test(t)) return 'trees';
  if (/river|water|harbour/.test(t)) return 'water';
  if (/transport|station|rail|tram/.test(t)) return 'transport';
  if (/bridge|crossing/.test(t)) return 'bridges';
  if (/walk|cycl/.test(t)) return 'walking';
  if (/park|recreation/.test(t)) return 'parks';
  if (/infrastructure|camera|sensor/.test(t)) return 'tech';
  if (/planning|watch|strateg/.test(t)) return 'planning';
  return 'streets';
}

/** The icon for each broad theme. */
const MARKS: Record<Family, IconName> = {
  trees: 'eco',
  water: 'water',
  transport: 'train',
  bridges: 'conversion_path',
  walking: 'directions_walk',
  parks: 'park',
  streets: 'road',
  tech: 'sensors',
  planning: 'description',
};

export function ThemeMark({ topic }: { topic: string }) {
  return <FamilyMark family={themeFamily(topic)} />;
}

function FamilyMark({ family }: { family: Family }) {
  return <Icon name={MARKS[family]} size={20} className="future__mark" />;
}

function Tick() {
  return <Icon name="check" size={18} className="future__tick" />;
}
