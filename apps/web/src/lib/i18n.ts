import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { baseResources, DEFAULT_LOCALE } from '@webs/i18n';

const LOCALE_KEY = 'webs-locale';

const readStoredLocale = (): string | null => {
  try {
    return window.localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
};

const writeStoredLocale = (locale: string): void => {
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Sin persistencia disponible (modo incógnito, etc.): seguimos en memoria.
  }
};

// Se inicializa con los recursos base (compilados) para evitar el "flash" de
// claves sin traducir en el primer render; en runtime se cargan además los
// idiomas habilitados por el administrador vía applyRemoteResources.
void i18next.use(initReactI18next).init({
  lng: readStoredLocale() ?? DEFAULT_LOCALE,
  fallbackLng: 'en',
  resources: baseResources,
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
  if (!readStoredLocale() && payload.defaultLocale) {
    void i18next.changeLanguage(payload.defaultLocale);
  }
}

export function setLocale(locale: string): Promise<unknown> {
  writeStoredLocale(locale);
  return i18next.changeLanguage(locale);
}

export default i18next;
