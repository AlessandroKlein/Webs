/**
 * Constantes de negocio de la plataforma: roles por defecto, permisos,
 * locales, límites y configuración inicial.
 *
 * Estos valores son el "seed" inicial. El administrador puede crear roles y
 * permisos adicionales desde la interfaz; aquí solo se definen los mínimos
 * necesarios para arrancar.
 */

export const DEFAULT_LOCALE = 'es';
export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Roles del sistema. `super_admin` es el rol raíz (no se puede eliminar ni
 * desactivar) y `admin` el rol operativo de administración.
 */
export const SystemRole = {
  SuperAdmin: 'super_admin',
  Admin: 'admin',
  Editor: 'editor',
  Manager: 'manager',
  User: 'user',
  Guest: 'guest',
} as const;

export type SystemRoleValue = (typeof SystemRole)[keyof typeof SystemRole];

/**
 * Permisos base, organizados por dominio con la convención `<recurso>.<acción>`.
 * Los bloques pueden registrar permisos adicionales a través de su manifiesto.
 */
export const Permission = {
  // Usuarios y roles
  UserRead: 'user.read',
  UserWrite: 'user.write',
  RoleRead: 'role.read',
  RoleWrite: 'role.write',

  // Configuración del sitio
  SettingRead: 'setting.read',
  SettingWrite: 'setting.write',

  // Bloques / plugins
  BlockRead: 'block.read',
  BlockManage: 'block.manage',

  // Contenido
  ContentRead: 'content.read',
  ContentWrite: 'content.write',
  ContentPublish: 'content.publish',

  // Traducciones / i18n
  TranslationRead: 'translation.read',
  TranslationWrite: 'translation.write',

  // Tema / apariencia
  ThemeRead: 'theme.read',
  ThemeWrite: 'theme.write',

  // SEO
  SeoRead: 'seo.read',
  SeoWrite: 'seo.write',

  // Medios
  MediaRead: 'media.read',
  MediaWrite: 'media.write',

  // Auditoría
  AuditRead: 'audit.read',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Nombre de la cookie que transporta el refresh token (httpOnly). */
export const REFRESH_TOKEN_COOKIE = 'webs_refresh_token';

/** Prefijo de todas las rutas HTTP de la API. */
export const API_PREFIX = '/api/v1';
