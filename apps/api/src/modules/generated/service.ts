import Ajv, { type ValidateFunction } from 'ajv';
import type { FastifyInstance } from 'fastify';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@webs/core';
import { cacheDel, cacheGet, cacheSet } from '../../lib/cache';
import { isLicensed, resolveFeature } from '../../lib/feature-gating';
import { sanitize } from '../../lib/sanitize';
import type { AccessTokenPayload } from '../../types/auth';

/** Vista de un recurso generado (ADR-0020). */
export interface GeneratedResourceView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  feature: string;
  enabled: boolean;
  schema: unknown;
}

/** Vista de un registro generado. */
export interface GeneratedRecordView {
  id: string;
  resourceId: string;
  organizationId: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const RESOURCE_CACHE_TTL = 60;
const RESOURCE_CACHE_KEY = (key: string) => `generated:resource:${key}`;

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const validators = new Map<string, ValidateFunction>();

/** Normaliza un nombre a una clave (slug) válida de recurso. */
export function normalizeKey(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return slug || 'resource';
}

/** Resuelve un recurso por `key` (caché Redis + Prisma). Devuelve null si no existe. */
export async function resolveResource(
  fastify: FastifyInstance,
  key: string,
): Promise<GeneratedResourceView | null> {
  const cacheKey = RESOURCE_CACHE_KEY(key);
  const cached = await cacheGet<GeneratedResourceView>(fastify.redis, cacheKey);
  if (cached) return cached;

  const resource = await fastify.prisma.generatedResource.findUnique({ where: { key } });
  if (!resource) return null;

  const view: GeneratedResourceView = {
    id: resource.id,
    key: resource.key,
    name: resource.name,
    description: resource.description,
    feature: resource.feature,
    enabled: resource.enabled,
    schema: resource.schema,
  };
  await cacheSet(fastify.redis, cacheKey, view, RESOURCE_CACHE_TTL);
  return view;
}

/** Invalida la caché de un recurso. */
export async function invalidateResourceCache(fastify: FastifyInstance, key: string): Promise<void> {
  await cacheDel(fastify.redis, RESOURCE_CACHE_KEY(key));
}

/** Invalida el validador Ajv cacheado de un recurso (fix F2: PATCH/DELETE de schema). */
export function invalidateValidator(key: string): void {
  validators.delete(key);
}

/** Registra (upsert) los permisos por recurso `gen.<key>.read`/`gen.<key>.write`. */
export async function ensureGenPermissions(fastify: FastifyInstance, key: string): Promise<void> {
  for (const perm of [`gen.${key}.read`, `gen.${key}.write`]) {
    await fastify.prisma.permission.upsert({
      where: { key: perm },
      update: {},
      create: { key: perm, description: `Acceso al recurso generado «${key}»` },
    });
  }
}

/** Lanza 403 si la feature del recurso no está licenciada (fail-closed). */
export function assertLicensed(fastify: FastifyInstance, feature?: string | null): void {
  const resolved = resolveFeature(feature);
  if (!isLicensed(fastify, resolved)) {
    throw new ForbiddenError(`Feature no licenciada: ${resolved}`);
  }
}

/** Obtiene (cacheando) el validador Ajv del schema de un recurso. */
function getValidator(key: string, schema: unknown): ValidateFunction {
  let validator = validators.get(key);
  if (!validator) {
    validator = ajv.compile(schema as object);
    validators.set(key, validator);
  }
  return validator;
}

/** Valida `data` contra el schema del recurso; lanza 422 con detalles si falla. */
export function validateRecord(key: string, schema: unknown, data: unknown): void {
  const validator = getValidator(key, schema);
  const valid = validator(data);
  if (valid) return;
  const details = (validator.errors ?? []).map((e) => ({
    field: (e.instancePath ?? '').replace(/^\//, ''),
    message: e.message ?? 'Valor inválido',
    code: e.keyword,
  }));
  throw new ValidationError('Datos inválidos para el recurso', details);
}

/** Valida que el schema sea un JSON Schema compilable; lanza 400 si no. */
export function assertValidJsonSchema(schema: unknown): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new BadRequestError('El schema debe ser un objeto JSON Schema');
  }
  try {
    ajv.compile(schema as object);
  } catch (err) {
    throw new BadRequestError(`Schema JSON inválido: ${err instanceof Error ? err.message : 'desconocido'}`);
  }
}

/** Sanitiza recursivamente los campos `format: "html"` del schema (XSS). */
export function sanitizeData(schema: unknown, data: unknown): unknown {
  const root = (schema ?? {}) as Record<string, unknown>;
  if (typeof data !== 'object' || data === null) return data;
  const out: Record<string, unknown> = { ...(data as Record<string, unknown>) };

  const properties = (root.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const [key, propSchema] of Object.entries(properties)) {
    const value = out[key];
    if (value === undefined) continue;
    if (propSchema.type === 'string' && propSchema.format === 'html' && typeof value === 'string') {
      out[key] = sanitize(value);
    } else if (propSchema.type === 'object' && typeof value === 'object' && value !== null) {
      out[key] = sanitizeData(propSchema, value);
    } else if (propSchema.type === 'array' && Array.isArray(value)) {
      const items = propSchema.items as Record<string, unknown> | undefined;
      if (items?.type === 'object') {
        out[key] = value.map((item) => sanitizeData(items, item));
      }
    }
  }
  return out;
}

/**
 * Rechaza (409) si otra propiedad marcada `x-unique: true` del schema ya existe
 * en el MISMO scope (fix F3). Excluye `excludeId` en PATCH (el propio registro).
 * Solo aplica a valores escalares (string/number/boolean); los objetos/arrays se
 * ignoran (la unicidad JSON por `path` de Prisma no es fiable para anidados).
 */
export async function assertUnique(
  fastify: FastifyInstance,
  resourceKey: string,
  schema: unknown,
  data: Record<string, unknown>,
  scope: Record<string, unknown>,
  excludeId?: string,
): Promise<void> {
  const properties = ((schema as Record<string, unknown>)?.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  for (const [key, propSchema] of Object.entries(properties)) {
    if (propSchema['x-unique'] !== true) continue;
    const value = data[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;

    const where: Record<string, unknown> = {
      resourceId: resourceKey,
      ...scope,
      data: { path: [key], equals: value },
    };
    if (excludeId) where.id = { not: excludeId };

    const existing = await fastify.prisma.generatedRecord.findFirst({ where, select: { id: true } });
    if (existing) {
      throw new ConflictError(`Ya existe un registro con el valor «${String(value)}» en el campo «${key}»`);
    }
  }
}

/**
 * Comprueba en BD, en tiempo real, si un usuario tiene el permiso `perm`.
 * Espejo de `findUserWithPermissions` (apps/api/src/lib/user.ts): `super_admin`
 * es supremo (ve todos los permisos existentes), el resto lo tiene si algún rol
 * suyo lo porta. Consulta la BD (no el JWT) para que los permisos dinámicos
 * `gen.<key>.read/write` recién creados sean efectivos SIN re-login (ADR-0020,
 * fix F1 de QA M7).
 */
export async function hasGenPermission(
  fastify: FastifyInstance,
  userId: string,
  perm: string,
): Promise<boolean> {
  const isSuperAdmin = await fastify.prisma.userRole.findFirst({
    where: { userId, role: { key: 'super_admin' } },
    select: { userId: true },
  });
  if (isSuperAdmin) return true;

  const grant = await fastify.prisma.userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key: perm } } } } },
    select: { userId: true },
  });
  return Boolean(grant);
}

/**
 * Lanza 403 si el usuario no tiene el permiso `gen.<key>.<accion>`.
 * - `api_token`: usa los scopes del JWT (`user.permissions`) SIN escalar a los
 *   permisos del usuario (evita regresión de seguridad).
 * - access token: consulta la BD en tiempo real (`user.sub`), porque los
 *   `gen.*` son dinámicos y no forman parte del JWT emitido en el login.
 */
async function assertGenPermission(
  fastify: FastifyInstance,
  user: AccessTokenPayload | undefined,
  resourceKey: string,
  action: 'read' | 'write',
): Promise<void> {
  const perm = `gen.${resourceKey}.${action}`;
  if (!user?.sub) throw new ForbiddenError(`Se requiere el permiso ${perm}`);
  const allowed =
    user.type === 'api_token'
      ? Boolean(user.permissions?.includes(perm))
      : await hasGenPermission(fastify, user.sub, perm);
  if (!allowed) throw new ForbiddenError(`Se requiere el permiso ${perm}`);
}

/** Resuelve un recurso + valida feature/permisos, devolviendo el recurso. */
export async function resolveAccessibleResource(
  fastify: FastifyInstance,
  resourceKey: string,
  user: AccessTokenPayload | undefined,
  action: 'read' | 'write',
): Promise<GeneratedResourceView> {
  const resource = await resolveResource(fastify, resourceKey);
  if (!resource) throw new NotFoundError(`Recurso «${resourceKey}» no encontrado`);
  assertLicensed(fastify, resource.feature);
  await assertGenPermission(fastify, user, resource.key, action);
  return resource;
}
