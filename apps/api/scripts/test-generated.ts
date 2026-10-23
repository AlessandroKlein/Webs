/**
 * Smoke test del motor generador de APIs (ADR-0020 / t105 + fix F1 t192).
 *
 * Verifica la lógica pura (normalización, validación Ajv, sanitización HTML,
 * permisos por recurso y gate por feature) sin depender de una DB viva:
 * los clientes Prisma y Redis se simulan.
 *
 * Cubre el fix F1: los permisos dinámicos `gen.<key>.read/write` son efectivos
 * SIN re-login (consulta a BD en tiempo real) y un `api_token` sin scope sigue
 * recibiendo 403 (sin escalada a los permisos del usuario).
 *
 * Ejecutar: pnpm --filter @webs/api exec tsx scripts/test-generated.ts
 */
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@webs/core';
import Fastify from 'fastify';
import {
  assertLicensed,
  assertUnique,
  assertValidJsonSchema,
  hasGenPermission,
  invalidateValidator,
  normalizeKey,
  resolveAccessibleResource,
  sanitizeData,
  validateRecord,
} from '../src/modules/generated/service';
import generatedRoutes from '../src/modules/generated/routes';

let checks = 0;
let failures = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
}

async function throwsAsync(fn: () => Promise<unknown>, ctor: new (...a: never[]) => Error): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    return err instanceof ctor;
  }
}

interface MakeFastifyOpts {
  superAdmin?: boolean;
  granted?: string[];
}

function makeFastify(resource: unknown, licensed: boolean, key = 'ok', opts: MakeFastifyOpts = {}) {
  const { superAdmin = false, granted = [] } = opts;
  return {
    redis: null,
    license: { hasFeature: (f: string) => (f === 'core' ? true : licensed) },
    prisma: {
      generatedResource: {
        findUnique: async ({ where }: { where: { key: string } }) =>
          where.key === key ? resource : null,
      },
      userRole: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          const role = (where.role ?? {}) as {
            key?: string;
            permissions?: { some?: { permission?: { key?: string } } };
          };
          if (role.key === 'super_admin') return superAdmin ? { id: 'ur-sa' } : null;
          const perm = role.permissions?.some?.permission?.key;
          return perm && granted.includes(perm) ? { id: 'ur1' } : null;
        },
      },
    },
  } as unknown as Parameters<typeof resolveAccessibleResource>[0];
}

async function main(): Promise<void> {
  // 1. normalizeKey
  ok(normalizeKey('Mi Recurso!') === 'mi-recurso', 'normalizeKey slugifica nombre');
  ok(normalizeKey('  ') === 'resource', 'normalizeKey fallback a «resource»');

  // 2. assertValidJsonSchema
  ok(await (async () => { assertValidJsonSchema({ type: 'object' }); return true; })(), 'schema válido aceptado');
  ok(
    await throwsAsync(async () => { assertValidJsonSchema('no-schema'); }, BadRequestError),
    'schema no-objeto → 400',
  );
  ok(
    await throwsAsync(async () => { assertValidJsonSchema({ type: 'nope' }); }, BadRequestError),
    'schema Ajv inválido → 400',
  );

  // 3. validateRecord
  const schema = {
    type: 'object',
    required: ['title'],
    additionalProperties: false,
    properties: { title: { type: 'string', minLength: 2 }, stock: { type: 'integer', minimum: 0 } },
  };
  ok((() => { validateRecord('ok', schema, { title: 'Hola', stock: 3 }); return true; })(), 'dato válido pasa');
  ok(
    (() => { try { validateRecord('ok', schema, { title: 'x', stock: -1 }); return false; } catch (e) { return e instanceof ValidationError; } })(),
    'dato inválido → 422',
  );

  // 4. sanitizeData (format html)
  const htmlSchema = {
    type: 'object',
    properties: { body: { type: 'string', format: 'html' }, nested: { type: 'object', properties: { html: { type: 'string', format: 'html' } } } },
  };
  const cleaned = sanitizeData(htmlSchema, {
    body: '<script>alert(1)</script><p>ok</p>',
    nested: { html: '<img src=x onerror=alert(1)>' },
  }) as { body: string; nested: { html: string } };
  ok(!cleaned.body.includes('<script>'), 'sanitize elimina <script>');
  ok(cleaned.body.includes('<p>ok</p>'), 'sanitize conserva <p>');
  ok(!cleaned.nested.html.includes('onerror'), 'sanitize anidado elimina onerror');

  // 5. hasGenPermission (consulta BD en tiempo real)
  const fxGrant = makeFastify({}, true, 'ok', { granted: ['gen.products.read'] });
  ok(await hasGenPermission(fxGrant, 'u1', 'gen.products.read'), 'rol con permiso → true');
  ok(!(await hasGenPermission(fxGrant, 'u1', 'gen.products.write')), 'sin permiso → false');
  const fxSuper = makeFastify({}, true, 'ok', { superAdmin: true });
  ok(await hasGenPermission(fxSuper, 'u1', 'gen.products.write'), 'super_admin → true (sin permiso explícito)');

  // 6. resolveAccessibleResource — mismo token (fix F1): permissions del JWT STALE
  //    (vacías) pero la BD ya tiene el permiso recién creado → 200, no 403.
  const resource = { id: 'r1', key: 'ok', name: 'Ok', description: null, feature: 'core', enabled: true, schema };
  const fxFresh = makeFastify(resource, true, 'ok', { granted: ['gen.ok.read'] });
  const resolved = await resolveAccessibleResource(
    fxFresh,
    'ok',
    { sub: 'u1', permissions: [] /* JWT stale */, type: 'access' },
    'read',
  );
  ok(resolved.key === 'ok', 'mismo token + permiso recién creado en BD → 200 (sin re-login)');

  ok(
    await throwsAsync(() => resolveAccessibleResource(fxFresh, 'missing', { sub: 'u1', type: 'access' }, 'read'), NotFoundError),
    'recurso inexistente → 404',
  );
  const premium = makeFastify({ ...resource, key: 'premium', feature: 'generator' }, false, 'premium');
  ok(
    await throwsAsync(() => resolveAccessibleResource(premium, 'premium', { sub: 'u1', type: 'access' }, 'read'), ForbiddenError),
    'feature no licenciada → 403',
  );

  // 7. resolveAccessibleResource — api_token sin scope `gen.*` → 403 (sin escalada).
  ok(
    await throwsAsync(
      () => resolveAccessibleResource(fxFresh, 'ok', { sub: 'u1', permissions: ['gen.ok.read'], type: 'api_token' }, 'write'),
      ForbiddenError,
    ),
    'api_token sin scope gen.write → 403 (sin escalada)',
  );
  ok(
    (await (async () => {
      const r = await resolveAccessibleResource(
        fxFresh,
        'ok',
        { sub: 'u1', permissions: ['gen.ok.read'], type: 'api_token' },
        'read',
      );
      return r.key === 'ok';
    })()),
    'api_token con scope gen.read → 200',
  );

  // 8. fix F2: invalidateValidator → recompila con el nuevo schema (PATCH).
  const v1 = {
    type: 'object', required: ['title'], additionalProperties: false,
    properties: { title: { type: 'string', minLength: 2 } },
  };
  const v2 = {
    type: 'object', required: ['title'], additionalProperties: false,
    properties: { title: { type: 'string', minLength: 10 } },
  };
  (() => { validateRecord('f2', v1, { title: 'ab' }); })(); // cachea v1 (minLength 2)
  invalidateValidator('f2');
  ok(
    (() => { try { validateRecord('f2', v2, { title: 'ab' }); return false; } catch (e) { return e instanceof ValidationError; } })(),
    'F2 invalidateValidator → recompila con el nuevo schema (minLength 10 rechaza «ab»)',
  );

  // 9. fix F3: assertUnique (x-unique) — unicidad SCOPED por organización.
  const uniqueSchema = {
    type: 'object',
    properties: { email: { type: 'string', 'x-unique': true }, name: { type: 'string' } },
  };
  const existingRows = [
    { id: 'r1', resourceId: 'products', organizationId: 'org-a', data: { email: 'dup@x.com' } },
  ];
  const uniqueFastify = {
    prisma: {
      generatedRecord: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => {
          const w = where as { organizationId?: string; id?: { not?: string }; data?: { path: string[]; equals: unknown } };
          const key = w.data?.path?.[0] ?? '';
          const value = w.data?.equals;
          const excludeId = w.id?.not;
          const found = existingRows.find(
            (r) =>
              r.organizationId === w.organizationId &&
              r.id !== excludeId &&
              (r.data as Record<string, unknown>)[key] === value,
          );
          return found ? { id: found.id } : null;
        },
      },
    },
  } as unknown as Parameters<typeof assertUnique>[0];

  ok(
    await throwsAsync(
      () => assertUnique(uniqueFastify, 'products', uniqueSchema, { email: 'dup@x.com' }, { organizationId: 'org-a' }),
      ConflictError,
    ),
    'F3 x-unique duplicado en el MISMO scope → 409',
  );
  ok(
    await (async () => { await assertUnique(uniqueFastify, 'products', uniqueSchema, { email: 'nueva@x.com' }, { organizationId: 'org-a' }); return true; })(),
    'F3 x-unique valor nuevo → OK',
  );
  ok(
    await (async () => { await assertUnique(uniqueFastify, 'products', uniqueSchema, { email: 'dup@x.com' }, { organizationId: 'org-b' }); return true; })(),
    'F3 x-unique mismo valor en OTRA org → OK',
  );
  ok(
    await (async () => { await assertUnique(uniqueFastify, 'products', uniqueSchema, { email: 'dup@x.com' }, { organizationId: 'org-a' }, 'r1'); return true; })(),
    'F3 x-unique PATCH excluye el propio registro → OK',
  );

  // 10. fix F4: CRUD de recursos gateado por feature 'generator'.
  ok(
    (() => { assertLicensed(makeFastify({}, true, 'ok'), 'generator'); return true; })(),
    'F4 assertLicensed(generator) con feature → OK',
  );
  ok(
    (() => { try { assertLicensed(makeFastify({}, false, 'ok'), 'generator'); return false; } catch (e) { return e instanceof ForbiddenError; } })(),
    'F4 assertLicensed(generator) sin licencia → 403',
  );

  const makeApp = async (licensed: boolean) => {
    const app: any = Fastify();
    app.decorate('authenticate', async (request: { user?: unknown }) => {
      request.user = { sub: 'u1', permissions: [], type: 'access' };
    });
    app.decorate('authorize', () => async () => {});
    app.decorate('requireTenant', async (request: { tenant?: unknown }) => {
      request.tenant = { organizationId: 'org-a', chainId: null, isSuperAdmin: false, isChainAdmin: false };
    });
    app.decorate('license', { hasFeature: (f: string) => (f === 'core' ? true : licensed) });
    app.decorate('redis', null);
    app.decorate('prisma', { generatedResource: { findMany: async () => [] } });
    await app.register(generatedRoutes);
    return app;
  };

  const appOff = await makeApp(false);
  const resOff = await appOff.inject({ method: 'GET', url: '/generated' });
  ok(resOff.statusCode === 403, `F4 GET /generated sin feature generator → 403 (${resOff.statusCode})`);
  await appOff.close();

  const appOn = await makeApp(true);
  const resOn = await appOn.inject({ method: 'GET', url: '/generated' });
  ok(resOn.statusCode === 200, `F4 GET /generated con feature generator → 200 (${resOn.statusCode})`);
  await appOn.close();

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks} checks, ${failures} fallos`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
