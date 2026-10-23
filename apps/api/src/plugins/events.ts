import fp from 'fastify-plugin';
import { emitEvent } from '../modules/email/events';

type EventHandler = (payload: Record<string, unknown>) => Promise<void> | void;

/**
 * Expone `fastify.events.emit(event, payload)` y `fastify.events.on(event, handler)`
 * para que los bloques (y cualquier módulo) disparen y escuchen eventos de negocio.
 *
 * - `emit` conserva el comportamiento existente (dispara automatizaciones de correo)
 *   y además despacha a los suscriptores registrados por plugins (p.ej. `facturacion`
 *   escucha `payment.approved` para generar el comprobante de forma idempotente).
 * - `on` registra un suscriptor en memoria (no persiste entre reinicios; es un bus
 *   de proceso, adecuado para la generación de comprobantes y notificaciones live).
 */
export default fp(async (fastify) => {
  const subscribers = new Map<string, EventHandler[]>();

  fastify.decorate('events', {
    on: (event: string, handler: EventHandler): void => {
      const list = subscribers.get(event) ?? [];
      list.push(handler);
      subscribers.set(event, list);
    },
    emit: async (event: string, payload: Record<string, unknown>): Promise<void> => {
      // Automatizaciones de correo (comportamiento previo, no se altera).
      await emitEvent(fastify, event, payload);
      // Suscriptores de plugins (bus de proceso).
      for (const handler of subscribers.get(event) ?? []) {
        await handler(payload);
      }
    },
  });
});
