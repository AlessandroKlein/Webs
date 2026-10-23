/**
 * SDK/API client del generador de APIs (ADR-0020).
 *
 * - `createGeneratedClient` — cliente tipado en runtime (auth + errores via `api.ts`).
 * - `jsonSchemaToTsType` / `generateEntityType` / `generateResourceSdk` — codegen
 *   estático (`pnpm run gen:api`) que produce módulos `.ts` tipados por recurso.
 */
export { createGeneratedClient } from './client';
export type { GeneratedClient, GeneratedRecord, GeneratedResourceSchema } from './client';
export { jsonSchemaToTsType } from './schema-to-ts';
export { generateEntityType, generateResourceSdk, toCamelCase, toPascalCase } from './codegen';
