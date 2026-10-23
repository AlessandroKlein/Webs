/**
 * Helpers del generador de APIs (ADR-0020 / t107): tipos de campo, construcción
 * del JSON Schema desde el formulario y generación del SDK tipado copiable.
 */

import i18next from '../../lib/i18n';

export type FieldType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'enum';

export interface FieldDef {
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  /** Solo para `string`: marca `format: "html"` (sanitizado server-side). */
  format?: 'html';
  /** Solo para `enum`: valores separados por coma. */
  enumValues?: string;
}

export interface GeneratedResource {
  id: string;
  key: string;
  name: string;
  description: string | null;
  feature: string;
  enabled: boolean;
  schema: unknown;
}

export interface GeneratedSchema {
  type: 'object';
  properties?: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Réplica client-side del `normalizeKey` del motor (apps/api/src/modules/generated/service.ts). */
export function normalizeKey(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'resource';
}

function pascalCase(key: string): string {
  const parts = key.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const value = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return value || 'Resource';
}

function camelCase(key: string): string {
  const p = pascalCase(key);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** Convierte un campo del formulario a su fragmento JSON Schema. */
export function fieldToSchema(field: FieldDef): Record<string, unknown> {
  switch (field.type) {
    case 'string': {
      const s: Record<string, unknown> = { type: 'string' };
      if (field.format === 'html') s.format = 'html';
      if (field.unique) s['x-unique'] = true;
      return s;
    }
    case 'integer':
      return { type: 'integer', ...(field.unique ? { 'x-unique': true } : {}) };
    case 'number':
      return { type: 'number', ...(field.unique ? { 'x-unique': true } : {}) };
    case 'boolean':
      return { type: 'boolean' };
    case 'array':
      return { type: 'array', items: { type: 'string' } };
    case 'enum': {
      const values = (field.enumValues ?? '').split(',').map((v) => v.trim()).filter(Boolean);
      return { enum: values };
    }
  }
}

/** Construye el JSON Schema (draft 2020-12) del recurso desde los campos. */
export function buildSchema(fields: FieldDef[]): GeneratedSchema {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const field of fields) {
    const name = field.name.trim();
    if (!name) continue;
    properties[name] = fieldToSchema(field) as Record<string, unknown>;
    if (field.required) required.push(name);
  }
  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  };
}

function tsTypeForSchema(name: string, prop: Record<string, unknown> | undefined, required: boolean): string {
  let ts: string;
  const type = prop?.type;
  if (type === 'integer' || type === 'number') ts = 'number';
  else if (type === 'boolean') ts = 'boolean';
  else if (type === 'array') ts = 'string[]';
  else if (Array.isArray(prop?.enum) && (prop!.enum as unknown[]).length > 0) {
    ts = (prop!.enum as string[]).map((v) => `'${String(v).replace(/'/g, "\\'")}'`).join(' | ');
  } else ts = 'string';

  const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
  return `${safeName}${required ? '' : '?'}: ${ts};`;
}

/** Genera el SDK tipado copiable (TypeScript) para un recurso. */
export function generateSdk(resource: { key: string; name: string; schema: unknown }): string {
  const schema = (resource.schema ?? {}) as GeneratedSchema;
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const Type = pascalCase(resource.key);
  const client = camelCase(resource.key);

  const lines: string[] = [];
  lines.push(`// ${i18next.t('generated.sdkComment', { name: resource.name, key: resource.key })}`);
  lines.push(`// ${i18next.t('generated.sdkGeneratedBy')}`);
  lines.push(`import { api } from '../lib/api';`);
  lines.push('');
  lines.push(`export interface ${Type} {`);
  for (const [name, prop] of Object.entries(properties)) {
    lines.push(`  ${tsTypeForSchema(name, prop, required.has(name))}`);
  }
  lines.push('}');
  lines.push('');
  lines.push(`export interface ${Type}Record extends ${Type} {`);
  lines.push('  id: string;');
  lines.push('  resourceId: string;');
  lines.push('  organizationId: string;');
  lines.push('  createdAt: string;');
  lines.push('  updatedAt: string;');
  lines.push('}');
  lines.push('');
  lines.push(`export const ${client} = {`);
  lines.push(`  list: () => api.get<${Type}Record[]>('/api/v1/generated/${resource.key}'),`);
  lines.push(`  get: (id: string) => api.get<${Type}Record>(\`/api/v1/generated/${resource.key}/\${id}\`),`);
  lines.push(`  create: (data: ${Type}) => api.post<${Type}Record>('/api/v1/generated/${resource.key}', data),`);
  lines.push(`  update: (id: string, data: Partial<${Type}>) => api.patch<${Type}Record>(\`/api/v1/generated/${resource.key}/\${id}\`, data),`);
  lines.push(`  remove: (id: string) => api.del<void>(\`/api/v1/generated/${resource.key}/\${id}\`),`);
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}
