import i18next, { type InitOptions, type i18n } from 'i18next';
import { en } from './locales/en';
import { es } from './locales/es';
import { pt } from './locales/pt';

export const DEFAULT_LOCALE = 'es';

/** Catálogo de idiomas disponibles en la plataforma. */
export interface LocaleDefinition {
  code: string;
  label: string;
  nativeLabel: string;
}

export const AVAILABLE_LOCALES: LocaleDefinition[] = [
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
];

export const SUPPORTED_LOCALES = AVAILABLE_LOCALES.map((l) => l.code);

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Recursos base (traducciones compiladas en tiempo de compilación). */
export const baseResources: Record<string, { translation: Record<string, string> }> = {
  en: { translation: en },
  es: { translation: es },
  pt: { translation: pt },
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
      pt: { translation: pt },
      ...(options.resources ?? {}),
    },
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    ...options.initOptions,
  });

  return instance;
}
