/**
 * Tipos comunes y transversales de la plataforma.
 */

/** Identificador de entidad: UUID v7 por defecto en la capa de persistencia. */
export type EntityId = string;

/** Marca de tiempo en ISO 8601 (UTC). */
export type ISODateString = string;

export interface Timestamps {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Localización conforme a BCP-47 (ej. "es", "en", "pt-BR"). */
export type Locale = string;

/** Parámetros estándar de paginación. */
export interface PaginationParams {
  /** Índice basado en 0. */
  page?: number;
  /** Tamaño de página (por defecto 20, máx. 100). */
  pageSize?: number;
}

/** Envoltorio estándar de una lista paginada. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Resultado de una operación que puede fallar (sin excepciones). */
export type Result<T, E = AppErrorLike> = Ok<T> | Err<E>;

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

/** Interfaz mínima que debe cumplir un error para usar `Result`. */
export interface AppErrorLike {
  message: string;
}

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

export const err = <E = AppErrorLike>(error: E): Err<E> => ({ ok: false, error });
