/**
 * Verificación de hardening de secretos (t38): los campos `x-ui.secret` anidados
 * en arrays/objetos se cifran en reposo y se enmascaran al exponer ajustes.
 *
 * Ejecutar desde `apps/api`: `npx tsx scripts/secret-redaction.test.ts`
 */
import assert from 'node:assert/strict';
import {
  SECRET_MASK,
  decryptSecretFields,
  encryptSecretFields,
  redactSecretFields,
  restoreMaskedSecrets,
} from '../src/lib/crypto';
import type { JsonSchema } from '@webs/plugin-sdk';

process.env.ENCRYPTION_KEY = 'test-master-key-0123456789';

const schema: JsonSchema = {
  type: 'object',
  properties: {
    providers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          clientId: { type: 'string' },
          clientSecret: { type: 'string', 'x-ui': { secret: true } },
        },
      },
    },
    apiKey: { type: 'string', 'x-ui': { secret: true } },
    autoLinkByEmail: { type: 'boolean' },
  },
};

interface Provider {
  id: string;
  clientId: string;
  clientSecret: string;
}

interface Config {
  providers: Provider[];
  apiKey: string;
  autoLinkByEmail: boolean;
}

const plaintext: Config = {
  providers: [
    { id: 'google', clientId: 'g-client', clientSecret: 'g-secret' },
    { id: 'github', clientId: 'gh-client', clientSecret: 'gh-secret' },
  ],
  apiKey: 'top-secret-key',
  autoLinkByEmail: true,
};

// 1) Cifrado en reposo: recursa arrays y objetos, y no deja secretos en claro.
const encrypted = encryptSecretFields(schema, plaintext as unknown as Record<string, unknown>) as unknown as Config;
assert.notEqual(encrypted.apiKey, 'top-secret-key', 'apiKey debe cifrarse');
assert.notEqual(encrypted.providers[0]!.clientSecret, 'g-secret', 'providers[0].clientSecret debe cifrarse');
assert.notEqual(encrypted.providers[1]!.clientSecret, 'gh-secret', 'providers[1].clientSecret debe cifrarse');
assert.match(encrypted.apiKey, /^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/, 'formato iv.tag.ciphertext');
assert.equal(encrypted.providers[0]!.clientId, 'g-client', 'clientId (no secreto) queda en claro');
assert.equal(encrypted.autoLinkByEmail, true, 'campo no secreto queda intacto');

// 2) Descifrado round-trip (lo que se guarda en DB es recuperable).
const decrypted = decryptSecretFields(schema, encrypted as unknown as Record<string, unknown>) as unknown as Config;
assert.deepEqual(decrypted, plaintext, 'round-trip cifrado/descifrado');

// 3) Enmascarado al leer: nunca se devuelve el secreto crudo.
const redacted = redactSecretFields(schema, encrypted as unknown as Record<string, unknown>) as unknown as Config;
assert.equal(redacted.apiKey, SECRET_MASK, 'apiKey debe salir enmascarado');
assert.equal(redacted.providers[0]!.clientSecret, SECRET_MASK, 'providers[0].clientSecret enmascarado');
assert.equal(redacted.providers[1]!.clientSecret, SECRET_MASK, 'providers[1].clientSecret enmascarado');
assert.equal(redacted.providers[0]!.clientId, 'g-client', 'clientId no se enmascara');
assert.ok(!JSON.stringify(redacted).includes('g-secret'), 'ningún clientSecret crudo en la respuesta');
assert.ok(!JSON.stringify(redacted).includes('top-secret-key'), 'apiKey crudo ausente');

// 4) Round-trip de formulario: una máscara «sin cambios» conserva el secreto previo.
const restored = restoreMaskedSecrets(
  schema,
  redacted as unknown as Record<string, unknown>,
  plaintext as unknown as Record<string, unknown>,
) as unknown as Config;
assert.deepEqual(restored, plaintext, 'restoreMaskedSecrets conserva secretos existentes');

// 5) Tolerancia: valores en claro previos se descifran sin error (transición).
const legacyPlain = decryptSecretFields(schema, plaintext as unknown as Record<string, unknown>);
assert.deepEqual(legacyPlain, plaintext, 'decrypt tolera valores sin cifrar');

console.log('secret-redaction: OK (cifrado en reposo + enmascarado verificados)');
