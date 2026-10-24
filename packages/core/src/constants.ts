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

  // Plugins (antes "Bloques")
  PluginRead: 'plugin.read',
  PluginManage: 'plugin.manage',

  /** @deprecated Alias de PluginRead por retrocompatibilidad. */
  BlockRead: 'plugin.read',
  /** @deprecated Alias de PluginManage por retrocompatibilidad. */
  BlockManage: 'plugin.manage',

  // Licencias (Licensify, node-locking local)
  LicenseRead: 'license.read',
  LicenseManage: 'license.manage',

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

  // Email / marketing
  EmailRead: 'email.read',
  EmailWrite: 'email.write',
  EmailSend: 'email.send',

  // Tokens de API
  ApiTokenRead: 'apiToken.read',
  ApiTokenWrite: 'apiToken.write',

  // Organizaciones / membresías
  OrganizationManage: 'organization.manage',
  MembershipManage: 'membership.manage',
  AttendanceManage: 'attendance.manage',

  // Inventario
  InventoryRead: 'inventory.read',
  InventoryManage: 'inventory.manage',

  // Finanzas / facturación
  BillingRead: 'billing.read',
  BillingWrite: 'billing.write',
  RefundManage: 'refund.manage',

  // Escalabilidad (selector HPA/VPA, ADR-0025)
  ScalingRead: 'scaling.read',
  ScalingWrite: 'scaling.write',

  // Actualizaciones (vista RAW/Code, ADR-0026)
  UpdateManage: 'update.manage',

  // Soporte
  SupportRead: 'support.read',
  SupportManage: 'support.manage',

  // Marketing / analítica
  MarketingManage: 'marketing.manage',
  AnalyticsRead: 'analytics.read',

  // Recursos humanos
  HrManage: 'hr.manage',

  // Ventas / punto de venta
  SalesManage: 'sales.manage',

  // Capacitación / academia
  CourseManage: 'course.manage',

  // Contenido / usuarios
  ContentModerate: 'content.moderate',
  UserInvite: 'user.invite',

  // Informes / auditoría
  ReportExport: 'report.export',
  AuditExport: 'audit.export',
} as const;

export type PermissionValue = (typeof Permission)[keyof typeof Permission];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Nombre de la cookie que transporta el refresh token (httpOnly). */
export const REFRESH_TOKEN_COOKIE = 'webs_refresh_token';

/** Prefijo de todas las rutas HTTP de la API. */
export const API_PREFIX = '/api/v1';
