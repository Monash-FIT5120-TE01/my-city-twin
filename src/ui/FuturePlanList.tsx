/*
 * ─────────────────────────────────────────────────────────────────────────
 * FUTURE PLANS — FINDING ONE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The list half of FuturePlansPage: the page's head with a search field,
 * a bar that stays at the top while the cards scroll (the kind of plan, the
 * theme, how many are showing), and the cards.
 *
 * HOW SOMEBODY FINDS A PLAN
 *   - By a word: the field matches the plan's name and its theme, so
 *     "Bourke", "tram" and "park" all work. The matched words are marked in
 *     the card's name.
 *   - By kind: projects, or the city-wide programmes (footpath renewal,
 *     tree planting, cameras…), which are not single projects and read as
 *     one more project when mixed in.
 *   - By theme: nine broad themes (streets, transport, parks…), the
 *     commonest first, each with its count and its mark. The API has
 *     eighteen topics, half of them with one plan; eighteen chips were a
 *     second list to read before the first.
 *   The three combine, the count says what is left, and one press clears
 *   them all.
 *
 * COLOUR
 *   Every theme has a mark (a leaf, a road, a train…) and its name on the
 *   card. The tint behind the mark is decoration on top of that, never the
 *   only way two themes differ. The chosen kind and theme carry a tick and
 *   aria-pressed as well as their filled ground.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { FuturePlan } from '../data/useFuturePlans';
import { CloseButton } from './kit/CloseButton';
import { Icon, type IconName } from './kit/Icon';

/** The position in a list, for the CSS stagger. */
export const nth = (i: number) => ({ '--i': i }) as CSSProperties;

/** A city-wide programme or a planning watch, rather than one project. */
export const isProgramme = (plan: FuturePlan) => /programmes|watchlist/i.test(plan.topic);

type Kind = 'all' | 'projects' | 'programmes';

const KINDS: { kind: Kind; label: string; short: string }[] = [
  { kind: 'all', label: 'All plans', short: 'All' },
  { kind: 'projects', label: 'Projects', short: 'Projects' },
  { kind: 'programmes', label: 'City-wide programmes', short: 'Programmes' },
];

const ofKind = (plans: FuturePlan[], kind: Kind) =>
  kind === 'all' ? plans : plans.filter((p) => isProgramme(p) === (kind === 'programmes'));

/** Lower case, accents off, so "Laak Boorndap" and "laak" meet. */
const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const wordsOf = (query: string) => fold(query).split(/\s+/).filter(Boolean);

/** Every word typed is somewhere in the name or the theme. */
const matches = (plan: FuturePlan, words: string[]) => {
  const hay = fold(`${plan.name} ${plan.topic}`);
  return words.every((word) => hay.includes(word));
};

export function PlanFinder({ plans, onOpen }: { plans: FuturePlan[]; onOpen: (id: number) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [theme, setTheme] = useState<Family | null>(null);

  // The heading takes the keyboard on arrival, as PageHead does elsewhere.
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  const words = useMemo(() => wordsOf(query), [query]);
  const ofThisKind = useMemo(() => ofKind(plans, kind), [plans, kind]);

  /** The broad themes of the kind chosen, the commonest first, each with its count. */
  const themes = useMemo(() => {
    const counts = new Map<Family, number>();
    for (const p of ofThisKind) {
      const family = themeFamily(p.topic);
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    // Ordered by the whole kind, so the chips do not jump about while somebody
    // types; counted with the search, so a chip never promises plans that the
    // search then hides.
    return [...counts]
      .sort((a, b) => b[1] - a[1] || FAMILY_NAMES[a[0]].localeCompare(FAMILY_NAMES[b[0]]))
      .map(
        ([family]) =>
          [
            family,
            ofThisKind.filter((p) => themeFamily(p.topic) === family && matches(p, words)).length,
          ] as const,
      );
  }, [ofThisKind, words]);

  const shown = ofThisKind.filter(
    (p) => (!theme || themeFamily(p.topic) === theme) && matches(p, words),
  );
  const narrowed = words.length > 0 || kind !== 'all' || theme !== null;

  const clear = () => {
    setQuery('');
    setKind('all');
    setTheme(null);
  };

  /*
   * With every kind showing, the two kinds are still two groups, so the
   * programmes do not read as more projects. Otherwise one grid.
   */
  const groups =
    kind === 'all'
      ? [
          { key: 'projects', title: 'Projects', note: null, plans: shown.filter((p) => !isProgramme(p)) },
          {
            key: 'programmes',
            title: 'City-wide programmes',
            note: 'Ongoing work across many streets, and plans still being watched — not single projects.',
            plans: shown.filter(isProgramme),
          },
        ].filter((g) => g.plans.length > 0)
      : [{ key: kind, title: null, note: null, plans: shown }];

  return (
    <>
      <div className="future__hero">
        <div className="future__hero-words">
          <p className="future__eyebrow">Melbourne CBD · Future plans</p>
          <h1 className="page-title" id="future-page-title" ref={heading} tabIndex={-1}>
            A changing city. Your everyday questions.
          </h1>
          <p className="page-lede">Choose a plan. Ask what it could mean for your day.</p>
        </div>
        <div className="future__search">
          <label className="future__search-label" htmlFor="future-plan-search">
            Search plans
          </label>
          <div className="future__find">
            <SearchMark />
            <input
              id="future-plan-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search plan name or theme"
              aria-describedby="future-search-help"
              autoComplete="off"
            />
            {query && <CloseButton label="Clear the search" onClick={() => setQuery('')} />}
          </div>
          <p id="future-search-help" className="future__search-help">
            Matches plan names and themes.
          </p>
        </div>
      </div>

      <section className="future__browse" aria-labelledby="future-list-title">
        <div className="future__browse-head">
          <p className="future__eyebrow">Explore a plan</p>
          <h2 className="panel-title" id="future-list-title">
            Which change are you curious about?
          </h2>
          <p className="future__lead">Choose a plan, then pick a question to explore what’s changing.</p>
        </div>

        {/* Stays at the top of the page while the cards scroll under it. */}
        <div className="future__bar">
          <div className="future__kinds" role="group" aria-label="Kind of plan">
            {KINDS.map(({ kind: k, label, short }) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  className={`future__kind${on ? ' future__kind--on' : ''}`}
                  aria-pressed={on}
                  onClick={() => {
                    setKind(k);
                    setTheme(null);
                  }}
                >
                  {on && <Tick />}
                  <span className="future__wide">{label}</span>
                  <span className="future__narrow">{short}</span>
                  <span className="future__n">{ofKind(plans, k).length}</span>
                </button>
              );
            })}
          </div>

          <ul className="future__themes" role="list" aria-label="Theme">
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
                    {FAMILY_NAMES[name]}
                    <span className="future__n">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="future__result">
            <p aria-live="polite">
              Showing <strong>{shown.length}</strong> of {plans.length} plans
            </p>
            {narrowed && (
              <button type="button" className="future__reset" onClick={clear}>
                Clear filters
              </button>
            )}
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="future__none">
            <p className="card-title">No plans match.</p>
            <p>Try another word, or clear the filters to see every plan.</p>
            <button type="button" className="future__reset" onClick={clear}>
              Clear filters
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
                      <PlanCard plan={plan} words={words} onOpen={onOpen} />
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

function PlanCard({
  plan,
  words,
  onOpen,
}: {
  plan: FuturePlan;
  words: string[];
  onOpen: (id: number) => void;
}) {
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
      <span className="future__plan-name">{marked(plan.name, words)}</span>
      <span className="future__plan-go">
        Open a conversation
        <span className="future__plan-arrow" aria-hidden="true">
          <Icon name="arrow_forward" size={18} />
        </span>
      </span>
    </button>
  );
}

/** The name with the words typed marked in it. */
function marked(name: string, words: string[]): ReactNode {
  if (words.length === 0) return name;
  const folded = fold(name);
  // fold() keeps the length of plain Latin text, which every plan name is.
  if (folded.length !== name.length) return name;
  const hit = new Array<boolean>(name.length).fill(false);
  for (const word of words) {
    let at = folded.indexOf(word);
    while (at !== -1) {
      for (let i = at; i < at + word.length; i++) hit[i] = true;
      at = folded.indexOf(word, at + word.length);
    }
  }
  const parts: ReactNode[] = [];
  let start = 0;
  for (let i = 1; i <= name.length; i++) {
    if (i === name.length || hit[i] !== hit[start]) {
      const text = name.slice(start, i);
      parts.push(hit[start] ? <mark key={start}>{text}</mark> : text);
      start = i;
    }
  }
  return parts;
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

/** The broad themes, by name, for the chips. */
const FAMILY_NAMES: Record<Family, string> = {
  streets: 'Streets & public space',
  transport: 'Transport & stations',
  parks: 'Parks & recreation',
  water: 'Riverfront & waterfront',
  trees: 'Trees & greening',
  bridges: 'Bridges',
  walking: 'Walking & cycling',
  tech: 'City infrastructure',
  planning: 'Planning',
};

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

function SearchMark() {
  return <Icon name="search" size={22} className="future__find-mark" />;
}
