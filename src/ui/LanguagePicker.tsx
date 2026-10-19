/*
 * The language the interface is in (i18n/): a chip in the header with the globe and the language's own
 * name, over a plain select, so the keyboard, a screen reader and a phone's own picker all work as they
 * do for any select. Each language is named in its own words, so a reader who cannot yet read the page
 * can still find theirs.
 */
import { LOCALES, isLocale } from '../i18n/locales';
import { setLocale, useLocale, useT } from '../i18n/i18n';
import { Icon } from './kit/Icon';

export function LanguagePicker() {
  const t = useT();
  const locale = useLocale();
  return (
    <label className="chip chip--icon language-picker">
      <Icon name="language" size={20} />
      <span className="visually-hidden">{t('header.language')}</span>
      <select
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) void setLocale(event.target.value);
        }}
      >
        {LOCALES.map((option) => (
          <option key={option.code} value={option.code} lang={option.intl}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
