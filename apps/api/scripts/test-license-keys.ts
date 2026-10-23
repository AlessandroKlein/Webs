import {
  generateKeyPair,
  verifyActivationKey,
  LicenseExpiredError,
  type LicensePayload,
} from '@licensify/core';
import { issueActivationKey } from '../src/modules/licenses/keys';

let failures = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
}

async function main(): Promise<void> {
  const { publicKeyPem, privateKeyPem } = generateKeyPair();
  check('generateKeyPair devuelve pública + privada', Boolean(publicKeyPem) && Boolean(privateKeyPem));

  const fingerprint = 'a'.repeat(64);
  const payload: LicensePayload = {
    id: '11111111-1111-4111-8111-111111111111',
    productId: 'webs-pro',
    licensee: 'Cliente de prueba SRL',
    features: ['payments', 'inventory'],
    limits: { seats: 5 },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  };

  // 1. Emisión (mi helper en keys.ts) → clave de activación firmada Ed25519.
  const activationKey = issueActivationKey(payload, privateKeyPem, fingerprint);
  check('issueActivationKey devuelve clave no vacía', typeof activationKey === 'string' && activationKey.length > 16);

  // 2. Validación round-trip (generación → validación).
  const result = verifyActivationKey(activationKey, { publicKeyPem, fingerprint });
  check('verifyActivationKey valida la clave emitida', result.payload.id === payload.id);
  check('payload.productId coincide', result.payload.productId === 'webs-pro');
  check('payload.licensee coincide', result.payload.licensee === 'Cliente de prueba SRL');
  check('payload.features coincide', JSON.stringify(result.payload.features) === JSON.stringify(['payments', 'inventory']));
  check('payload.limits coincide', result.payload.limits?.seats === 5);

  // 3. Node-lock: fingerprint ajeno rechaza.
  let wrongFingerprintRejected = false;
  try {
    verifyActivationKey(activationKey, { publicKeyPem, fingerprint: 'b'.repeat(64) });
  } catch {
    wrongFingerprintRejected = true;
  }
  check('fingerprint ajeno rechazado (node-lock)', wrongFingerprintRejected);

  // 4. Clave firmada con OTRA privada → la pública la rechaza.
  const otherKeys = generateKeyPair();
  const forgedKey = issueActivationKey(payload, otherKeys.privateKeyPem, fingerprint);
  let forgedRejected = false;
  try {
    verifyActivationKey(forgedKey, { publicKeyPem, fingerprint });
  } catch {
    forgedRejected = true;
  }
  check('firma de otro vendedor rechazada', forgedRejected);

  // 5. Expiración: clave expirada → LicenseExpiredError.
  const expiredPayload: LicensePayload = {
    ...payload,
    id: '22222222-2222-4222-8222-222222222222',
    issuedAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
  };
  const expiredKey = issueActivationKey(expiredPayload, privateKeyPem, fingerprint);
  let expiredRejected = false;
  try {
    verifyActivationKey(expiredKey, { publicKeyPem, fingerprint });
  } catch (err) {
    expiredRejected = err instanceof LicenseExpiredError;
  }
  check('clave expirada rechazada con LicenseExpiredError', expiredRejected);

  console.log(failures === 0 ? '\nSMOKE PASS' : `\nSMOKE FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
