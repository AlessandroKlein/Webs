import Ajv from 'ajv';
import type { FastifyInstance } from 'fastify';
import { NotFoundError, ValidationError } from '@webs/core';
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

  const setting = await fastify.prisma.setting.findUnique({ where: { key } });
  const stored = (setting?.value as Record<string, unknown>) ?? {};
  return {
    key: section.key,
    group: section.group,
    schema: section.schema,
    defaults: section.defaults,
    value: { ...section.defaults, ...stored },
  };
}

export async function listSections(fastify: FastifyInstance) {
  const keys = getSettingSections().map((s) => s.key);
  const stored = await fastify.prisma.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(stored.map((s) => [s.key, s.value as Record<string, unknown>]));

  return getSettingSections().map((section) => ({
    key: section.key,
    group: section.group,
    schema: section.schema,
    defaults: section.defaults,
    value: { ...section.defaults, ...(byKey.get(section.key) ?? {}) },
  }));
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

  await fastify.prisma.setting.upsert({
    where: { key },
    update: { value: value as object, schemaKey: key, updatedById: actorId ?? null },
    create: { key, value: value as object, schemaKey: key, updatedById: actorId ?? null },
  });

  return { key, value };
}
