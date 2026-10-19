/*
 * ─────────────────────────────────────────────────────────────────────────
 * FUTURE PLANS — A PLAN, AND THE QUESTIONS SOMEBODY MIGHT ASK OF IT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The page the header's "Future plans" opens (?view=future). A cream page
 *   over the city, like How it works.
 *
 * TWO STATES
 *   - The list: searched, and narrowed by kind and theme — see
 *     FuturePlanList.tsx. Pressing a card opens its conversation, and the
 *     plan goes into the address (&plan=3) so a reload or a shared link
 *     reopens it.
 *   - The conversation: the plan's head, the thread, and beside it the
 *     plans that share its theme. The questions are inside the thread —
 *     see "WHERE THE QUESTIONS ARE" below. Choosing one adds it and its
 *     answer to the thread, with the answer's sources and the date each
 *     was checked.
 *
 * WHAT IT DOES NOT DO
 *   Nothing is generated. Every answer is a saved one from the API; the
 *   "conversation" is the order the reader chose to read them in. The short
 *   pause before an answer is only a pause, and is skipped for somebody who
 *   asked their system for less motion.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useFuturePlanQuestions,
  useFuturePlans,
  type FuturePlan,
  type FuturePlanQuestion,
} from '../data/useFuturePlans';
import { NO_FILTERS, nth, PlanFinder, ThemeMark, type PlanFilters } from './FuturePlanList';
import { Button } from './kit/Button';
import { Icon } from './kit/Icon';
import { ChevronLeft } from './kit/icons';
import { PageHead } from './kit/PageHead';
import { Pill } from './kit/Pill';
import { TextButton } from './kit/TextButton';
import { useReducedMotion } from './useReducedMotion';
import { useT } from '../i18n/i18n';
import '../styles/future.css';

/** "Riverfront & public space" → ["riverfront", "public space"]. */
const themeParts = (topic: string) =>
  topic
    .toLowerCase()
    .split(/&|,|·/)
    .map((part) => part.trim())
    .filter(Boolean);

/** How many plans "Connected topics" offers. */
const RELATED_MAX = 4;

/**
 * The plans to offer beside one: the same theme first, then a shared part
 * of it ("public space" in "Riverfront & public space" and "Parks & public
 * space"), in the API's order. At most four, so no plan gets a wall of them
 * and none — Greenline is the only riverfront plan — gets nothing.
 */
export function relatedPlans(plan: FuturePlan, all: FuturePlan[]): FuturePlan[] {
  const parts = themeParts(plan.topic);
  const score = (other: FuturePlan) => {
    if (other.topic === plan.topic) return 2;
    return themeParts(other.topic).some((part) => parts.includes(part)) ? 1 : 0;
  };
  return all
    .filter((other) => other.id !== plan.id)
    .map((other, order) => ({ other, order, score: score(other) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, RELATED_MAX)
    .map((row) => row.other);
}

export function FuturePlansPage({
  openId,
  onOpen,
}: {
  /** The plan whose conversation is open; null for the list. App keeps it, for the address bar. */
  openId: number | null;
  onOpen: (id: number | null) => void;
}) {
  const t = useT();
  const plans = useFuturePlans();
  const page = useRef<HTMLElement>(null);
  /** The list's search and filters, kept while a plan is open. */
  const [filters, setFilters] = useState<PlanFilters>(NO_FILTERS);
  const setOpenId = onOpen;

  const open = plans.status === 'ready' ? (plans.data.find((p) => p.id === openId) ?? null) : null;

  // A new state starts at the top of the page.
  useEffect(() => {
    page.current?.scrollTo({ top: 0 });
  }, [openId]);

  return (
    <section className="page future" aria-labelledby="future-page-title" ref={page}>
      <div className="future__inner">
        {open && plans.status === 'ready' ? (
          <Conversation
            key={open.id}
            plan={open}
            related={relatedPlans(open, plans.data)}
            onBack={() => setOpenId(null)}
            onOpen={setOpenId}
          />
        ) : (
          <div className="future__state">
            {plans.status === 'ready' ? (
              <PlanFinder plans={plans.data} onOpen={setOpenId} filters={filters} onFilters={setFilters} />
            ) : (
              <div className="future__head">
                <p className="future__eyebrow">{t('future.eyebrow')}</p>
                <PageHead
                  id="future-page-title"
                  title={t('future.title')}
                  lede={t('future.lede')}
                />
                <p className="future__status">
                  {plans.status === 'loading'
                    ? t('future.loadingPlans')
                    : t('future.plansError')}
                </p>
              </div>
            )}
          </div>
        )}

        <Disclaimer />
      </div>
    </section>
  );
}

/* ── one plan's conversation ─────────────────────────────── */

/** How long "My City Twin" seems to think before a new answer appears. */
const THINK_MS = 650;

/*
 * WHERE THE QUESTIONS ARE
 *
 * Inside the conversation, where somebody who has used any messaging app
 * looks for the next thing to say. A panel of questions beside the thread
 * read as a list of topics, not as something to press.
 *
 *   - Before the first question: the questions hang under the app's
 *     greeting, as the replies to it.
 *   - After it: they move to the foot of the card, where a message box
 *     would be, and that foot stays on screen while the thread grows. A
 *     question pressed there leaves the row and appears in the thread.
 *   - Questions already asked move to a smaller row under it, each with
 *     the undo mark, and take you back to their answer.
 */
function Conversation({
  plan,
  related,
  onBack,
  onOpen,
}: {
  plan: FuturePlan;
  related: FuturePlan[];
  onBack: () => void;
  onOpen: (id: number) => void;
}) {
  const t = useT();
  const questions = useFuturePlanQuestions(plan.id);
  const reducedMotion = useReducedMotion();
  /** The questions asked, in the order they were asked. */
  const [asked, setAsked] = useState<string[]>([]);
  /** The question whose answer is still "being written". */
  const [thinking, setThinking] = useState<string | null>(null);
  const answers = useRef(new Map<string, HTMLElement>());
  const [scrollTo, setScrollTo] = useState<string | null>(null);

  const byId = useMemo(
    () =>
      new Map(
        questions.status === 'ready' ? questions.data.map((q) => [q.id, q] as const) : [],
      ),
    [questions],
  );

  // After a question is asked or revisited, bring the exchange to the top.
  useEffect(() => {
    if (!scrollTo) return;
    const node = answers.current.get(scrollTo);
    node?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (!thinking) node?.querySelector<HTMLElement>('.future__answer')?.focus({ preventScroll: true });
    setScrollTo(null);
  }, [scrollTo, asked, thinking, reducedMotion]);

  // The pause before an answer.
  useEffect(() => {
    if (!thinking) return;
    const id = thinking;
    const timer = window.setTimeout(() => {
      setThinking(null);
      setScrollTo(id);
    }, THINK_MS);
    return () => window.clearTimeout(timer);
  }, [thinking]);

  const ready = questions.status === 'ready' ? questions.data : [];
  const unasked = ready.filter((q) => !asked.includes(q.id));
  const askedQuestions = asked.map((id) => byId.get(id)).filter((q) => q !== undefined);
  const started = asked.length > 0;

  const ask = (id: string) => {
    if (!asked.includes(id)) {
      setAsked((list) => [...list, id]);
      if (!reducedMotion) setThinking(id);
    }
    setScrollTo(id);
  };

  const restart = () => {
    setAsked([]);
    setThinking(null);
    // The button pressed goes with the composer: the first question takes the keyboard.
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('.future__opening .future__reply')?.focus(),
    );
  };

  /** The questions, as replies to press. */
  const replies = (list: FuturePlanQuestion[]) => (
    <ul className="future__replies" role="list">
      {list.map((q, i) => (
        <li key={q.id} style={nth(i)}>
          <button type="button" className="future__reply" onClick={() => ask(q.id)}>
            <span className="future__reply-plus" aria-hidden="true">
              <Icon name="add" size={18} />
            </span>
            {q.question}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="future__state">
      <div className="future__head">
        <p className="future__eyebrow">{t('future.talk.eyebrow')}</p>
        <PageHead id="future-page-title" title={plan.name} lede={plan.topic} />
        <Button variant="ghost" className="future__choose" icon={<ChevronLeft />} onClick={onBack}>
          {t('future.talk.back')}
        </Button>
      </div>

      <div className={`future__talk-layout${related.length === 0 ? ' future__talk-layout--solo' : ''}`}>
        <section className="future__talk" aria-labelledby="future-talk-title">
          <div className="future__talk-head">
            <h2 className="card-title" id="future-talk-title">
              {t('future.talk.title')}
            </h2>
            <Pill size="xs" className="future__talk-kind">
              {t('future.talk.kind')}
            </Pill>
          </div>

          <div className="card future__chat">
            <ol className="future__thread" role="list">
              <li className="future__msg future__msg--app">
                <span className="future__who">My City Twin</span>
                <p className="future__greeting">{t('future.talk.greeting', { plan: plan.name })}</p>
              </li>

              {/* Before the first question: the replies, under the greeting. */}
              {!started && (
                <li className="future__opening">
                  <p className="future__opening-title">
                    <TapMark />
                    {t('future.talk.openingTitle')}
                  </p>
                  <p className="future__opening-sub">{t('future.talk.openingSub')}</p>
                  {questions.status === 'loading' && <p className="future__status">{t('future.talk.loadingQuestions')}</p>}
                  {questions.status === 'error' && (
                    <p className="future__status">{t('future.talk.questionsError')}</p>
                  )}
                  {questions.status === 'ready' && ready.length === 0 && (
                    <p className="future__status">{t('future.talk.noQuestions')}</p>
                  )}
                  {ready.length > 0 && replies(ready)}
                </li>
              )}

              {asked.map((id) => {
                const q = byId.get(id);
                if (!q) return null;
                return (
                  <li
                    key={id}
                    className="future__pair"
                    ref={(node) => {
                      if (node) answers.current.set(id, node);
                      else answers.current.delete(id);
                    }}
                  >
                    <div className="future__msg future__msg--you">
                      <span className="future__who">{t('future.talk.you')}</span>
                      <p>{q.question}</p>
                    </div>
                    {thinking === id ? (
                      <div className="future__msg future__msg--app future__typing" aria-hidden="true">
                        <span className="future__dot" />
                        <span className="future__dot" />
                        <span className="future__dot" />
                      </div>
                    ) : (
                      <Answer question={q} />
                    )}
                  </li>
                );
              })}
            </ol>

            {/*
              After the first question: the replies at the foot of the card,
              where a message box would be. Sticky, so they stay in reach as
              the thread grows.
            */}
            {started && (
              <div className="future__composer" aria-labelledby="future-composer-title" role="group">
                <p className="future__composer-title" id="future-composer-title">
                  <TapMark />
                  {unasked.length > 0 ? t('future.talk.keepExploring') : t('future.talk.allAsked')}
                </p>
                {unasked.length > 0 && replies(unasked)}
                <div className="future__composer-foot">
                  {askedQuestions.length > 0 && (
                    <ul className="future__revisits" role="list" aria-label={t('future.talk.askedLabel')}>
                      {askedQuestions.map((q) => (
                        <li key={q.id}>
                          <button type="button" className="future__revisit" onClick={() => ask(q.id)}>
                            <Icon name="undo" size={16} /> {q.question}
                            <span className="visually-hidden">{t('future.talk.revisit')}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <TextButton variant="reference" arrow={false} className="future__restart" onClick={restart}>
                    {t('future.talk.restart')}
                  </TextButton>
                </div>
              </div>
            )}
          </div>

          {/* What a screen reader hears: one line, not the whole thread again. */}
          <p className="visually-hidden" role="status">
            {thinking
              ? t('future.talk.opening')
              : started
                ? t('future.talk.answerReady', { heading: byId.get(asked[asked.length - 1])?.answerHeading ?? '' })
                : ''}
          </p>
        </section>

        {related.length > 0 && (
          <aside className="future__related" aria-labelledby="future-related-title">
            <h2 className="card-title" id="future-related-title">
              {t('future.related.title')}
            </h2>
            <p className="future__related-note">{t('future.related.note')}</p>
            <ul className="future__related-list" role="list">
              {related.map((p, i) => (
                <li key={p.id} style={nth(i)}>
                  <button type="button" className="future__related-link" onClick={() => onOpen(p.id)}>
                    <span className="future__related-mark">
                      <ThemeMark topic={p.topic} />
                    </span>
                    <span className="future__related-name">{p.name}</span>
                    <span className="future__related-topic">{p.topic}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}

/** A speech bubble: "the next thing to say is here". */
function TapMark() {
  return <Icon name="chat" size={20} className="future__tap" />;
}

function Answer({ question }: { question: FuturePlanQuestion }) {
  const t = useT();
  const paragraphs = question.answer.split(/\n\s*\n/).filter(Boolean);
  return (
    <section
      className="future__msg future__msg--app future__answer"
      tabIndex={-1}
      aria-label={question.answerHeading}
    >
      <span className="future__who">My City Twin</span>
      <h3 className="future__answer-title">{question.answerHeading}</h3>
      {paragraphs.map((text, i) => (
        <p key={i}>{text}</p>
      ))}
      {question.limit && <p className="future__limit">{question.limit}</p>}
      <p className="future__basis">{t('future.answer.basis', { basis: question.evidenceBasis })}</p>
      {question.sources.length > 0 && (
        <div className="future__sources">
          <span className="future__sources-title">
            {question.sources.length === 1 ? t('future.answer.sourceOne') : t('future.answer.sourceOther')}
          </span>
          <ul role="list">
            {question.sources.map((s) => (
              <li key={s.id}>
                <a href={s.srcUrl} target="_blank" rel="noreferrer">
                  {s.srcTitle}
                  <OutArrow />
                  <span className="visually-hidden">{t('future.answer.newTab')}</span>
                </a>
                <span className="future__source-date">{t('future.answer.checked', { date: s.srcCheckdate })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Disclaimer() {
  const t = useT();
  return (
    <footer className="future__foot">
      <p className="future__foot-title">{t('future.foot.title')}</p>
      <p>{t('future.foot.body')}</p>
      <p className="future__foot-fine">{t('future.foot.fine')}</p>
    </footer>
  );
}

function OutArrow() {
  return <Icon name="open_in_new" size={14} className="future__out" />;
}
