import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE } from '@webs/i18n';

const LOCALE_KEY = 'webs-locale';

// Se inicializa sin recursos: se cargan en runtime SOLO los idiomas habilitados
// por el administrador (vía applyRemoteResources), para no descargar peso de
// idiomas/módulos que no se usan.
void i18next.use(initReactI18next).init({
  lng: localStorage.getItem(LOCALE_KEY) ?? DEFAULT_LOCALE,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export interface RemoteI18nPayload {
  locales: string[];
  defaultLocale: string;
  resources: Record<string, Record<string, Record<string, string>>>;
}

export function applyRemoteResources(payload: RemoteI18nPayload): void {
  for (const [locale, namespaces] of Object.entries(payload.resources)) {
    for (const [ns, values] of Object.entries(namespaces)) {
      i18next.addResourceBundle(locale, ns, values, true, true);
    }
  }

  // Si el usuario no eligió idioma manualmente, usa el del sitio.
  if (!localStorage.getItem(LOCALE_KEY) && payload.defaultLocale) {
    void i18next.changeLanguage(payload.defaultLocale);
  }
}

export function setLocale(locale: string): Promise<unknown> {
  localStorage.setItem(LOCALE_KEY, locale);
  return i18next.changeLanguage(locale);
}

export default i18next;
