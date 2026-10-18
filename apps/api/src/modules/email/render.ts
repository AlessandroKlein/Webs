import type { FastifyInstance } from 'fastify';

/**
 * Interpolación de variables en plantillas. Sintaxis: `{{ user.name }}`,
 * `{{ site.name }}`, `{{ link }}`, etc. Las claves se resuelven con notación
 * de punto sobre el objeto de datos.
 */
export function interpolate(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = getPath(data, path);
    return value === undefined || value === null ? '' : String(value);
  });
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export interface RenderedEmail {
  subject: string;
  body: string;
}

export function renderTemplate(
  template: { subject: string; body: string },
  data: Record<string, unknown>,
): RenderedEmail {
  return {
    subject: interpolate(template.subject, data),
    body: interpolate(template.body, data),
  };
}

/** Datos base disponibles en toda plantilla (sitio). */
export async function buildBaseData(fastify: FastifyInstance): Promise<Record<string, unknown>> {
  const site = await fastify.prisma.setting.findUnique({ where: { key: 'site' } });
  const s = (site?.value ?? {}) as { name?: string; tagline?: string };
  const origin = (fastify.config.CORS_ORIGIN.split(',')[0] ?? 'http://localhost:5173').trim();
  return {
    site: { name: s.name ?? 'Webs', tagline: s.tagline ?? '', url: origin },
  };
}
