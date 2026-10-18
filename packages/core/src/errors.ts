/**
 * Códigos de error estables y versionados de la plataforma.
 *
 * Los clientes (web, móvil, integraciones de terceros) NO deben parsear los
 * mensajes de error; deben usar estos códigos estables para traducir o actuar.
 */
export const ErrorCode = {
  BadRequest: 'BAD_REQUEST',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  Validation: 'VALIDATION_ERROR',
  RateLimited: 'RATE_LIMITED',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  Internal: 'INTERNAL_ERROR',
  NotImplemented: 'NOT_IMPLEMENTED',
  ServiceUnavailable: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Detalle estructurado de un error de validación o de negocio. */
export interface ErrorDetail {
  /** Campo al que se refiere el error (opcional). */
  field?: string;
  /** Mensaje legible (idioma del servidor; el cliente traduce por `code`). */
  message: string;
  /** Sub-código opcional para un error concreto de un campo. */
  code?: string;
}

/** Envoltorio de error que la API devuelve en el body de una respuesta de error. */
export interface ErrorBody {
  code: ErrorCodeValue | string;
  message: string;
  details?: ErrorDetail[];
  requestId?: string;
}

export interface AppErrorOptions {
  statusCode: number;
  code: ErrorCodeValue | string;
  message: string;
  details?: ErrorDetail[];
  cause?: unknown;
}

/**
 * Error de aplicación base. Es la única forma recomendada de lanzar errores
 * dentro de la lógica de negocio: el manejador global de Fastify lo serializa
 * en un `ErrorBody` consistente.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCodeValue | string;
  readonly details?: ErrorDetail[];

  constructor(opts: AppErrorOptions) {
    super(opts.message);
    this.name = 'AppError';
    this.statusCode = opts.statusCode;
    this.code = opts.code;
    this.details = opts.details;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }

  toJSON(): ErrorBody {
    const body: ErrorBody = { code: this.code, message: this.message };
    if (this.details && this.details.length > 0) body.details = this.details;
    return body;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: ErrorDetail[]) {
    super({ statusCode: 400, code: ErrorCode.BadRequest, message, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super({ statusCode: 401, code: ErrorCode.Unauthorized, message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super({ statusCode: 403, code: ErrorCode.Forbidden, message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: ErrorDetail[]) {
    super({ statusCode: 404, code: ErrorCode.NotFound, message, details });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', details?: ErrorDetail[]) {
    super({ statusCode: 409, code: ErrorCode.Conflict, message, details });
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: ErrorDetail[]) {
    super({ statusCode: 422, code: ErrorCode.Validation, message, details });
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super({ statusCode: 429, code: ErrorCode.RateLimited, message });
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', cause?: unknown) {
    super({ statusCode: 500, code: ErrorCode.Internal, message, cause });
  }
}
