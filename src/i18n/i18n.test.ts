import { describe, expect, it } from 'vitest';
import { en } from './en';
import { LOCALES } from './locales';
import { t, setLocale, getLocale } from './i18n';

const others = import.meta.glob<{ default: Record<string, string> }>(['./*.ts', '!./en.ts', '!./i18n.ts', '!./locales.ts', '!./format.ts', '!./*.test.ts'], { eager: true });
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the translations', () => {
  it('has a file for every language offered, and nothing more', () => {
    const codes = Object.keys(others).map((path) => path.replace(/^\.\/|\.ts$/g, '')).sort();
    expect(codes).toEqual(LOCALES.map((l) => l.code).filter((c) => c !== 'en').sort());
  });

  for (const [path, mod] of Object.entries(others)) {
    it(`${path}: the same keys as English, each with the same {placeholders}, none left empty`, () => {
      const words = mod.default;
      expect(Object.keys(words).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        expect(placeholders(words[key]), `${path} ${key}`).toEqual(placeholders(text));
        expect(words[key].trim().length, `${path} ${key}`).toBeGreaterThan(0);
      }
    });
  }
});

describe('t', () => {
  it('fills in the placeholders, in English to begin with', () => {
    expect(getLocale()).toBe('en');
    expect(t('search.noneNoLandmarks', { buildings: '4,443', projects: 133 })).toContain('4,443 buildings and 133 approved projects');
  });

  it('switches language and back', async () => {
    await setLocale('ja');
    expect(t('nav.howItWorks')).toBe('しくみ');
    await setLocale('en');
    expect(t('nav.howItWorks')).toBe('How it works');
  });
});
