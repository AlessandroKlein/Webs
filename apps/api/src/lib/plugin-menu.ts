import { pluginRegistry } from '../plugins/registry';

/** Resuelve un `LocalizedString` a un único string (preferencia `es` → `en` → primero). */
function resolveLabel(label: Record<string, string>): string {
  return label.es ?? label.en ?? Object.values(label)[0] ?? '';
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
}

/**
 * Items de menú declarados por los plugins instalados, visibles en el `scope`
 * indicado (`public` = sitio público, `admin` = panel de administración).
 * Se integran de forma nativa (sin categoría "Plugins").
 */
export function collectPluginMenuItems(scope: 'public' | 'admin'): ResolvedPluginMenuItem[] {
  const items: ResolvedPluginMenuItem[] = [];
  for (const { items: pluginItems } of pluginRegistry.getMenuItems()) {
    for (const item of pluginItems) {
      const target = item.target ?? 'both';
      if (scope === 'public' && target === 'admin') continue;
      if (scope === 'admin' && target === 'public') continue;
      items.push({
        id: item.id,
        label: resolveLabel(item.label),
        path: item.path,
        order: item.order,
        section: item.section,
        icon: item.icon,
        parent: item.parent,
        permissions: item.permissions,
      });
    }
  }
  return items;
}
