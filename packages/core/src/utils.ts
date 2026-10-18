/**
 * Utilidades genéricas sin dependencias.
 */

/** Genera un slug a partir de texto (para URLs amigables). */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Calcula `totalPages` a partir de total y tamaño de página. */
export function totalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 0;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Normaliza los parámetros de paginación dentro de los límites permitidos. */
export function normalizePagination(
  params: { page?: number; pageSize?: number } | undefined,
  defaults: { pageSize?: number; maxPageSize?: number } = {},
): { page: number; pageSize: number } {
  const maxPageSize = defaults.maxPageSize ?? 100;
  const page = Math.max(0, Math.trunc(params?.page ?? 0));
  const pageSize = Math.min(
    maxPageSize,
    Math.max(1, Math.trunc(params?.pageSize ?? defaults.pageSize ?? 20)),
  );
  return { page, pageSize };
}

/** Devuelve una marca de tiempo ISO 8601 actual en UTC. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Enmascara un valor sensible para logs (muestra los últimos 4 caracteres). */
export function mask(value: string, visible = 4): string {
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
