/**
 * Utilidades de codegen: JSON Schema (subset v1 del generador de APIs, ADR-0020)
 * → tipos TypeScript. Funciones puras, sin dependencias de runtime de Vite.
 */

type JsonSchema = Record<string, unknown>;

/** Convierte un literal de enum a su representación literal en TypeScript. */
function literalToTs(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(String(value));
}

/** Mapea un único tipo primitivo/compuesto de JSON Schema a TypeScript. */
function mapSingleType(type: string, schema: JsonSchema): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array': {
      const items = (schema.items ?? {}) as JsonSchema;
      return `Array<${jsonSchemaToTsType(items)}>`;
    }
    case 'object': {
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = new Set<string>(
        Array.isArray(schema.required) ? (schema.required as string[]) : [],
      );
      const keys = Object.keys(properties);
      if (keys.length === 0) return 'Record<string, unknown>';
      const fields = keys.map((key) => {
        const prop = properties[key] ?? {};
        const optional = required.has(key) ? '' : '?';
        return `${key}${optional}: ${jsonSchemaToTsType(prop)};`;
      });
      return `{ ${fields.join(' ')} }`;
    }
    default:
      return 'unknown';
  }
}

/**
 * Convierte un (sub)schema JSON a una expresión de tipo TypeScript inline.
 * Soporta `enum`, `type` (simple o unión), `array.items` y `object.properties`
 * (con `required` marcando opcionales).
 */
export function jsonSchemaToTsType(schema: JsonSchema): string {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map(literalToTs).join(' | ');
  }

  const rawType = schema.type;
  const typeList: string[] = Array.isArray(rawType)
    ? (rawType as string[])
    : typeof rawType === 'string'
      ? [rawType]
      : [];

  if (typeList.length === 0) {
    // Sin `type`: infiere `object` si hay properties o `array` si hay items.
    if (schema.properties && typeof schema.properties === 'object') {
      return jsonSchemaToTsType({ ...schema, type: 'object' });
    }
    if (schema.items) {
      return jsonSchemaToTsType({ ...schema, type: 'array' });
    }
    return 'unknown';
  }

  const mapped = typeList.map((t) => mapSingleType(t, schema));
  return mapped.length === 1 ? (mapped[0] ?? 'unknown') : mapped.join(' | ');
}
