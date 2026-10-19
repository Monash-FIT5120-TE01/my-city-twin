/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE INTERFACE'S WORDS, IN THE READER'S LANGUAGE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every word the interface says is in en.ts, under a key; each other language is a file of the same keys
 * (the type makes a missing one an error, and i18n.test.ts checks the {placeholders} match). `t(key)`
 * gives the words in the language chosen, with {name} filled in from `vars`.
 *
 * One language at a time, held here rather than in React, so the few functions outside components that
 * write sentences (ui/words.ts and the like) can say them too. Components read it through `useT()`, which
 * also draws them again when the language changes. Changing it does not reload anything, so the building,
 * the date and the hour stay as they were.
 *
 * English is always there. The others are fetched when first chosen (a few tens of kilobytes each), and
 * English stands in until they arrive. The choice is kept in the browser (localStorage), and only there.
 */
import { useSyncExternalStore } from 'react';
import { en, type MessageKey, type Messages } from './en';
import { intlOf, isLocale, type LocaleCode } from './locales';

const STORE_KEY = 'mct-language';

const loaders: Record<Exclude<LocaleCode, 'en'>, () => Promise<{ default: Messages }>> = {
  'zh-CN': () => import('./zh-CN'),
  hi: () => import('./hi'),
  fil: () => import('./fil'),
  vi: () => import('./vi'),
  ne: () => import('./ne'),
  si: () => import('./si'),
  ms: () => import('./ms'),
  ja: () => import('./ja'),
};

let locale: LocaleCode = 'en';
let messages: Messages = en;
const listeners = new Set<() => void>();

function saved(): LocaleCode | null {
  try {
    const value = window.localStorage.getItem(STORE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

function apply(code: LocaleCode, words: Messages) {
  locale = code;
  messages = words;
  if (typeof document !== 'undefined') document.documentElement.lang = intlOf(code);
  for (const listener of listeners) listener();
}

/** Switch the interface to `code`, fetching its words if need be, and remember the choice. */
export async function setLocale(code: LocaleCode): Promise<void> {
  try {
    window.localStorage.setItem(STORE_KEY, code);
  } catch {
    // private window, storage blocked: the choice holds for this visit only
  }
  if (code === 'en') {
    apply('en', en);
    return;
  }
  try {
    const words = (await loaders[code]()).default;
    apply(code, words);
  } catch (error) {
    console.error(`The ${code} words could not be loaded; staying in ${locale}.`, error);
  }
}

/** At start: the language chosen on an earlier visit, if any. English until then. */
export function restoreLocale(): void {
  const code = typeof window === 'undefined' ? null : saved();
  if (code && code !== 'en') void setLocale(code);
}

export function getLocale(): LocaleCode {
  return locale;
}

/** The words for `key` in the language chosen, with each {name} replaced by `vars[name]`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = messages[key] ?? en[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The language chosen; a component that calls this is drawn again when it changes. */
export function useLocale(): LocaleCode {
  return useSyncExternalStore(subscribe, getLocale, () => 'en');
}

/** `t`, in a component: drawn again in the new language when it changes. */
export function useT(): typeof t {
  useLocale();
  return t;
}

/** A number as the language writes it: 1,234.5 / 1.234,5 / १,२३४.५ stays in Latin digits (the data's). */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlOf(locale), { numberingSystem: 'latn', ...options }).format(value);
}
