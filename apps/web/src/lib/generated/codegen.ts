import { jsonSchemaToTsType } from './schema-to-ts';

type JsonSchema = Record<string, unknown>;

/** Convierte una clave de recurso (`blog-posts`) a un nombre de tipo (`BlogPost`). */
export function toPascalCase(key: string): string {
  const parts = key.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const pascal = parts.map((p) => (p.charAt(0)?.toUpperCase() ?? '') + p.slice(1)).join('');
  return pascal || 'Resource';
}

/** Convierte un nombre PascalCase a camelCase (`BlogPost` → `blogPost`). */
export function toCamelCase(key: string): string {
  const pascal = toPascalCase(key);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Genera el tipo de entidad (payload `data`) de un recurso a partir de su
 * JSON Schema. Los campos en `required` son obligatorios; el resto opcionales.
 */
export function generateEntityType(typeName: string, schema: JsonSchema): string {
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set<string>(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  );
  const lines: string[] = [];
  for (const [key, prop] of Object.entries(properties)) {
    if (typeof prop.description === 'string' && prop.description.trim()) {
      lines.push(`  /** ${prop.description.replace(/\*\//g, '').trim()} */`);
    }
    const optional = required.has(key) ? '' : '?';
    lines.push(`  ${key}${optional}: ${jsonSchemaToTsType(prop)};`);
  }
  if (lines.length === 0) {
    lines.push('  [key: string]: unknown;');
  }
  return `export interface ${typeName} {\n${lines.join('\n')}\n}`;
}

/**
 * Genera el módulo `.ts` completo (tipos + cliente tipado) de un recurso.
 * El cliente importa `createGeneratedClient` (auth/error handling de `api.ts`).
 */
export function generateResourceSdk(key: string, name: string, schema: JsonSchema): string {
  const typeName = toPascalCase(key);
  const entity = generateEntityType(typeName, schema);
  const clientVar = toCamelCase(key);
  return [
    `import { createGeneratedClient, type GeneratedRecord } from '../client';`,
    '',
    `/** Datos del recurso «${key}» (${name}). */`,
    entity,
    '',
    `/** Tipo de entrada para crear/actualizar un registro de «${key}». */`,
    `export type ${typeName}Input = ${typeName};`,
    '',
    `/** Registro persistido de «${key}». */`,
    `export type ${typeName}Record = GeneratedRecord<${typeName}>;`,
    '',
    `/** Cliente tipado del recurso generado «${key}» (ADR-0020). */`,
    `export const ${clientVar} = createGeneratedClient<${typeName}>('${key}');`,
    '',
  ].join('\n');
}
