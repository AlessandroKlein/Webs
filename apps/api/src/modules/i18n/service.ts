import type { FastifyInstance } from 'fastify';
import { baseResources } from '@webs/i18n';
import { blockRegistry } from '../../blocks/registry';

/**
 * Recursos de traducción bajo demanda: se sirven únicamente los idiomas que el
 * administrador habilitó (así el cliente no descarga peso de idiomas/módulos
 * que no se usan).
 */

type Namespace = Record<string, string>;
type LocaleResources = Record<string, Namespace>;
export type I18nResources = Record<string, LocaleResources>;

/** Idiomas habilitados del sitio (selección del administrador). */
export async function getEnabledLocales(fastify: FastifyInstance): Promise<string[]> {
  const site = await fastify.prisma.setting.findUnique({ where: { key: 'site' } });
  const s = (site?.value ?? {}) as { languages?: string[]; defaultLocale?: string };
  const languages = Array.isArray(s.languages) ? s.languages.filter(Boolean) : [];
  if (languages.length === 0) return ['es'];
  return languages;
}

/** Idioma por defecto del sitio. */
export async function getDefaultLocale(fastify: FastifyInstance): Promise<string> {
  const site = await fastify.prisma.setting.findUnique({ where: { key: 'site' } });
  const s = (site?.value ?? {}) as { defaultLocale?: string };
  return s.defaultLocale ?? 'es';
}

/**
 * Construye los recursos para los locales solicitados, fusionando:
 *  1. Traducciones base (compiladas en @webs/i18n).
 *  2. Sobrescrituras del administrador (tabla `Translation`).
 */
export async function buildResources(
  fastify: FastifyInstance,
  locales: string[],
): Promise<I18nResources> {
  const result: I18nResources = {};

  for (const locale of locales) {
    const base = baseResources[locale];
    result[locale] = {
      translation: { ...(base?.translation ?? {}) },
    };
  }

  const overrides = await fastify.prisma.translation.findMany({
    where: { locale: { in: locales } },
  });

  for (const t of overrides) {
    const localeResources = result[t.locale] ?? {};
    const ns = t.namespace || 'translation';
    const namespace = localeResources[ns] ?? {};
    namespace[t.key] = t.value;
    localeResources[ns] = namespace;
    result[t.locale] = localeResources;
  }

  // Traducciones de los bloques instalados (namespace = id del bloque), solo
  // para los idiomas habilitados.
  for (const { blockId, translations } of blockRegistry.getTranslations()) {
    for (const locale of locales) {
      const blockLocale = translations[locale];
      if (!blockLocale) continue;
      const localeResources = result[locale] ?? {};
      localeResources[blockId] = { ...(localeResources[blockId] ?? {}), ...blockLocale };
      result[locale] = localeResources;
    }
  }

  return result;
}
