import type { PluginManifest } from './manifest';
import type { PluginHooks, PluginRegisterFn } from './hooks';
import { parsePluginManifest } from './manifest';

/**
 * Definición de plugin del lado **servidor**. Es lo que default-exporta el
 * punto de entrada `manifest.entry` de un paquete de plugin.
 */
export interface ServerPlugin {
  manifest: PluginManifest;
  hooks: PluginHooks;
  /** Plugin Fastify opcional: registra rutas/decoradores del plugin. */
  register?: PluginRegisterFn;
}

/** @deprecated Usar {@link ServerPlugin}. Alias por retrocompatibilidad. */
export type ServerBlock = ServerPlugin;

export interface DefinePluginOptions {
  hooks?: PluginHooks;
  register?: PluginRegisterFn;
}

/** @deprecated Usar {@link DefinePluginOptions}. Alias por retrocompatibilidad. */
export type DefineBlockOptions = DefinePluginOptions;

/**
 * Define un plugin del lado servidor. Valida el manifiesto en tiempo de
 * ejecución y devuelve la definición que el loader de plugins consumirá.
 *
 * ```ts
 * // src/server.ts de un paquete de plugin
 * import { definePlugin } from '@webs/plugin-sdk';
 *
 * export default definePlugin(
 *   { ...manifesto... },
 *   {
 *     register: async (fastify) => {
 *       fastify.get('/', async () => ({ hello: 'world' }));
 *     },
 *     hooks: {
 *       onInstall: async (ctx) => ctx.logger.info('instalado'),
 *     },
 *   },
 * );
 * ```
 */
export function definePlugin(
  manifest: PluginManifest,
  opts: DefinePluginOptions = {},
): ServerPlugin {
  return {
    manifest: parsePluginManifest(manifest),
    hooks: opts.hooks ?? {},
    register: opts.register,
  };
}

/** @deprecated Usar {@link definePlugin}. Alias por retrocompatibilidad. */
export const defineBlock = definePlugin;

/**
 * Cliente HTTP mínimo que la plataforma inyecta en un plugin del lado cliente.
 */
export interface PluginApiClient {
  get<T = unknown>(path: string, options?: Record<string, unknown>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  del<T = unknown>(path: string): Promise<T>;
}

/** @deprecated Usar {@link PluginApiClient}. Alias por retrocompatibilidad. */
export type BlockApiClient = PluginApiClient;

/** Helper de traducción inyectado en el plugin del lado cliente. */
export interface PluginI18n {
  t(key: string, options?: Record<string, unknown>): string;
  locale: string;
}

/** @deprecated Usar {@link PluginI18n}. Alias por retrocompatibilidad. */
export type BlockI18n = PluginI18n;

/** Estado del tema inyectado en el plugin del lado cliente. */
export interface PluginTheme {
  mode: 'light' | 'dark';
  tokens: Record<string, string>;
}

/** @deprecated Usar {@link PluginTheme}. Alias por retrocompatibilidad. */
export type BlockTheme = PluginTheme;

/** Contexto del lado cliente inyectado en `mount`. */
export interface ClientPluginContext {
  container: HTMLElement;
  slot: string;
  locale: string;
  config: Record<string, unknown>;
  api: PluginApiClient;
  i18n: PluginI18n;
  theme: PluginTheme;
}

/** @deprecated Usar {@link ClientPluginContext}. Alias por retrocompatibilidad. */
export type ClientBlockContext = ClientPluginContext;

/**
 * Definición de plugin del lado **cliente**. Es lo que default-exporta el
 * punto de entrada `manifest.clientEntry` de un paquete de plugin.
 */
export interface ClientPlugin {
  manifest: PluginManifest;
  /** Monta el plugin en `container`. Puede devolver una función de limpieza. */
  mount: (ctx: ClientPluginContext) => void | (() => void);
}

/** @deprecated Usar {@link ClientPlugin}. Alias por retrocompatibilidad. */
export type ClientBlock = ClientPlugin;

/**
 * Define un plugin del lado cliente.
 *
 * ```ts
 * // src/client.ts de un paquete de plugin
 * import { defineClientPlugin } from '@webs/plugin-sdk';
 *
 * export default defineClientPlugin(
 *   { ...manifesto... },
 *   ({ container, config, i18n }) => {
 *     container.textContent = config.greeting ?? i18n.t('hello');
 *   },
 * );
 * ```
 */
export function defineClientPlugin(
  manifest: PluginManifest,
  mount: ClientPlugin['mount'],
): ClientPlugin {
  return { manifest: parsePluginManifest(manifest), mount };
}

/** @deprecated Usar {@link defineClientPlugin}. Alias por retrocompatibilidad. */
export const defineClientBlock = defineClientPlugin;
