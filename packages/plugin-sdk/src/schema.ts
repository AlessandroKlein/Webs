/**
 * Subconjunto de JSON Schema (draft-07) usado para describir la configuración
 * de un bloque. La UI de administración genera automáticamente el formulario
 * de ajustes a partir de este esquema, por lo que un bloque **no necesita
 * escribir UI de configuración**: solo declara su esquema.
 *
 * La clave `x-ui` es una extensión propia de Webs para dar pistas de
 * renderizado (ej. `{ "x-ui": { "widget": "color" } }`).
 */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];

  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | string;
  enum?: unknown[];
  const?: unknown;

  // object
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  minProperties?: number;
  maxProperties?: number;

  // array
  items?: JsonSchema | JsonSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // string
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // number / integer
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // anyOf / oneOf / allOf
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];

  /** Extensión de Webs para pistas de renderizado del formulario automático. */
  'x-ui'?: Record<string, unknown>;
}
