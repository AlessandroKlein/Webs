import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEnv, resolveLicenseMode } from '../src/config/env';
import { LicenseService } from '../src/modules/licenses/service';

/**
 * Contrato del gate de licencias (Licensify Fase 1).
 *
 * - `LICENSE_MODE=dev` habilita todo SOLO fuera de producción.
 * - Producción sin clave/licencia arranca en modo production (núcleo), no
 *   habilita features premium por accidente.
 * - `NODE_ENV=production` + `LICENSE_MODE=dev` NO arranca.
 */

const JWT = 'x'.repeat(48);
const JWT_REFRESH = 'y'.repeat(48);

test('development sin LICENSE_MODE resuelve a dev', () => {
  const env = loadEnv({ NODE_ENV: 'development' });
  assert.equal(env.LICENSE_MODE, 'auto');
  assert.equal(resolveLicenseMode(env), 'dev');
});

test('producción + LICENSE_MODE=dev no arranca', () => {
  assert.throws(
    () =>
      loadEnv({
        NODE_ENV: 'production',
        JWT_SECRET: JWT,
        JWT_REFRESH_SECRET: JWT_REFRESH,
        LICENSE_MODE: 'dev',
      }),
    /licencia inválida/i,
  );
});

test('producción sin licencia arranca en modo production (sólo núcleo)', () => {
  const env = loadEnv({
    NODE_ENV: 'production',
    JWT_SECRET: JWT,
    JWT_REFRESH_SECRET: JWT_REFRESH,
  });
  assert.equal(resolveLicenseMode(env), 'production');
  const service = new LicenseService(undefined, 'production');
  assert.equal(service.devMode, false);
  assert.equal(service.hasFeature('payments'), false);
  assert.equal(service.hasFeature('core'), true);
});

test('LicenseService en dev habilita todas las features sin licencia', () => {
  const service = new LicenseService(undefined, 'dev');
  const state = service.status();
  assert.equal(service.devMode, true);
  assert.equal(state.status, 'active');
  assert.equal(state.configured, true);
  assert.ok(state.features.includes('payments'));
  assert.ok(state.features.includes('inventory'));
  assert.equal(service.hasFeature('payments'), true);
  assert.equal(service.hasFeature('ai'), true);
});
