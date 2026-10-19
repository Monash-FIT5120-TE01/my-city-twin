/*
 * Dates and seasons as the language chosen writes them, for the page. Kept out of scene/solar.ts, which
 * the roof workers also load: its dateLabel and seasonName stay English, for the headset (whose font has
 * English only) and for the code.
 */
import { MONTH_NAMES, seasonName, type SimulationDate } from '../scene/solar';
import { getLocale, t } from './i18n';
import { intlOf, type LocaleCode } from './locales';

/*
 * The browsers' own calendars (Intl) for most languages. Some browsers carry none for Nepali or Sinhala
 * (Chrome on Windows fell back to Japanese, 2026-10-20), so those two have their month and weekday names
 * here, taken from the full data (Node's ICU), and their order: year, month, day.
 */
const OWN_CALENDAR: Partial<Record<LocaleCode, { months: string[]; weekdays: string[]; narrow: string[] }>> = {
  ne: {
    months: ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'],
    weekdays: ['सोम', 'मङ्गल', 'बुध', 'बिहि', 'शुक्र', 'शनि', 'आइत'],
    narrow: ['सो', 'म', 'बु', 'बि', 'शु', 'श', 'आ'],
  },
  si: {
    months: ['ජනවාරි', 'පෙබරවාරි', 'මාර්තු', 'අප්‍රේල්', 'මැයි', 'ජූනි', 'ජූලි', 'අගෝස්තු', 'සැප්තැම්බර්', 'ඔක්තෝබර්', 'නොවැම්බර්', 'දෙසැම්බර්'],
    weekdays: ['සඳුදා', 'අඟහ', 'බදාදා', 'බ්‍රහස්', 'සිකු', 'සෙන', 'ඉරිදා'],
    narrow: ['ස', 'අ', 'බ', 'බ්‍ර', 'සි', 'සෙ', 'ඉ'],
  },
};

/** The browser's calendar for the language, or null where it has none (or for English, kept as it was). */
function browserCalendar(language: LocaleCode, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
  if (language === 'en') return null;
  const tag = intlOf(language);
  if (Intl.DateTimeFormat.supportedLocalesOf(tag).length === 0) return null;
  return new Intl.DateTimeFormat(tag, { timeZone: 'UTC', numberingSystem: 'latn', ...options });
}

const utc = ({ year, month, day }: SimulationDate) => new Date(Date.UTC(year, month - 1, day));

/** "21 December", "12月21日", "21 tháng 12". */
export function dayMonthLabel(date: SimulationDate): string {
  const language = getLocale();
  const own = OWN_CALENDAR[language];
  if (own) return `${own.months[date.month - 1]} ${date.day}`;
  const intl = browserCalendar(language, { day: 'numeric', month: 'long' });
  return intl ? intl.format(utc(date)) : `${date.day} ${MONTH_NAMES[date.month - 1] ?? ''}`;
}

/** "21 December 2026", in the language chosen. */
export function dayMonthYearLabel(date: SimulationDate): string {
  const language = getLocale();
  const own = OWN_CALENDAR[language];
  if (own) return `${date.year} ${own.months[date.month - 1]} ${date.day}`;
  const intl = browserCalendar(language, { day: 'numeric', month: 'long', year: 'numeric' });
  return intl ? intl.format(utc(date)) : `${date.day} ${MONTH_NAMES[date.month - 1] ?? ''} ${date.year}`;
}

/** "December 2026", in the language chosen. */
export function monthYearLabel(date: SimulationDate): string {
  const language = getLocale();
  const own = OWN_CALENDAR[language];
  if (own) return `${date.year} ${own.months[date.month - 1]}`;
  const intl = browserCalendar(language, { month: 'long', year: 'numeric' });
  return intl ? intl.format(utc(date)) : `${MONTH_NAMES[date.month - 1] ?? ''} ${date.year}`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday to Sunday: the name a screen reader says for a calendar column, and the letter at its head. */
export function weekdayNames(): { name: string; short: string }[] {
  const language = getLocale();
  const own = OWN_CALENDAR[language];
  if (own) return own.weekdays.map((name, i) => ({ name, short: own.narrow[i] }));
  const long = browserCalendar(language, { weekday: 'short' });
  const narrow = browserCalendar(language, { weekday: 'narrow' });
  if (!long || !narrow) return WEEKDAYS.map((name) => ({ name, short: name.slice(0, 1) }));
  // 5 January 2026 was a Monday.
  return Array.from({ length: 7 }, (_, i) => {
    const day = utc({ year: 2026, month: 1, day: 5 + i });
    return { name: long.format(day), short: narrow.format(day) };
  });
}

const SEASON_KEYS = {
  Summer: 'sun.sheet.seasonSummer',
  Autumn: 'sun.sheet.seasonAutumn',
  Winter: 'sun.sheet.seasonWinter',
  Spring: 'sun.sheet.seasonSpring',
} as const;

/** Melbourne's season for a month, in the language chosen. */
export function seasonWord(month: number): string {
  return t(SEASON_KEYS[seasonName(month) as keyof typeof SEASON_KEYS]);
}
