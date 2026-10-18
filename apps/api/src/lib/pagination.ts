import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@webs/core';
import type { Page } from '@webs/core';

/** Esquema JSON (querystring) estándar de paginación. */
export const paginationQuerySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 0, default: 0 },
    pageSize: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_PAGE_SIZE,
      default: DEFAULT_PAGE_SIZE,
    },
  },
} as const;

export interface ParsedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageParams(query: { page?: number; pageSize?: number }): ParsedPagination {
  const page = Math.max(0, Math.trunc(query.page ?? 0));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)));
  return { page, pageSize, skip: page * pageSize, take: pageSize };
}

export function pageResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Page<T> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return { items, total, page, pageSize, totalPages };
}
