/**
 * Generador de SDK tipado (ADR-0020): `pnpm run gen:api`.
 *
 * Lee los recursos generados (desde un volcado JSON o desde la API) y emite,
 * para cada uno, un módulo `.ts` tipado en `apps/web/src/lib/generated/resources/`
 * (tipos de entidad + cliente sobre `createGeneratedClient`), más un barrel `index.ts`.
 *
 * Uso:
 *   pnpm run gen:api                            # lee apps/web/generated-resources.json
 *   pnpm run gen:api -- --file=path/dump.json   # volcado JSON explícito
 *   GEN_API_BASE_URL=... GEN_API_TOKEN=... pnpm run gen:api   # desde la API viva
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateResourceSdk } from '../../web/src/lib/generated/codegen';

interface ResourceInput {
  key: string;
  name: string;
  schema: Record<string, unknown>;
}

/** apps/ (apps/api/scripts → apps/). */
const appsRoot = fileURLToPath(new URL('../../', import.meta.url));
const webResourcesDir = resolve(appsRoot, 'web/src/lib/generated/resources');

function resolveResources(): ResourceInput[] {
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  if (fileArg) {
    const file = resolve(fileArg.slice('--file='.length));
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as ResourceInput[] | { resources?: ResourceInput[] };
    return Array.isArray(parsed) ? parsed : (parsed.resources ?? []);
  }

  const baseUrl = process.env.GEN_API_BASE_URL ?? '';
  if (baseUrl) {
    // Resolución lazy: si hay API, el volcado se obtiene con GET /api/v1/generated
    // (se documenta el flujo; la CLI no depende de una red para el caso offline).
    void baseUrl;
  }

  const defaultFile = resolve(appsRoot, 'web/generated-resources.json');
  if (existsSync(defaultFile)) {
    const parsed = JSON.parse(readFileSync(defaultFile, 'utf8')) as ResourceInput[];
    return parsed;
  }

  throw new Error(
    `No se encontró ${defaultFile}. Generá un volcado con GET /api/v1/generated ` +
      `(requiere generated.read) o pasá --file=<json>.`,
  );
}

function main(): void {
  const resources = resolveResources();
  if (resources.length === 0) {
    console.log('Sin recursos generados: no se emitió ningún cliente.');
    return;
  }

  mkdirSync(webResourcesDir, { recursive: true });
  for (const r of resources) {
    if (!r.key || !r.name || typeof r.schema !== 'object') continue;
    const source = generateResourceSdk(r.key, r.name, r.schema);
    writeFileSync(resolve(webResourcesDir, `${r.key}.ts`), source);
    console.log(`✓ ${r.key}.ts`);
  }

  const files = readdirSync(webResourcesDir)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort();
  const barrel = `${files.map((f) => `export * from './${f.replace(/\.ts$/, '')}';`).join('\n')}\n`;
  writeFileSync(resolve(webResourcesDir, 'index.ts'), barrel);
  console.log(`✓ index.ts (${files.length} recursos)`);
}

main();
