import type { FastifyInstance } from 'fastify';
import { createTransport, getSmtpSettings } from '../mail/service';
import { baseUrl, injectTracking } from './tracking';

/**
 * Cola de envío de correos. Desacopla la generación del envío: campañas y
 * automatizaciones encolan `EmailMessage`s y un procesador en segundo plano los
 * envía por lotes (permite reintentos, límite de ritmo y escalado a una cola
 * externa tipo BullMQ/Redis en producción).
 */

export async function enqueueEmail(
  fastify: FastifyInstance,
  input: { to: string; subject: string; body: string; templateId?: string; campaignId?: string },
): Promise<{ id: string }> {
  const message = await fastify.prisma.emailMessage.create({
    data: {
      to: input.to,
      subject: input.subject,
      body: input.body,
      templateId: input.templateId ?? null,
      campaignId: input.campaignId ?? null,
    },
  });
  return { id: message.id };
}

/** Procesa un lote de mensajes encolados y actualiza su estado. */
export async function processQueue(fastify: FastifyInstance, batch = 20): Promise<number> {
  const messages = await fastify.prisma.emailMessage.findMany({
    where: { status: 'queued' },
    take: batch,
    orderBy: { createdAt: 'asc' },
  });

  for (const message of messages) {
    try {
      const settings = await getSmtpSettings(fastify);
      const transport = createTransport(settings);
      if (!transport) {
        await fastify.prisma.emailMessage.update({
          where: { id: message.id },
          data: { status: 'failed', error: 'SMTP no configurado' },
        });
        continue;
      }
      const from = settings.from ?? 'Webs <no-reply@localhost>';
      const html = injectTracking(message.body, message.id, baseUrl(fastify));
      await transport.sendMail({ from, to: message.to, subject: message.subject, html });

      await fastify.prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: 'sent', sentAt: new Date() },
      });

      if (message.campaignId) {
        await fastify.prisma.emailCampaign.update({
          where: { id: message.campaignId },
          data: { sentCount: { increment: 1 } },
        });
      }
    } catch (err) {
      await fastify.prisma.emailMessage.update({
        where: { id: message.id },
        data: { status: 'failed', error: (err as Error).message },
      });
    }
  }

  return messages.length;
}

/** Arranca el procesador periódico de la cola (una vez por instancia). */
export function startQueueProcessor(fastify: FastifyInstance, intervalMs = 15000): void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processQueue(fastify)
      .catch((err) => fastify.log.warn({ err }, 'error procesando la cola de correo'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  fastify.addHook('onClose', () => clearInterval(timer));
}
