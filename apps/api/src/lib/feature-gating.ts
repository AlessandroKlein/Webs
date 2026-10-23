import type { FastifyInstance } from 'fastify';

/**
 * Feature-gating por licencia (ADR-0019).
 *
 * La única puerta de decisión es `LicenseService.hasFeature(feature)`:
 * `core` es siempre `true`; las features premium requieren una licencia
 * `configured && active` que incluya el flag. Estos helpers normalizan el
 * campo declarativo `feature` (default `'core'`) que llevan los manifiestos,
 * items de menú y entradas de catálogo, y evitan repetir la lógica en cada
 * módulo (menu / catalog / install).
 */

/** Feature que gobierna un recurso: `feature` declarada, o `'core'` por defecto. */
export function resolveFeature(feature: string | undefined | null): string {
  return feature && feature.length > 0 ? feature : 'core';
}

/** `true` si la feature está licenciada (core siempre lo está). */
export function isLicensed(fastify: FastifyInstance, feature: string | undefined | null): boolean {
  return fastify.license.hasFeature(resolveFeature(feature));
}
