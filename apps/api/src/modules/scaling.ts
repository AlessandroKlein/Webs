import type { FastifyInstance } from 'fastify';
import { ValidationError } from '@webs/core';
import { audit } from '../lib/audit';

/**
 * Selector de escalabilidad por workload (ADR-0025): HPA (horizontal) vs VPA
 * (vertical) para la API y la Web, persistido en la tabla de `settings`
 * (clave `scaling`), con guarda de exclusión HPA↔VPA sobre CPU/memoria y
 * exportación del manifiesto YAML seleccionado.
 */

const SCALING_SETTING_KEY = 'scaling';

const WORKLOADS = ['api', 'web'] as const;
export type WorkloadName = (typeof WORKLOADS)[number];
export type ScalingMode = 'horizontal' | 'vertical';
export type VpaUpdateMode = 'Auto' | 'Off' | 'Initial';

export interface CpuMem {
  cpu: string;
  memory: string;
}
export interface HpaConfig {
  min: number;
  max: number;
  cpuTargetPct: number;
  memTargetPct: number;
}
export interface VpaConfig {
  updateMode: VpaUpdateMode;
  minAllowed: CpuMem;
  maxAllowed: CpuMem;
}
export interface WorkloadScaling {
  name: WorkloadName;
  mode: ScalingMode;
  hpa: HpaConfig;
  vpa: VpaConfig;
}
export interface ScalingConfig {
  api: WorkloadScaling;
  web: WorkloadScaling;
}

/** Cantidad de CPU k8s: `250m`, `1`, `0.5`. */
const CPU_RE = /^\d+(\.\d+)?m?$/;
/** Cantidad de memoria k8s: `512Mi`, `2Gi`, `256M`, `1G`. */
const MEM_RE = /^\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/;

function defaultWorkload(name: WorkloadName): WorkloadScaling {
  return {
    name,
    mode: 'horizontal',
    hpa: { min: 2, max: 10, cpuTargetPct: 70, memTargetPct: 70 },
    vpa: {
      updateMode: 'Off',
      minAllowed: { cpu: '250m', memory: '256Mi' },
      maxAllowed: { cpu: '2000m', memory: '2Gi' },
    },
  };
}

export const DEFAULT_CONFIG: ScalingConfig = {
  api: defaultWorkload('api'),
  web: defaultWorkload('web'),
};

export function normalizeCpu(value: unknown): string {
  const v = String(value ?? '').trim();
  if (!CPU_RE.test(v)) {
    throw new ValidationError('CPU inválida: usá unidades k8s (ej. 250m, 1, 0.5)', [
      { field: 'cpu', message: 'Formato de CPU inválido' },
    ]);
  }
  return v;
}

export function normalizeMemory(value: unknown): string {
  const v = String(value ?? '').trim();
  if (!MEM_RE.test(v)) {
    throw new ValidationError('Memoria inválida: usá unidades k8s (ej. 512Mi, 2Gi)', [
      { field: 'memory', message: 'Formato de memoria inválido' },
    ]);
  }
  return v;
}

function parseHpa(value: unknown, fallback: HpaConfig): HpaConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  const min = Number(v.min ?? fallback.min);
  const max = Number(v.max ?? fallback.max);
  const cpuTargetPct = Number(v.cpuTargetPct ?? fallback.cpuTargetPct);
  const memTargetPct = Number(v.memTargetPct ?? fallback.memTargetPct);

  if (!Number.isInteger(min) || min < 1) {
    throw new ValidationError('hpa.min debe ser un entero >= 1', [{ field: 'hpa.min', message: 'Debe ser >= 1' }]);
  }
  if (!Number.isInteger(max) || max < min) {
    throw new ValidationError('hpa.max debe ser un entero >= hpa.min', [{ field: 'hpa.max', message: 'Debe ser >= hpa.min' }]);
  }
  if (!Number.isInteger(cpuTargetPct) || cpuTargetPct < 0 || cpuTargetPct > 100) {
    throw new ValidationError('hpa.cpuTargetPct debe estar entre 0 y 100', [
      { field: 'hpa.cpuTargetPct', message: 'Rango 0-100' },
    ]);
  }
  if (!Number.isInteger(memTargetPct) || memTargetPct < 0 || memTargetPct > 100) {
    throw new ValidationError('hpa.memTargetPct debe estar entre 0 y 100', [
      { field: 'hpa.memTargetPct', message: 'Rango 0-100' },
    ]);
  }
  return { min, max, cpuTargetPct, memTargetPct };
}

function parseVpa(value: unknown, fallback: VpaConfig): VpaConfig {
  const v = (value ?? {}) as Record<string, unknown>;
  // ADR-0025: "Recommender" (solo recomendaciones) se mapea a updateMode Off.
  const rawMode = String(v.updateMode ?? fallback.updateMode);
  const updateMode = (rawMode === 'Recommender' ? 'Off' : rawMode) as VpaUpdateMode;
  if (!['Auto', 'Off', 'Initial'].includes(updateMode)) {
    throw new ValidationError('vpa.updateMode debe ser Auto, Off o Initial', [
      { field: 'vpa.updateMode', message: 'Valor inválido' },
    ]);
  }

  const minAllowedRaw = (v.minAllowed ?? fallback.minAllowed) as Record<string, unknown>;
  const maxAllowedRaw = (v.maxAllowed ?? fallback.maxAllowed) as Record<string, unknown>;
  const minAllowed = {
    cpu: normalizeCpu(minAllowedRaw.cpu),
    memory: normalizeMemory(minAllowedRaw.memory),
  };
  const maxAllowed = {
    cpu: normalizeCpu(maxAllowedRaw.cpu),
    memory: normalizeMemory(maxAllowedRaw.memory),
  };
  return { updateMode, minAllowed, maxAllowed };
}

/** Valida un workload completo y aplica la guarda de exclusión HPA↔VPA. */
export function validateWorkloadScaling(name: WorkloadName, value: unknown, current: WorkloadScaling): WorkloadScaling {
  const v = (value ?? {}) as Record<string, unknown>;
  const mode = (v.mode ?? current.mode) as ScalingMode;
  if (!['horizontal', 'vertical'].includes(mode)) {
    throw new ValidationError('mode debe ser horizontal o vertical', [{ field: 'mode', message: 'Valor inválido' }]);
  }

  const hpa = parseHpa(v.hpa, current.hpa);
  const vpa = parseVpa(v.vpa, current.vpa);

  // Guarda de exclusión (ADR-0025 #4): HPA y VPA no activos a la vez sobre CPU/mem.
  if (mode === 'horizontal' && vpa.updateMode !== 'Off') {
    throw new ValidationError(
      'HPA y VPA no deben coexistir sobre CPU/memoria: con modo horizontal el VPA debe quedar en updateMode Off',
      [{ field: 'vpa.updateMode', message: 'Usá Off (o cambiá a modo vertical)' }],
    );
  }
  if (mode === 'vertical' && (hpa.cpuTargetPct > 0 || hpa.memTargetPct > 0)) {
    throw new ValidationError(
      'HPA y VPA no deben coexistir sobre CPU/memoria: con modo vertical los targets HPA deben quedar en 0',
      [{ field: 'hpa', message: 'Poné cpuTargetPct/memTargetPct en 0 (o cambiá a modo horizontal)' }],
    );
  }

  return { name, mode, hpa, vpa };
}

/** Genera el manifiesto HPA (autoscaling/v2). */
export function generateHpaYaml(w: WorkloadScaling): string {
  return [
    '# HorizontalPodAutoscaler generado por /api/v1/system/scaling/export (ADR-0025).',
    'apiVersion: autoscaling/v2',
    'kind: HorizontalPodAutoscaler',
    'metadata:',
    `  name: ${w.name}`,
    '  namespace: webs',
    '  labels:',
    '    app.kubernetes.io/name: webs',
    `    app.kubernetes.io/component: ${w.name}`,
    'spec:',
    '  scaleTargetRef:',
    '    apiVersion: apps/v1',
    '    kind: Deployment',
    `    name: ${w.name}`,
    `  minReplicas: ${w.hpa.min}`,
    `  maxReplicas: ${w.hpa.max}`,
    '  metrics:',
    '    - type: Resource',
    '      resource:',
    '        name: cpu',
    '        target:',
    '          type: Utilization',
    `          averageUtilization: ${w.hpa.cpuTargetPct}`,
    '    - type: Resource',
    '      resource:',
    '        name: memory',
    '        target:',
    '          type: Utilization',
    `          averageUtilization: ${w.hpa.memTargetPct}`,
    '',
  ].join('\n');
}

/** Genera el manifiesto VPA (autoscaling.k8s.io/v1). */
export function generateVpaYaml(w: WorkloadScaling): string {
  return [
    '# VerticalPodAutoscaler generado por /api/v1/system/scaling/export (ADR-0025).',
    'apiVersion: autoscaling.k8s.io/v1',
    'kind: VerticalPodAutoscaler',
    'metadata:',
    `  name: ${w.name}`,
    '  namespace: webs',
    '  labels:',
    '    app.kubernetes.io/name: webs',
    `    app.kubernetes.io/component: ${w.name}`,
    'spec:',
    '  targetRef:',
    '    apiVersion: apps/v1',
    '    kind: Deployment',
    `    name: ${w.name}`,
    '  updatePolicy:',
    `    updateMode: ${w.vpa.updateMode}`,
    '  resourcePolicy:',
    '    containerPolicies:',
    "      - containerName: '*'",
    '        controlledResources: ["cpu", "memory"]',
    '        minAllowed:',
    `          cpu: ${w.vpa.minAllowed.cpu}`,
    `          memory: ${w.vpa.minAllowed.memory}`,
    '        maxAllowed:',
    `          cpu: ${w.vpa.maxAllowed.cpu}`,
    `          memory: ${w.vpa.maxAllowed.memory}`,
    '',
  ].join('\n');
}

/** Devuelve el YAML del manifiesto según el modo seleccionado. */
export function generateWorkloadYaml(w: WorkloadScaling): string {
  return w.mode === 'horizontal' ? generateHpaYaml(w) : generateVpaYaml(w);
}

async function readConfig(fastify: FastifyInstance): Promise<ScalingConfig> {
  const setting = await fastify.prisma.setting.findUnique({ where: { key: SCALING_SETTING_KEY } });
  const stored = (setting?.value ?? {}) as Partial<ScalingConfig>;
  return {
    api: { ...DEFAULT_CONFIG.api, ...(stored.api ?? {}) },
    web: { ...DEFAULT_CONFIG.web, ...(stored.web ?? {}) },
  };
}

async function writeConfig(fastify: FastifyInstance, config: ScalingConfig): Promise<void> {
  await fastify.prisma.setting.upsert({
    where: { key: SCALING_SETTING_KEY },
    update: { value: config as unknown as object },
    create: { key: SCALING_SETTING_KEY, value: config as unknown as object },
  });
}

export default async function scalingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/system/scaling',
    { schema: { tags: ['system'] }, preHandler: [fastify.authenticate, fastify.authorize('scaling.read')] },
    async () => {
      const config = await readConfig(fastify);
      const setting = await fastify.prisma.setting.findUnique({ where: { key: SCALING_SETTING_KEY } });
      return { workloads: [config.api, config.web], updatedAt: setting?.updatedAt?.toISOString() ?? null };
    },
  );

  fastify.put(
    '/system/scaling',
    { schema: { tags: ['system'] }, preHandler: [fastify.authenticate, fastify.authorize('scaling.write')] },
    async (request) => {
      const body = (request.body ?? {}) as { workloads?: Array<Record<string, unknown> & { name?: string }> };
      if (!Array.isArray(body.workloads) || body.workloads.length === 0) {
        throw new ValidationError('Se requiere al menos un workload en `workloads`', [
          { field: 'workloads', message: 'Array requerido' },
        ]);
      }

      const current = await readConfig(fastify);
      const merged: ScalingConfig = { ...current };

      for (const partial of body.workloads) {
        const name = partial.name;
        if (!WORKLOADS.includes(name as WorkloadName)) {
          throw new ValidationError('workload inválido (api|web)', [{ field: 'workloads[].name', message: 'Debe ser api o web' }]);
        }
        const workloadName = name as WorkloadName;
        merged[workloadName] = validateWorkloadScaling(workloadName, partial, current[workloadName]);
        audit(fastify, request, {
          actorId: request.user?.sub,
          action: 'scaling.update',
          resource: 'scaling',
          resourceId: workloadName,
          metadata: merged[workloadName],
        });
      }

      await writeConfig(fastify, merged);
      const setting = await fastify.prisma.setting.findUnique({ where: { key: SCALING_SETTING_KEY } });
      return { workloads: [merged.api, merged.web], updatedAt: setting?.updatedAt?.toISOString() ?? null };
    },
  );

  fastify.get(
    '/system/scaling/export',
    {
      schema: {
        tags: ['system'],
        querystring: {
          type: 'object',
          required: ['workload'],
          properties: { workload: { type: 'string' }, format: { type: 'string' } },
        },
      },
      preHandler: [fastify.authenticate, fastify.authorize('scaling.read')],
    },
    async (request, reply) => {
      const query = request.query as { workload?: string; format?: string };
      const name = query.workload;
      if (!WORKLOADS.includes(name as WorkloadName)) {
        throw new ValidationError('workload inválido (api|web)', [{ field: 'workload', message: 'Debe ser api o web' }]);
      }
      const config = await readConfig(fastify);
      const yaml = generateWorkloadYaml(config[name as WorkloadName]);
      reply.header('Content-Type', 'text/yaml; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${name}-scaling.yaml"`);
      return yaml;
    },
  );
}
