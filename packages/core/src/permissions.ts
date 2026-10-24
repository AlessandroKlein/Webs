/**
 * Catálogo canónico de permisos (ADR-0018).
 *
 * Única fuente de verdad de las claves base `<recurso>.<accion>`, agrupadas por
 * `area` para que la UI de roles pueda crear/editar roles seleccionando cualquier
 * permiso de la plataforma. Los permisos que registran los plugins se unen a este
 * catálogo en tiempo de ejecución (`area: 'plugins'` por defecto).
 */

/** Dominios del catálogo. */
export const PERMISSION_AREAS = [
  'users',
  'roles',
  'settings',
  'plugins',
  'license',
  'content',
  'i18n',
  'theme',
  'seo',
  'media',
  'audit',
  'email',
  'apiTokens',
  'organization',
  'membership',
  'inventory',
  'billing',
  'support',
  'marketing',
  'analytics',
  'hr',
  'sales',
  'academy',
  'reports',
  'generated',
  'scaling',
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export interface PermissionDefinition {
  /** Clave `<recurso>.<accion>` (ej. `plugin.read`). */
  key: string;
  /** Descripción legible. */
  description: string;
  /** Dominio/agrupación para la UI de roles. */
  area: PermissionArea;
}

export interface GroupedPermission {
  area: PermissionArea;
  permissions: Array<{ key: string; description: string }>;
}

export interface PermissionCatalog {
  areas: GroupedPermission[];
}

/** Catálogo base: coincide 1:1 con `Permission` de `constants.ts` y con el seed. */
export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // users
  { key: 'user.read', description: 'Ver usuarios', area: 'users' },
  { key: 'user.write', description: 'Crear/editar usuarios', area: 'users' },
  { key: 'user.invite', description: 'Invitar usuarios', area: 'users' },
  // roles
  { key: 'role.read', description: 'Ver roles', area: 'roles' },
  { key: 'role.write', description: 'Crear/editar roles', area: 'roles' },
  // settings
  { key: 'setting.read', description: 'Ver ajustes', area: 'settings' },
  { key: 'setting.write', description: 'Editar ajustes', area: 'settings' },
  // plugins
  { key: 'plugin.read', description: 'Ver plugins', area: 'plugins' },
  { key: 'plugin.manage', description: 'Instalar/desinstalar plugins', area: 'plugins' },
  // license
  { key: 'license.read', description: 'Ver estado y features de la licencia', area: 'license' },
  { key: 'license.manage', description: 'Activar/desactivar la licencia', area: 'license' },
  // content
  { key: 'content.read', description: 'Ver contenido', area: 'content' },
  { key: 'content.write', description: 'Crear/editar contenido', area: 'content' },
  { key: 'content.publish', description: 'Publicar contenido', area: 'content' },
  { key: 'content.moderate', description: 'Moderar contenido y comentarios', area: 'content' },
  // i18n
  { key: 'translation.read', description: 'Ver traducciones', area: 'i18n' },
  { key: 'translation.write', description: 'Editar traducciones', area: 'i18n' },
  // theme
  { key: 'theme.read', description: 'Ver tema', area: 'theme' },
  { key: 'theme.write', description: 'Editar tema/CSS', area: 'theme' },
  // seo
  { key: 'seo.read', description: 'Ver SEO', area: 'seo' },
  { key: 'seo.write', description: 'Editar SEO', area: 'seo' },
  // media
  { key: 'media.read', description: 'Ver medios', area: 'media' },
  { key: 'media.write', description: 'Gestionar medios', area: 'media' },
  // audit
  { key: 'audit.read', description: 'Ver auditoría', area: 'audit' },
  { key: 'audit.export', description: 'Exportar auditoría', area: 'audit' },
  // email
  { key: 'email.read', description: 'Ver correos', area: 'email' },
  { key: 'email.write', description: 'Editar plantillas/automatizaciones', area: 'email' },
  { key: 'email.send', description: 'Enviar campañas de correo', area: 'email' },
  // apiTokens
  { key: 'apiToken.read', description: 'Ver tokens de API', area: 'apiTokens' },
  { key: 'apiToken.write', description: 'Crear/revocar tokens de API', area: 'apiTokens' },
  // organization
  { key: 'organization.manage', description: 'Gestionar organizaciones multi-tenant', area: 'organization' },
  // membership
  { key: 'membership.manage', description: 'Gestionar membresías y planes', area: 'membership' },
  { key: 'attendance.manage', description: 'Registrar/consultar asistencia', area: 'membership' },
  // inventory
  { key: 'inventory.read', description: 'Ver inventario y stock', area: 'inventory' },
  { key: 'inventory.manage', description: 'Gestionar inventario', area: 'inventory' },
  // billing
  { key: 'billing.read', description: 'Ver facturación y pagos', area: 'billing' },
  { key: 'billing.write', description: 'Gestionar facturación y pagos', area: 'billing' },
  { key: 'refund.manage', description: 'Gestionar reembolsos', area: 'billing' },
  // support
  { key: 'support.read', description: 'Ver tickets de soporte', area: 'support' },
  { key: 'support.manage', description: 'Gestionar tickets de soporte', area: 'support' },
  // marketing
  { key: 'marketing.manage', description: 'Gestionar campañas de marketing', area: 'marketing' },
  // analytics
  { key: 'analytics.read', description: 'Ver analíticas e informes', area: 'analytics' },
  // hr
  { key: 'hr.manage', description: 'Gestionar recursos humanos', area: 'hr' },
  // sales
  { key: 'sales.manage', description: 'Gestionar ventas y caja', area: 'sales' },
  // academy
  { key: 'course.manage', description: 'Gestionar cursos y capacitaciones', area: 'academy' },
  // reports
  { key: 'report.export', description: 'Exportar informes', area: 'reports' },
  // generated
  { key: 'generated.read', description: 'Ver recursos generados', area: 'generated' },
  { key: 'generated.manage', description: 'Crear/editar recursos generados', area: 'generated' },
  // scaling
  { key: 'scaling.read', description: 'Ver configuración de escalabilidad', area: 'scaling' },
  { key: 'scaling.write', description: 'Editar configuración de escalabilidad', area: 'scaling' },
];

const BASE_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key));

/**
 * Construye el catálogo agrupado efectivo: base (gana ante colisiones de clave)
 * ∪ permisos extra (plugins instalados). Los extras sin área conocida caen en
 * `plugins`. Devuelve las áreas en el orden canónico de `PERMISSION_AREAS`.
 */
export function groupPermissionCatalog(
  extra: Array<{ key: string; description?: string | null }> = [],
): PermissionCatalog {
  const pluginOnly = extra.filter((p) => !BASE_KEYS.has(p.key));
  const all: PermissionDefinition[] = [
    ...PERMISSION_CATALOG,
    ...pluginOnly.map((p) => ({
      key: p.key,
      description: p.description ?? 'Permiso de plugin',
      // Los permisos por recurso del generador (`gen.<key>.read|write`) se agrupan
      // en `generated`; el resto de permisos de plugin caen en `plugins`.
      area: (p.key.startsWith('gen.') ? 'generated' : 'plugins') as PermissionArea,
    })),
  ];

  const byArea = new Map<PermissionArea, Array<{ key: string; description: string }>>();
  for (const p of all) {
    const list = byArea.get(p.area) ?? [];
    list.push({ key: p.key, description: p.description });
    byArea.set(p.area, list);
  }

  return {
    areas: PERMISSION_AREAS.filter((area) => byArea.has(area)).map((area) => ({
      area,
      permissions: byArea.get(area) ?? [],
    })),
  };
}

/** Variante plana `{ key, description }` (retrocompat con el endpoint original). */
export function flattenPermissionCatalog(
  extra: Array<{ key: string; description?: string | null }> = [],
): Array<{ key: string; description: string }> {
  return groupPermissionCatalog(extra).areas.flatMap((a) => a.permissions);
}
