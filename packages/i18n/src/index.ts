import i18next, { type InitOptions, type i18n } from 'i18next';
import { en } from './locales/en';
import { es } from './locales/es';

export const DEFAULT_LOCALE = 'es';
export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Recursos base (traducciones compiladas en tiempo de compilación). */
export const baseResources: Record<string, { translation: Record<string, string> }> = {
  en: { translation: en },
  es: { translation: es },
};

export interface CreateI18nOptions {
  lng?: string;
  fallbackLng?: string;
  /** Recursos adicionales (por ejemplo, traducciones de bloques cargadas en runtime). */
  resources?: Record<string, unknown>;
  initOptions?: Partial<InitOptions>;
}

/**
 * Crea una instancia de i18next preconfigurada con los recursos base de Webs.
 * El frontend usa `react-i18next` sobre esta instancia; el backend puede usar
 * esta misma instancia para correos y notificaciones.
 */
export function createI18n(options: CreateI18nOptions = {}): i18n {
  const instance = i18next.createInstance();

  void instance.init({
    lng: options.lng ?? DEFAULT_LOCALE,
    fallbackLng: options.fallbackLng ?? 'en',
    supportedLngs: [...SUPPORTED_LOCALES],
    resources: {
      en: { translation: en },
      es: { translation: es },
      ...(options.resources ?? {}),
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    ...options.initOptions,
  });

  return instance;
}
