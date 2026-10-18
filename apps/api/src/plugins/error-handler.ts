import fp from 'fastify-plugin';
import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError, ErrorCode } from '@webs/core';

/**
 * Manejador global de errores: serializa `AppError` y errores de validación de
 * Fastify en un `ErrorBody` consistente, y oculta detalles internos en el resto.
 */
export default fp(async (fastify: FastifyInstance) => {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { ...error.toJSON(), requestId },
      });
    }

    // Errores de validación de Fastify (schema de body/query/params).
    if (error.validation) {
      const details = (error.validation ?? []).map((v: { message?: string }) => ({
        message: v?.message ?? 'invalid',
      }));
      return reply.status(400).send({
        error: {
          code: ErrorCode.Validation,
          message: error.message,
          details,
          requestId,
        },
      });
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: {
          code: ErrorCode.BadRequest,
          message: error.message,
          requestId,
        },
      });
    }

    // Error inesperado: se registra completo y se devuelve un mensaje genérico.
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: ErrorCode.Internal,
        message: 'Internal server error',
        requestId,
      },
    });
  });
});
