import type { PluginManifest, PluginMenuItem } from '@webs/plugin-sdk';
import { pluginRegistry } from '../plugins/registry';

/** Resuelve un `LocalizedString` a un único string (preferencia `es` → `en` → primero). */
function resolveLabel(label: Record<string, string>): string {
  return label.es ?? label.en ?? Object.values(label)[0] ?? '';
}

/**
 * Fallback categoría→sección del menú `/admin` (docs/architecture/menu-categorias.md).
 * Se aplica únicamente cuando `menu[].section` está ausente; la sección explícita
 * declarada por el plugin siempre tiene precedencia.
 */
const CATEGORY_TO_SECTION: Record<string, string> = {
  negocio: 'ventas', ventas: 'ventas', ecommerce: 'ventas', facturacion: 'ventas', inventario: 'ventas', pos: 'ventas',
  contenido: 'contenido', blog: 'contenido', formularios: 'contenido', seo: 'contenido', paginas: 'contenido',
  comunicacion: 'comunicacion', email: 'comunicacion', chat: 'comunicacion', notificaciones: 'comunicacion', soporte: 'comunicacion',
  social: 'comunidad', comunidad: 'comunidad', calendario: 'comunidad', reservas: 'comunidad', academia: 'comunidad',
  integracion: 'integraciones', pagos: 'integraciones', envios: 'integraciones', almacenamiento: 'integraciones', automatizaciones: 'integraciones', marketing: 'integraciones',
  configuracion: 'configuracion', licencias: 'configuracion', actualizaciones: 'configuracion', organizaciones: 'configuracion',
  apariencia: 'apariencia', idiomas: 'apariencia', temas: 'apariencia',
  usuarios: 'usuarios', seguridad: 'usuarios', roles: 'usuarios', auditoria: 'usuarios',
};

const DEFAULT_SECTION = 'integraciones';

/** Resuelve el manifiesto de un plugin (disponible o ya cargado). */
function resolveManifest(pluginId: string): PluginManifest | undefined {
  return (
    pluginRegistry.getAvailableManifest(pluginId) ??
    pluginRegistry.getLoadedPlugins().find((l) => l.manifest.id === pluginId)?.manifest
  );
}

/** Resuelve la sección de un item: `section` explícito > categoría del manifest > default. */
function resolveSection(pluginId: string, section: string | undefined, manifest?: PluginManifest): string {
  if (section) return section;
  const category = (manifest ?? resolveManifest(pluginId))?.category;
  if (category && CATEGORY_TO_SECTION[category]) return CATEGORY_TO_SECTION[category];
  return DEFAULT_SECTION;
}

/** Feature de un item (ADR-0019): `menu[].feature` > `manifest.feature` > `'core'`. */
function resolveItemFeature(item: PluginMenuItem, manifest: PluginManifest | undefined): string {
  return item.feature ?? manifest?.feature ?? 'core';
}

export interface ResolvedPluginMenuItem {
  id: string;
  label: string;
  path: string;
  order?: number;
  section?: string;
  icon?: string;
  parent?: string;
  permissions?: string[];
  /** Feature de licencia que gobierna este item (ADR-0019). */
  feature?: string;
}

/**
 * Items de menú declarados por los plugins instalados, visibles en el `scope`
 * indicado (`public` = sitio público, `admin` = panel de administración).
 * Se integran de forma nativa (sin categoría "Plugins").
 */
export function collectPluginMenuItems(scope: 'public' | 'admin'): ResolvedPluginMenuItem[] {
  const items: ResolvedPluginMenuItem[] = [];
  for (const { pluginId, items: pluginItems } of pluginRegistry.getMenuItems()) {
    const manifest = resolveManifest(pluginId);
    for (const item of pluginItems) {
      const target = item.target ?? 'both';
      if (scope === 'public' && target === 'admin') continue;
      if (scope === 'admin' && target === 'public') continue;
      items.push({
        id: item.id,
        label: resolveLabel(item.label),
        path: item.path,
        order: item.order,
        section: resolveSection(pluginId, item.section, manifest),
        feature: resolveItemFeature(item, manifest),
        icon: item.icon,
        parent: item.parent,
        permissions: item.permissions,
      });
    }
  }
  return items;
}
