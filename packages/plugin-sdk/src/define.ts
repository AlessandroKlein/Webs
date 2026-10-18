import type { BlockManifest } from './manifest';
import type { BlockHooks, BlockRegisterFn } from './hooks';
import { parseBlockManifest } from './manifest';

/**
 * Definición de bloque del lado **servidor**. Es lo que default-exporta el
 * punto de entrada `manifest.entry` de un paquete de bloque.
 */
export interface ServerBlock {
  manifest: BlockManifest;
  hooks: BlockHooks;
  /** Plugin Fastify opcional: registra rutas/decoradores del bloque. */
  register?: BlockRegisterFn;
}

export interface DefineBlockOptions {
  hooks?: BlockHooks;
  register?: BlockRegisterFn;
}

/**
 * Define un bloque del lado servidor. Valida el manifiesto en tiempo de
 * ejecución y devuelve la definición que el loader de bloques consumirá.
 *
 * ```ts
 * // src/server.ts de un paquete de bloque
 * import { defineBlock } from '@webs/plugin-sdk';
 *
 * export default defineBlock(
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
export function defineBlock(
  manifest: BlockManifest,
  opts: DefineBlockOptions = {},
): ServerBlock {
  return {
    manifest: parseBlockManifest(manifest),
    hooks: opts.hooks ?? {},
    register: opts.register,
  };
}

/**
 * Cliente HTTP mínimo que la plataforma inyecta en un bloque del lado cliente.
 */
export interface BlockApiClient {
  get<T = unknown>(path: string, options?: Record<string, unknown>): Promise<T>;
  post<T = unknown>(path: string, body?: unknown): Promise<T>;
  put<T = unknown>(path: string, body?: unknown): Promise<T>;
  del<T = unknown>(path: string): Promise<T>;
}

/** Helper de traducción inyectado en el bloque del lado cliente. */
export interface BlockI18n {
  t(key: string, options?: Record<string, unknown>): string;
  locale: string;
}

/** Estado del tema inyectado en el bloque del lado cliente. */
export interface BlockTheme {
  mode: 'light' | 'dark';
  tokens: Record<string, string>;
}

/** Contexto del lado cliente inyectado en `mount`. */
export interface ClientBlockContext {
  container: HTMLElement;
  slot: string;
  locale: string;
  config: Record<string, unknown>;
  api: BlockApiClient;
  i18n: BlockI18n;
  theme: BlockTheme;
}

/**
 * Definición de bloque del lado **cliente**. Es lo que default-exporta el
 * punto de entrada `manifest.clientEntry` de un paquete de bloque.
 */
export interface ClientBlock {
  manifest: BlockManifest;
  /** Monta el bloque en `container`. Puede devolver una función de limpieza. */
  mount: (ctx: ClientBlockContext) => void | (() => void);
}

/**
 * Define un bloque del lado cliente.
 *
 * ```ts
 * // src/client.ts de un paquete de bloque
 * import { defineClientBlock } from '@webs/plugin-sdk';
 *
 * export default defineClientBlock(
 *   { ...manifesto... },
 *   ({ container, config, i18n }) => {
 *     container.textContent = config.greeting ?? i18n.t('hello');
 *   },
 * );
 * ```
 */
export function defineClientBlock(
  manifest: BlockManifest,
  mount: ClientBlock['mount'],
): ClientBlock {
  return { manifest: parseBlockManifest(manifest), mount };
}
