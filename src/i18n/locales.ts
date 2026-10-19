/*
 * The languages the interface is written in (team decision, 2026-10-20): the languages of the ten
 * countries most of Melbourne's overseas-born residents were born in (ABS, Australia's population by
 * country of birth, June 2025 — India, England, China, New Zealand, the Philippines, Vietnam, South
 * Africa, Nepal, Sri Lanka, Malaysia), one language each, English for the English-speaking ones, and
 * Japanese. Each named in its own language in the picker, so a reader who cannot read the page yet can
 * still find theirs.
 *
 * Addresses, building names and landmark names stay as they are in the data: they are names, and the
 * street signs carry them that way.
 */

export const LOCALES = [
  { code: 'en', name: 'English', intl: 'en-AU' },
  { code: 'zh-CN', name: '简体中文', intl: 'zh-CN' },
  { code: 'hi', name: 'हिन्दी', intl: 'hi-IN' },
  { code: 'fil', name: 'Filipino', intl: 'fil-PH' },
  { code: 'vi', name: 'Tiếng Việt', intl: 'vi-VN' },
  { code: 'ne', name: 'नेपाली', intl: 'ne-NP' },
  { code: 'si', name: 'සිංහල', intl: 'si-LK' },
  { code: 'ms', name: 'Bahasa Melayu', intl: 'ms-MY' },
  { code: 'ja', name: '日本語', intl: 'ja-JP' },
] as const;

export type LocaleCode = (typeof LOCALES)[number]['code'];

export function isLocale(code: string | null | undefined): code is LocaleCode {
  return LOCALES.some((locale) => locale.code === code);
}

/** The tag for Intl (dates, numbers) and the page's lang attribute. */
export function intlOf(code: LocaleCode): string {
  return LOCALES.find((locale) => locale.code === code)?.intl ?? 'en-AU';
}
