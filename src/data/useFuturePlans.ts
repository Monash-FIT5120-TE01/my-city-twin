/*
 * ─────────────────────────────────────────────────────────────────────────
 * FUTURE PLANS, FROM THE API
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Two calls:
 *   GET /api/future-plans/projects                 the plans, id/name/topic
 *   GET /api/future-plans/questions?projectId={id} one plan's guided questions
 *
 * The questions are asked for only when a plan is opened, and kept once
 * fetched, so going back to a plan does not wait for the network again.
 */

import { useEffect, useState } from 'react';
import { API_BASE } from './useCityModel';

export interface FuturePlan {
  id: number;
  name: string;
  /** "Streets & public space" — the plan's theme. */
  topic: string;
}

export interface FuturePlanSource {
  id: number;
  srcTitle: string;
  srcUrl: string;
  /** "2026-10-05" — when the source was last read. */
  srcCheckdate: string;
}

export interface FuturePlanQuestion {
  id: string;
  projectId: number;
  /** "Overview", "Next steps and timing". */
  topic: string;
  question: string;
  answerHeading: string;
  /** Paragraphs separated by a blank line. */
  answer: string;
  /** What the answer cannot tell you, when there is something to say. */
  limit: string | null;
  /** "Published project scope" — what kind of evidence the answer rests on. */
  evidenceBasis: string;
  sources: FuturePlanSource[];
}

type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

const PROJECTS = `${API_BASE}/api/future-plans/projects`;
const questionsUrl = (id: number) => `${API_BASE}/api/future-plans/questions?projectId=${id}`;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

/** Every plan. */
export function useFuturePlans(): Loaded<FuturePlan[]> {
  const [state, setState] = useState<Loaded<FuturePlan[]>>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    getJson<FuturePlan[]>(PROJECTS, controller.signal)
      .then((data) => setState({ status: 'ready', data: Array.isArray(data) ? data : [] }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, []);
  return state;
}

const questionCache = new Map<number, FuturePlanQuestion[]>();

/** One plan's questions; nothing to fetch while no plan is open. */
export function useFuturePlanQuestions(projectId: number | null): Loaded<FuturePlanQuestion[]> {
  const cached = projectId === null ? undefined : questionCache.get(projectId);
  const [state, setState] = useState<Loaded<FuturePlanQuestion[]>>(
    cached ? { status: 'ready', data: cached } : { status: 'loading' },
  );
  useEffect(() => {
    if (projectId === null) return;
    const hit = questionCache.get(projectId);
    if (hit) {
      setState({ status: 'ready', data: hit });
      return;
    }
    setState({ status: 'loading' });
    const controller = new AbortController();
    getJson<FuturePlanQuestion[]>(questionsUrl(projectId), controller.signal)
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        questionCache.set(projectId, rows);
        setState({ status: 'ready', data: rows });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [projectId]);
  return state;
}
