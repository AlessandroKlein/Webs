import type { PaymentProviderAdapter } from './payments';
import type { StorageDriver } from './storage';
import type { NotificationProviderAdapter } from './notifications';
import type { ShippingProviderAdapter } from './shipping';

/**
 * Tipos de contexto y hooks (ciclo de vida) de un plugin.
 *
 * El SDK no depende de Fastify/Prisma en tiempo de ejecución: expone tipos
 * estructurales para mantener el contrato estable y ligero. En tiempo de
 * ejecución la plataforma inyecta los objetos reales.
 */

/** Logger estructural mínimo que la plataforma inyecta en un plugin. */
export interface PluginLogger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): PluginLogger;
}

/** @deprecated Usar {@link PluginLogger}. Alias por retrocompatibilidad. */
export type BlockLogger = PluginLogger;

/**
 * Subconjunto estructural de la API de Fastify que un plugin puede usar para
 * registrar rutas y decoradores. Se define aquí (y no como `FastifyInstance`)
 * para que el SDK no arrastre Fastify como dependencia de tipos a los
 * consumidores del cliente. En tiempo de ejecución se inyecta la instancia real.
 */
export interface PluginFastify {
  get(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  post(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  put(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  patch(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  delete(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  register(plugin: unknown, opts?: unknown): unknown;
  decorate(name: string, value: unknown): unknown;
  addHook(name: string, fn: unknown): unknown;
  log: PluginLogger;
  /** Emisor de eventos de negocio (dispara automatizaciones de correo). */
  events?: {
    emit: (event: string, payload: Record<string, unknown>) => void | Promise<void>;
  };
  /** Registro central de proveedores de pago (plugins de pasarela). */
  payments?: {
    register: (adapter: PaymentProviderAdapter) => void;
  };
  /** Registro central de drivers de almacenamiento (S3/R2/MinIO). */
  storage?: {
    register: (driver: StorageDriver) => void;
  };
  /** Registro central de proveedores de notificaciones (SMS/WhatsApp/Push). */
  notifications?: {
    register: (adapter: NotificationProviderAdapter) => void;
  };
  /** Registro central de proveedores de envío (plugins de envío). */
  shipping?: {
    register: (adapter: ShippingProviderAdapter) => void;
    get: (id: string) => ShippingProviderAdapter | undefined;
    list: () => Array<{ id: string; displayName: string }>;
  };
  /** Cliente de base de datos (Prisma) heredado de la app. */
  prisma?: unknown;
}

/** @deprecated Usar {@link PluginFastify}. Alias por retrocompatibilidad. */
export type BlockFastify = PluginFastify;

/**
 * Registro de un plugin Fastify. Un plugin puede optar por no definir rutas y
 * limitarse a registrar ajustes y hooks.
 */
export type PluginRegisterFn = (
  fastify: PluginFastify,
  options: Record<string, unknown>,
) => void | Promise<void>;

/** @deprecated Usar {@link PluginRegisterFn}. Alias por retrocompatibilidad. */
export type BlockRegisterFn = PluginRegisterFn;

/** Servicios que la plataforma expone a un plugin en el servidor. */
export interface PluginServices {
  /** Cliente de base de datos (Prisma). Ver docs para la API disponible. */
  db: unknown;
  /** Cliente de caché/Redis (opcional). */
  cache?: unknown;
  /** Emisor de eventos de negocio (opcional). */
  events?: {
    emit: (event: string, payload: Record<string, unknown>) => void | Promise<void>;
  };
}

/** @deprecated Usar {@link PluginServices}. Alias por retrocompatibilidad. */
export type BlockServices = PluginServices;

/**
 * Contexto del servidor inyectado en los hooks del ciclo de vida.
 * `fastify` es una `FastifyInstance` real; `config` son los ajustes del plugin
 * resueltos desde la base de datos (validados contra `manifest.settings`).
 */
export interface ServerPluginContext {
  fastify: PluginFastify;
  logger: PluginLogger;
  services: PluginServices;
  config: Record<string, unknown>;
  /** Identificador de la instalación (asignado por la plataforma). */
  installationId: string;
}

/** @deprecated Usar {@link ServerPluginContext}. Alias por retrocompatibilidad. */
export type ServerBlockContext = ServerPluginContext;

/** Hooks del ciclo de vida de un plugin en el servidor. */
export interface PluginHooks {
  onInstall?: (ctx: ServerPluginContext) => void | Promise<void>;
  onUninstall?: (ctx: ServerPluginContext) => void | Promise<void>;
  onActivate?: (ctx: ServerPluginContext) => void | Promise<void>;
  onDeactivate?: (ctx: ServerPluginContext) => void | Promise<void>;
}

/** @deprecated Usar {@link PluginHooks}. Alias por retrocompatibilidad. */
export type BlockHooks = PluginHooks;
