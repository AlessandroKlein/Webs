import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifrado de datos sensibles (PII) a nivel de campo con **AES-256-GCM**
 * (autenticado). Usa una clave maestra derivada de `ENCRYPTION_KEY`.
 *
 * Formato de salida: `iv.tag.ciphertext` (base64, separado por `.`).
 * Nunca guardes estos valores en texto plano en la base de datos.
 */

/**
 * Deriva la clave maestra de 32 bytes a partir de `ENCRYPTION_KEY` usando
 * SHA-256. Lanza un error si la variable de entorno no está configurada.
 */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY no está configurada (necesaria para cifrar datos sensibles)');
  }
  return createHash('sha256').update(secret).digest();
}

/** Cifra una cadena con AES-256-GCM y devuelve `iv.tag.ciphertext` en base64. */
export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.');
}

/** Descifra un valor en formato `iv.tag.ciphertext` y devuelve el texto plano. */
export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.');
  if (!iv || !tag || !data) throw new Error('Dato cifrado con formato inválido');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Indica si la clave de cifrado está configurada en el entorno. */
export function hasEncryptionKey(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}

/** Máscara con la que se sustituye un secreto al exponer ajustes por la API. */
export const SECRET_MASK = '••••••••';

/**
 * Subconjunto estructural del esquema de ajustes necesario para recorrer los
 * campos marcados como `x-ui.secret`. La API pública recibe `unknown` para no
 * acoplar `@webs/core` al tipo `JsonSchema` de `@webs/plugin-sdk`.
 */
interface SecretSchema {
  type?: string | string[];
  properties?: Record<string, SecretSchema | undefined>;
  items?: SecretSchema | SecretSchema[];
  'x-ui'?: { secret?: boolean };
}

/** Indica si el `type` del esquema (string o array de strings) incluye `t`. */
function schemaIs(schema: SecretSchema, t: string): boolean {
  const type = schema.type;
  if (type === t) return true;
  return Array.isArray(type) && type.includes(t);
}

/** Esquema de un ítem de array (soporta `items` único o tupla). */
function itemSchemaAt(
  items: SecretSchema | SecretSchema[] | undefined,
  index: number,
): SecretSchema | undefined {
  if (!items) return undefined;
  if (!Array.isArray(items)) return items;
  if (items.length === 0) return undefined;
  return items[index] ?? items[items.length - 1];
}

/**
 * Recorre `value` siguiendo `schema` y aplica `transform` a cada campo
 * `x-ui.secret` (string no vacía), recurriendo en objetos anidados y en arrays.
 */
function walkSecretFields(
  schema: SecretSchema | undefined,
  value: unknown,
  transform: (raw: string) => string,
): unknown {
  if (!schema || value === undefined || value === null) return value;

  if (schema['x-ui']?.secret && typeof value === 'string' && value !== '') {
    return transform(value);
  }

  if (schemaIs(schema, 'object') && schema.properties && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = { ...obj };
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (!prop) continue;
      out[key] = walkSecretFields(prop, out[key], transform);
    }
    return out;
  }

  if (schemaIs(schema, 'array') && Array.isArray(value)) {
    return value.map((item, i) => walkSecretFields(itemSchemaAt(schema.items, i), item, transform));
  }

  return value;
}

/**
 * Cifra los campos marcados como `x-ui.secret` en un valor de ajustes. Recurre
 * objetos y arrays anidados. Sin `ENCRYPTION_KEY` no cifra (avisa y deja el
 * valor tal cual, para no romper el arranque).
 */
export function encryptSecretFields(schema: unknown, value: Record<string, unknown>): Record<string, unknown> {
  const s = schema as SecretSchema | undefined;
  if (!s?.properties) return value;
  if (!hasEncryptionKey()) {
    console.warn('[crypto] ENCRYPTION_KEY no definida; los campos secretos se guardan sin cifrar');
    return value;
  }
  return walkSecretFields(s, value, encrypt) as Record<string, unknown>;
}

/** Descifra los campos marcados como `x-ui.secret` (tolerante a valores planos). */
export function decryptSecretFields(schema: unknown, value: Record<string, unknown>): Record<string, unknown> {
  const s = schema as SecretSchema | undefined;
  if (!s?.properties) return value;
  return walkSecretFields(s, value, (raw) => {
    try {
      return decrypt(raw);
    } catch {
      return raw;
    }
  }) as Record<string, unknown>;
}

/** Enmascara los campos `x-ui.secret` (para exponer ajustes sin el secreto crudo). */
export function redactSecretFields(schema: unknown, value: Record<string, unknown>): Record<string, unknown> {
  return walkSecretFields(schema as SecretSchema | undefined, value, () => SECRET_MASK) as Record<string, unknown>;
}

/**
 * Al guardar ajustes, reemplaza los secretos que llegan con {@link SECRET_MASK}
 * («sin cambios») por el valor en claro ya existente.
 */
export function restoreMaskedSecrets(
  schema: unknown,
  incoming: Record<string, unknown>,
  existingPlain: Record<string, unknown>,
): Record<string, unknown> {
  return mergeMaskedSecrets(schema as SecretSchema | undefined, incoming, existingPlain) as Record<string, unknown>;
}

function mergeMaskedSecrets(
  schema: SecretSchema | undefined,
  incoming: unknown,
  existing: unknown,
): unknown {
  if (!schema) return incoming;

  if (schema['x-ui']?.secret && typeof incoming === 'string' && incoming === SECRET_MASK) {
    return typeof existing === 'string' && existing !== '' ? existing : incoming;
  }

  if (schemaIs(schema, 'object') && schema.properties && typeof incoming === 'object' && !Array.isArray(incoming)) {
    const inc = incoming as Record<string, unknown>;
    const ex = (typeof existing === 'object' && existing !== null && !Array.isArray(existing)
      ? existing
      : {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { ...inc };
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (!prop) continue;
      out[key] = mergeMaskedSecrets(prop, inc[key], ex[key]);
    }
    return out;
  }

  if (schemaIs(schema, 'array') && Array.isArray(incoming)) {
    const exArr = Array.isArray(existing) ? existing : [];
    return incoming.map((item, i) => mergeMaskedSecrets(itemSchemaAt(schema.items, i), item, exArr[i]));
  }

  return incoming;
}
