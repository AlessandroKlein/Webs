import type { FastifyInstance } from 'fastify';
import { BadRequestError, ConflictError, NotFoundError } from '@webs/core';
import { DEFAULT_ORG_ID, resolveScope } from '../../lib/tenant';
import {
  assertLicensed,
  assertUnique,
  assertValidJsonSchema,
  ensureGenPermissions,
  invalidateResourceCache,
  invalidateValidator,
  normalizeKey,
  resolveAccessibleResource,
  resolveResource,
  sanitizeData,
  validateRecord,
} from './service';

/** Body de creación/actualización de un recurso generado. */
interface ResourceBody {
  name?: unknown;
  key?: unknown;
  description?: unknown;
  feature?: unknown;
  enabled?: unknown;
  schema?: unknown;
}

type Params = { key?: string; resource?: string; id?: string };

/** Normaliza el body de creación de recurso y devuelve `{ name, key, schema, ... }`. */
function parseResourceBody(body: ResourceBody): {
  name: string;
  key: string;
  description: string | null;
  feature: string;
  enabled: boolean;
  schema: unknown;
} {
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (!name) throw new BadRequestError('El nombre es obligatorio');
  const schema = body.schema;
  if (!schema || typeof schema !== 'object') throw new BadRequestError('El schema (JSON Schema) es obligatorio');
  assertValidJsonSchema(schema);

  const rawKey = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : '';
  const key = normalizeKey(rawKey || name);
  const description = typeof body.description === 'string' && body.description.trim()
    ? body.description.trim()
    : null;
  const feature = typeof body.feature === 'string' && body.feature.trim() ? body.feature.trim() : 'generator';
  const enabled = body.enabled === false ? false : true;
  return { name, key, description, feature, enabled, schema };
}

/** Proyección de recurso para la API. */
function toResourceView(resource: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  feature: string;
  enabled: boolean;
  schema: unknown;
}) {
  return {
    id: resource.id,
    key: resource.key,
    name: resource.name,
    description: resource.description,
    feature: resource.feature,
    enabled: resource.enabled,
    schema: resource.schema,
  };
}

/**
 * Motor generador de APIs (ADR-0020): CRUD de recursos generados (global) y de
 * registros de datos (scoped por organización), con validación JSON Schema y
 * sanitización HTML.
 */
export default async function generatedRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Recursos (global, sin scope) ──────────────────────────────────────────
  fastify.get(
    '/generated',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.authorize('generated.read')] },
    async () => {
      assertLicensed(fastify, 'generator');
      const resources = await fastify.prisma.generatedResource.findMany({ orderBy: { createdAt: 'asc' } });
      return resources.map(toResourceView);
    },
  );

  fastify.post(
    '/generated',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.authorize('generated.manage')] },
    async (request) => {
      assertLicensed(fastify, 'generator');
      const { name, key, description, feature, enabled, schema } = parseResourceBody(
        (request.body ?? {}) as ResourceBody,
      );
      const existing = await fastify.prisma.generatedResource.findUnique({ where: { key } });
      if (existing) throw new ConflictError(`Ya existe un recurso con la clave «${key}»`);

      const resource = await fastify.prisma.generatedResource.create({
        data: { key, name, description, feature, enabled, schema: schema as object },
      });
      await ensureGenPermissions(fastify, key);
      return toResourceView(resource);
    },
  );

  fastify.patch(
    '/generated/:key',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.authorize('generated.manage')] },
    async (request) => {
      assertLicensed(fastify, 'generator');
      const resourceKey = (request.params as Params).key ?? '';
      const existing = await resolveResource(fastify, resourceKey);
      if (!existing) throw new NotFoundError(`Recurso «${resourceKey}» no encontrado`);

      const body = (request.body ?? {}) as ResourceBody;
      const data: Record<string, unknown> = {};
      if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
      if (typeof body.description === 'string') data.description = body.description.trim() || null;
      if (typeof body.feature === 'string' && body.feature.trim()) data.feature = body.feature.trim();
      if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
      if (body.schema && typeof body.schema === 'object') {
        assertValidJsonSchema(body.schema);
        data.schema = body.schema;
      }

      const resource = await fastify.prisma.generatedResource.update({ where: { id: existing.id }, data });
      await invalidateResourceCache(fastify, resourceKey);
      invalidateValidator(resourceKey);
      return toResourceView(resource);
    },
  );

  fastify.delete(
    '/generated/:key',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.authorize('generated.manage')] },
    async (request) => {
      assertLicensed(fastify, 'generator');
      const resourceKey = (request.params as Params).key ?? '';
      const existing = await resolveResource(fastify, resourceKey);
      if (!existing) throw new NotFoundError(`Recurso «${resourceKey}» no encontrado`);

      await fastify.prisma.generatedRecord.deleteMany({ where: { resourceId: resourceKey } });
      await fastify.prisma.generatedResource.delete({ where: { id: existing.id } });
      await invalidateResourceCache(fastify, resourceKey);
      invalidateValidator(resourceKey);
      return { ok: true };
    },
  );

  // ── Registros (scoped por organización) ───────────────────────────────────
  fastify.get(
    '/generated/:resource',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.requireTenant] },
    async (request) => {
      const resource = await resolveAccessibleResource(
        fastify,
        (request.params as Params).resource ?? '',
        request.user,
        'read',
      );
      const scope = await resolveScope(fastify, request.tenant!);
      const records = await fastify.prisma.generatedRecord.findMany({
        where: { resourceId: resource.key, ...scope },
        orderBy: { createdAt: 'desc' },
      });
      return records;
    },
  );

  fastify.post(
    '/generated/:resource',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.requireTenant] },
    async (request) => {
      const resource = await resolveAccessibleResource(
        fastify,
        (request.params as Params).resource ?? '',
        request.user,
        'write',
      );
      const data = request.body ?? {};
      validateRecord(resource.key, resource.schema, data);
      const cleaned = sanitizeData(resource.schema, data);
      const scope = await resolveScope(fastify, request.tenant!);
      await assertUnique(fastify, resource.key, resource.schema, data as Record<string, unknown>, scope);
      const organizationId = request.tenant?.organizationId ?? DEFAULT_ORG_ID;
      const record = await fastify.prisma.generatedRecord.create({
        data: { resourceId: resource.key, organizationId, data: cleaned as object },
      });
      return record;
    },
  );

  fastify.get(
    '/generated/:resource/schema',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.requireTenant] },
    async (request) => {
      const resource = await resolveAccessibleResource(
        fastify,
        (request.params as Params).resource ?? '',
        request.user,
        'read',
      );
      return { key: resource.key, schema: resource.schema };
    },
  );

  fastify.get(
    '/generated/:resource/:id',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.requireTenant] },
    async (request) => {
      const params = request.params as Params;
      const resource = await resolveAccessibleResource(fastify, params.resource ?? '', request.user, 'read');
      const scope = await resolveScope(fastify, request.tenant!);
      const record = await fastify.prisma.generatedRecord.findFirst({
        where: { id: params.id ?? '', resourceId: resource.key, ...scope },
      });
      if (!record) throw new NotFoundError('Registro no encontrado');
      return record;
    },
  );

  fastify.patch(
    '/generated/:resource/:id',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.requireTenant] },
    async (request) => {
      const params = request.params as Params;
      const resource = await resolveAccessibleResource(fastify, params.resource ?? '', request.user, 'write');
      const scope = await resolveScope(fastify, request.tenant!);
      const existing = await fastify.prisma.generatedRecord.findFirst({
        where: { id: params.id ?? '', resourceId: resource.key, ...scope },
      });
      if (!existing) throw new NotFoundError('Registro no encontrado');

      const data = request.body ?? {};
      validateRecord(resource.key, resource.schema, data);
      const cleaned = sanitizeData(resource.schema, data);
      await assertUnique(
        fastify,
        resource.key,
        resource.schema,
        data as Record<string, unknown>,
        scope,
        existing.id,
      );
      const record = await fastify.prisma.generatedRecord.update({
        where: { id: existing.id },
        data: { data: cleaned as object },
      });
      return record;
    },
  );

  fastify.delete(
    '/generated/:resource/:id',
    { schema: { tags: ['generated'] }, preHandler: [fastify.authenticate, fastify.requireTenant] },
    async (request) => {
      const params = request.params as Params;
      const resource = await resolveAccessibleResource(fastify, params.resource ?? '', request.user, 'write');
      const scope = await resolveScope(fastify, request.tenant!);
      const existing = await fastify.prisma.generatedRecord.findFirst({
        where: { id: params.id ?? '', resourceId: resource.key, ...scope },
      });
      if (!existing) throw new NotFoundError('Registro no encontrado');

      await fastify.prisma.generatedRecord.delete({ where: { id: existing.id } });
      return { ok: true };
    },
  );
}
