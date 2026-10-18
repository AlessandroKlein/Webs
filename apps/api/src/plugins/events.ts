import fp from 'fastify-plugin';
import { emitEvent } from '../modules/email/events';

/**
 * Expone `fastify.events.emit(event, payload)` para que los bloques (y cualquier
 * módulo) disparen eventos que disparan automatizaciones de correo.
 */
export default fp(async (fastify) => {
  fastify.decorate('events', {
    emit: (event: string, payload: Record<string, unknown>) => emitEvent(fastify, event, payload),
  });
});
