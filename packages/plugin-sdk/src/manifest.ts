import { z } from 'zod';
import type { JsonSchema } from './schema';

/** Versión del contrato de plugins que implementa este SDK. */
export const PLUGIN_API_VERSION = '1.0.0';

/**
 * Nombre de archivo del manifiesto dentro de un paquete de plugin.
 * Los paquetes nuevos usan `plugin.json`; los bloques legacy (`block.json`)
 * siguen siendo detectados durante la migración (M1).
 */
export const PLUGIN_MANIFEST_FILENAME = 'plugin.json';

/**
 * @deprecated Usar {@link PLUGIN_MANIFEST_FILENAME}. Se conserva por
 * retrocompatibilidad con bloques legacy que aún publican `block.json`.
 */
export const BLOCK_MANIFEST_FILENAME = 'block.json';

/**
 * @deprecated Usar {@link PLUGIN_API_VERSION}. Se conserva como alias para que
 * los bloques legacy sigan compilando durante la migración.
 */
export const BLOCK_API_VERSION = PLUGIN_API_VERSION;

/** Texto localizable: mapa de locale BCP-47 a cadena. */
export interface LocalizedString {
  [locale: string]: string;
}

/** Destino de visibilidad de un item de menú declarado por un plugin. */
export type PluginMenuTarget = 'admin' | 'public' | 'both';

/**
 * Item de menú declarado en `manifest.menu`. Se integra de forma nativa en el
 * menú público y/o de administración, sin categoría artificial "Plugins".
 */
export interface PluginMenuItem {
  /** Identificador estable del item (único dentro del plugin). */
  id: string;
  /** Texto visible, localizado. */
  label: LocalizedString;
  /** Ruta a la que apunta el item (ej. `/admin/plugins/store` o `/store`). */
  path: string;
  /** Sección visual del menú (opcional). */
  section?: string;
  /** Icono (clave de icono o nombre de archivo). */
  icon?: string;
  /** Orden relativo dentro de su sección (menor = primero). */
  order?: number;
  /** Id de un item padre para anidar (opcional). */
  parent?: string;
  /** Permisos requeridos para ver el item (opcional). */
  permissions?: string[];
  /** Dónde se muestra. Default `both`. */
  target?: PluginMenuTarget;
}

/**
 * Manifiesto de un plugin (`plugin.json`). Es el contrato público entre la
 * plataforma y un plugin: describe metadatos, puntos de entrada, esquema de
 * configuración, permisos, items de menú y slots en los que puede ubicarse.
 */
export interface PluginManifest {
  /** Nombre de paquete (estilo npm). Ej: `@acme/plugin-store`. */
  name: string;
  /** Identificador único del plugin (slug). Ej: `store`. */
  id: string;
  /** Versión semántica del plugin. */
  version: string;
  /** Tipo de extensión. `plugin` (nuevo) o `block` (legacy, aún aceptado). */
  type: 'plugin' | 'block';
  /** Nombre visible, localizado. */
  displayName: LocalizedString;
  /** Descripción localizada. */
  description: LocalizedString;
  /** Autor(es). */
  author: string;
  /** Licencia SPDX (opcional). */
  license?: string;
  /** URL del proyecto (opcional). */
  homepage?: string;
  /** URL del repositorio fuente (ej. GitHub) desde donde se descarga el plugin (ADR-0016). */
  repository?: string;
  /** Cómo obtener el plugin (default `git` cuando `repository` está presente). */
  source?: 'git' | 'npm';
  /** Icono (clave de icono o nombre de archivo). */
  icon?: string;
  /** Palabras clave para el catálogo. */
  keywords?: string[];
  /** Punto de entrada del servidor (relativo al paquete). Default-exporta un `ServerPlugin`. */
  entry?: string;
  /** Punto de entrada del cliente (relativo al paquete). Default-exporta un `ClientPlugin`. */
  clientEntry?: string;
  /** Esquema JSON de la configuración del plugin (genera el formulario de admin). */
  settings?: JsonSchema;
  /** Permisos que el plugin declara/requiere. */
  permissions?: string[];
  /** Slots en los que el plugin puede ubicarse. */
  slots?: string[];
  /** Eventos de negocio que el plugin emite (ej. `order.created`). */
  events?: string[];
  /** Traducciones propias del plugin: locale → clave → texto. */
  translations?: Record<string, Record<string, string>>;
  /** Dependencias npm (peers). */
  dependencies?: Record<string, string>;
  /** Ids de plugins de Webs que este plugin requiere (se instalan automáticamente). */
  pluginDependencies?: string[];
  /** @deprecated Ids de bloques legacy de Webs que este plugin requiere. Usar {@link pluginDependencies}. */
  blockDependencies?: string[];
  /** Categoría del plugin para agrupar en el catálogo (ej. pago, contenido, seo, comunicación). */
  category?: string;
  /** Grupos de proveedores que este plugin registra (ej. `payment`, `storage`, `notification`). */
  provides?: string[];
  /** Grupos de proveedores que este plugin necesita (el usuario elige cuál instalar). */
  requiresProviders?: string[];
  /** Items de menú nativos declarados por el plugin (integrado sin categoría "Plugins"). */
  menu?: PluginMenuItem[];
  /** Versión del contrato de plugins contra la que se escribió. */
  apiVersion: string;
}

/** @deprecated Usar {@link PluginManifest}. Alias por retrocompatibilidad. */
export type BlockManifest = PluginManifest;

const localizedString = z
  .record(z.string(), z.string())
  .refine((v) => Object.keys(v).length > 0, 'debe tener al menos una localización');

const jsonSchemaLoose: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    $schema: z.string().optional(),
    $id: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    examples: z.array(z.unknown()).optional(),
    type: z.string().optional(),
    enum: z.array(z.unknown()).optional(),
    const: z.unknown().optional(),
    properties: z.record(z.string(), jsonSchemaLoose).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.union([z.boolean(), jsonSchemaLoose]).optional(),
    items: z.union([jsonSchemaLoose, z.array(jsonSchemaLoose)]).optional(),
    minItems: z.number().optional(),
    maxItems: z.number().optional(),
    uniqueItems: z.boolean().optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    pattern: z.string().optional(),
    format: z.string().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    anyOf: z.array(jsonSchemaLoose).optional(),
    oneOf: z.array(jsonSchemaLoose).optional(),
    allOf: z.array(jsonSchemaLoose).optional(),
    'x-ui': z.record(z.unknown()).optional(),
  }),
);

export const pluginMenuItemSchema = z.object({
  id: z.string().min(1),
  label: localizedString,
  path: z.string().min(1),
  section: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().optional(),
  parent: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  target: z.enum(['admin', 'public', 'both']).optional(),
});

export const pluginManifestSchema = z.object({
  name: z.string().min(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/),
  type: z.enum(['plugin', 'block']),
  displayName: localizedString,
  description: localizedString,
  author: z.string().min(1),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  source: z.enum(['git', 'npm']).optional(),
  icon: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  entry: z.string().optional(),
  clientEntry: z.string().optional(),
  settings: jsonSchemaLoose.optional(),
  permissions: z.array(z.string()).optional(),
  slots: z.array(z.string()).optional(),
  events: z.array(z.string()).optional(),
  translations: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  pluginDependencies: z.array(z.string()).optional(),
  blockDependencies: z.array(z.string()).optional(),
  category: z.string().optional(),
  provides: z.array(z.string()).optional(),
  requiresProviders: z.array(z.string()).optional(),
  menu: z.array(pluginMenuItemSchema).optional(),
  apiVersion: z.string(),
});

/** @deprecated Usar {@link pluginManifestSchema}. Alias por retrocompatibilidad. */
export const blockManifestSchema = pluginManifestSchema;

/** Valida y normaliza un manifiesto en tiempo de ejecución. */
export function parsePluginManifest(data: unknown): PluginManifest {
  return pluginManifestSchema.parse(data) as PluginManifest;
}

/** @deprecated Usar {@link parsePluginManifest}. Alias por retrocompatibilidad. */
export function parseBlockManifest(data: unknown): PluginManifest {
  return parsePluginManifest(data);
}
