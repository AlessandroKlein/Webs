/**
 * Tipos de contexto y hooks (ciclo de vida) de un bloque.
 *
 * El SDK no depende de Fastify/Prisma en tiempo de ejecución: expone tipos
 * estructurales para mantener el contrato estable y ligero. En tiempo de
 * ejecución la plataforma inyecta los objetos reales.
 */

/** Logger estructural mínimo que la plataforma inyecta en un bloque. */
export interface BlockLogger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): BlockLogger;
}

/**
 * Subconjunto estructural de la API de Fastify que un bloque puede usar para
 * registrar rutas y decoradores. Se define aquí (y no como `FastifyInstance`)
 * para que el SDK no arrastre Fastify como dependencia de tipos a los
 * consumidores del cliente. En tiempo de ejecución se inyecta la instancia real.
 */
export interface BlockFastify {
  get(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  post(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  put(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  patch(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  delete(path: string, optsOrHandler: unknown, handler?: unknown): unknown;
  register(plugin: unknown, opts?: unknown): unknown;
  decorate(name: string, value: unknown): unknown;
  addHook(name: string, fn: unknown): unknown;
  log: BlockLogger;
  /** Emisor de eventos de negocio (dispara automatizaciones de correo). */
  events?: {
    emit: (event: string, payload: Record<string, unknown>) => void | Promise<void>;
  };
  /** Registro central de proveedores de pago (bloques de pasarela). */
  payments?: {
    register: (adapter: import('./payments').PaymentProviderAdapter) => void;
  };
  /** Registro central de drivers de almacenamiento (S3/R2/MinIO). */
  storage?: {
    register: (driver: import('./storage').StorageDriver) => void;
  };
  /** Registro central de proveedores de notificaciones (SMS/WhatsApp/Push). */
  notifications?: {
    register: (adapter: import('./notifications').NotificationProviderAdapter) => void;
  };
}

/**
 * Registro de un plugin Fastify. Un bloque puede optar por no definir rutas y
 * limitarse a registrar ajustes y hooks.
 */
export type BlockRegisterFn = (
  fastify: BlockFastify,
  options: Record<string, unknown>,
) => void | Promise<void>;

/** Servicios que la plataforma expone a un bloque en el servidor. */
export interface BlockServices {
  /** Cliente de base de datos (Prisma). Ver docs para la API disponible. */
  db: unknown;
  /** Cliente de caché/Redis (opcional). */
  cache?: unknown;
  /** Emisor de eventos de negocio (opcional). */
  events?: {
    emit: (event: string, payload: Record<string, unknown>) => void | Promise<void>;
  };
}

/**
 * Contexto del servidor inyectado en los hooks del ciclo de vida.
 * `fastify` es una `FastifyInstance` real; `config` son los ajustes del bloque
 * resueltos desde la base de datos (validados contra `manifest.settings`).
 */
export interface ServerBlockContext {
  fastify: BlockFastify;
  logger: BlockLogger;
  services: BlockServices;
  config: Record<string, unknown>;
  /** Identificador de la instalación (asignado por la plataforma). */
  installationId: string;
}

/** Hooks del ciclo de vida de un bloque en el servidor. */
export interface BlockHooks {
  onInstall?: (ctx: ServerBlockContext) => void | Promise<void>;
  onUninstall?: (ctx: ServerBlockContext) => void | Promise<void>;
  onActivate?: (ctx: ServerBlockContext) => void | Promise<void>;
  onDeactivate?: (ctx: ServerBlockContext) => void | Promise<void>;
}
