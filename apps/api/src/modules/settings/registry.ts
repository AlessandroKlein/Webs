import type { JsonSchema } from '@webs/plugin-sdk';

/**
 * Registro de "secciones de ajustes". Cada sección es un objeto de configuración
 * con un esquema JSON que la UI de administración usa para generar formularios
 * automáticamente. Los plugins registran aquí sus propios ajustes (ver
 * `apps/api/src/plugins/loader.ts`).
 */
export interface SettingSection {
  /** Clave única de la sección (ej. `site`, `appearance`). */
  key: string;
  /** Grupo para organizar la UI (ej. `general`, `seo`). */
  group: string;
  /** Esquema JSON del valor (genera el formulario). */
  schema: JsonSchema;
  /** Valores por defecto. */
  defaults: Record<string, unknown>;
}

const sections = new Map<string, SettingSection>();

export function registerSettingSection(section: SettingSection): void {
  if (sections.has(section.key)) {
    throw new Error(`La sección de ajustes '${section.key}' ya está registrada`);
  }
  sections.set(section.key, section);
}

export function getSettingSections(): SettingSection[] {
  return [...sections.values()];
}

export function getSettingSection(key: string): SettingSection | undefined {
  return sections.get(key);
}
