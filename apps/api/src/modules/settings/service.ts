import Ajv from 'ajv';
import type { FastifyInstance } from 'fastify';
import { NotFoundError, ValidationError } from '@webs/core';
import { decryptSecretFields, encryptSecretFields } from '../../lib/crypto';
import { cacheDel, cacheGet, cacheSet } from '../../lib/cache';
import { getSettingSection, getSettingSections } from './registry';
import { registerDefaultSections } from './sections';

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const validatorCache = new Map<string, ReturnType<Ajv['compile']>>();

/** Registra las secciones base (idempotente; llamado al construir la app). */
let registered = false;
export function ensureDefaultSections(): void {
  if (registered) return;
  registered = true;
  registerDefaultSections();
}

export async function getSectionValue(fastify: FastifyInstance, key: string) {
  const section = getSettingSection(key);
  if (!section) throw new NotFoundError(`Sección de ajustes '${key}'`);

  const cacheKey = `setting:value:${key}`;
  const cached = await cacheGet(fastify.redis, cacheKey);
  if (cached) return cached;

  const setting = await fastify.prisma.setting.findUnique({ where: { key } });
  const stored = (setting?.value as Record<string, unknown>) ?? {};
  const merged = { ...section.defaults, ...stored };
  const result = {
    key: section.key,
    group: section.group,
    schema: section.schema,
    defaults: section.defaults,
    value: decryptSecretFields(section.schema, merged),
  };

  await cacheSet(fastify.redis, cacheKey, result, 60);
  return result;
}

export async function listSections(fastify: FastifyInstance) {
  const cacheKey = 'setting:list';
  const cached = await cacheGet(fastify.redis, cacheKey);
  if (cached) return cached;

  const keys = getSettingSections().map((s) => s.key);
  const stored = await fastify.prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(stored.map((s) => [s.key, s.value as Record<string, unknown>]));

  const result = getSettingSections().map((section) => {
    const merged = { ...section.defaults, ...(byKey.get(section.key) ?? {}) };
    return {
      key: section.key,
      group: section.group,
      schema: section.schema,
      defaults: section.defaults,
      value: decryptSecretFields(section.schema, merged),
    };
  });

  await cacheSet(fastify.redis, cacheKey, result, 60);
  return result;
}

export async function setSectionValue(
  fastify: FastifyInstance,
  key: string,
  value: unknown,
  actorId?: string,
) {
  const section = getSettingSection(key);
  if (!section) throw new NotFoundError(`Sección de ajustes '${key}'`);

  const validator = validatorCache.get(key) ?? ajv.compile(section.schema);
  validatorCache.set(key, validator);

  if (!validator(value)) {
    const details = (validator.errors ?? []).map((e) => ({
      field: e.instancePath.replace(/^\//, '').replace(/\//g, '.') || undefined,
      message: e.message ?? 'valor inválido',
    }));
    throw new ValidationError('Valor de ajustes inválido', details);
  }

  const toStore = encryptSecretFields(section.schema, value as Record<string, unknown>);

  await fastify.prisma.setting.upsert({
    where: { key },
    update: { value: toStore as object, schemaKey: key, updatedById: actorId ?? null },
    create: { key, value: toStore as object, schemaKey: key, updatedById: actorId ?? null },
  });

  await cacheDel(fastify.redis, `setting:value:${key}`);
  await cacheDel(fastify.redis, 'setting:list');

  return { key, value };
}
