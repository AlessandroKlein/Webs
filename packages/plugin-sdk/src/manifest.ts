import { z } from 'zod';
import type { JsonSchema } from './schema';

/** Versión del contrato de bloques que implementa este SDK. */
export const BLOCK_API_VERSION = '1.0.0';

/** Nombre de archivo del manifiesto dentro de un paquete de bloque. */
export const BLOCK_MANIFEST_FILENAME = 'block.json';

/** Texto localizable: mapa de locale BCP-47 a cadena. */
export interface LocalizedString {
  [locale: string]: string;
}

/**
 * Manifiesto de un bloque (`block.json`). Es el contrato público entre la
 * plataforma y un bloque: describe metadatos, puntos de entrada, esquema de
 * configuración, permisos y slots en los que puede ubicarse.
 */
export interface BlockManifest {
  /** Nombre de paquete (estilo npm). Ej: `@acme/block-store`. */
  name: string;
  /** Identificador único del bloque (slug). Ej: `store`. */
  id: string;
  /** Versión semántica del bloque. */
  version: string;
  /** Tipo de extensión. Reservado a `block` para este contrato. */
  type: 'block';
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
  /** Icono (clave de icono o nombre de archivo). */
  icon?: string;
  /** Palabras clave para el catálogo. */
  keywords?: string[];
  /** Punto de entrada del servidor (relativo al paquete). Default-exporta un `ServerBlock`. */
  entry?: string;
  /** Punto de entrada del cliente (relativo al paquete). Default-exporta un `ClientBlock`. */
  clientEntry?: string;
  /** Esquema JSON de la configuración del bloque (genera el formulario de admin). */
  settings?: JsonSchema;
  /** Permisos que el bloque declara/requiere. */
  permissions?: string[];
  /** Slots en los que el bloque puede ubicarse. */
  slots?: string[];
  /** Eventos de negocio que el bloque emite (ej. `order.created`). */
  events?: string[];
  /** Traducciones propias del bloque: locale → clave → texto. */
  translations?: Record<string, Record<string, string>>;
  /** Dependencias npm (peers). */
  dependencies?: Record<string, string>;
  /** Ids de bloques de Webs que este bloque requiere (se instalan automáticamente). */
  blockDependencies?: string[];
  /** Grupos de proveedores que este bloque registra (ej. `payment`, `storage`, `notification`). */
  provides?: string[];
  /** Grupos de proveedores que este bloque necesita (el usuario elige cuál instalar). */
  requiresProviders?: string[];
  /** Versión del contrato de bloques contra la que se escribió. */
  apiVersion: string;
}

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

export const blockManifestSchema = z.object({
  name: z.string().min(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-_]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/),
  type: z.literal('block'),
  displayName: localizedString,
  description: localizedString,
  author: z.string().min(1),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
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
  blockDependencies: z.array(z.string()).optional(),
  provides: z.array(z.string()).optional(),
  requiresProviders: z.array(z.string()).optional(),
  apiVersion: z.string(),
});

/** Valida y normaliza un manifiesto en tiempo de ejecución. */
export function parseBlockManifest(data: unknown): BlockManifest {
  return blockManifestSchema.parse(data) as BlockManifest;
}
