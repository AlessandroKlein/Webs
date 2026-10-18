import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { baseResources, DEFAULT_LOCALE } from '@webs/i18n';

const LOCALE_KEY = 'webs-locale';

void i18next.use(initReactI18next).init({
  lng: localStorage.getItem(LOCALE_KEY) ?? DEFAULT_LOCALE,
  fallbackLng: 'en',
  supportedLngs: ['es', 'en'],
  resources: baseResources,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export function setLocale(locale: string): Promise<unknown> {
  localStorage.setItem(LOCALE_KEY, locale);
  return i18next.changeLanguage(locale);
}

export default i18next;
