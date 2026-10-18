import type { FastifyInstance } from 'fastify';
import { createTransport, getSmtpSettings } from '../mail/service';
import { enqueueJob, startWorker } from '../../lib/queue';
import { baseUrl, injectTracking } from './tracking';

/**
 * Cola de envío de correos. Con Redis usa **BullMQ** (cola, reintentos con
 * backoff exponencial y concurrencia); sin Redis cae a un barrido por la tabla
 * `EmailMessage` (polling). El contrato (`enqueueEmail` / `startQueueProcessor`)
 * no cambia para el resto de la app.
 */

const QUEUE_NAME = 'email';

/** Envía un mensaje ya persistido por id (lógica común de envío). */
async function sendMessageById(fastify: FastifyInstance, messageId: string): Promise<void> {
  const message = await fastify.prisma.emailMessage.findUnique({ where: { id: messageId } });
  if (!message || message.status !== 'queued') return;

  try {
    const settings = await getSmtpSettings(fastify);
    const transport = createTransport(settings);
    if (!transport) {
      await fastify.prisma.emailMessage.update({ where: { id: messageId }, data: { status: 'failed', error: 'SMTP no configurado' } });
      return;
    }
    const from = settings.from ?? 'Webs <no-reply@localhost>';
    const html = injectTracking(message.body, messageId, baseUrl(fastify));
    await transport.sendMail({ from, to: message.to, subject: message.subject, html });

    await fastify.prisma.emailMessage.update({ where: { id: messageId }, data: { status: 'sent', sentAt: new Date() } });
    if (message.campaignId) {
      await fastify.prisma.emailCampaign.update({ where: { id: message.campaignId }, data: { sentCount: { increment: 1 } } });
    }
  } catch (err) {
    await fastify.prisma.emailMessage.update({ where: { id: messageId }, data: { status: 'failed', error: (err as Error).message } });
  }
}

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

  // Con Redis: encolamos el trabajo en BullMQ.
  if (fastify.redis) {
    await enqueueJob(fastify, QUEUE_NAME, 'send', { messageId: message.id });
  }

  return { id: message.id };
}

/** Barrido por la tabla (fallback sin Redis): procesa un lote de mensajes. */
export async function processQueue(fastify: FastifyInstance, batch = 20): Promise<number> {
  const messages = await fastify.prisma.emailMessage.findMany({
    where: { status: 'queued' },
    take: batch,
    orderBy: { createdAt: 'asc' },
  });
  for (const message of messages) {
    await sendMessageById(fastify, message.id);
  }
  return messages.length;
}

/** Arranca el procesador (BullMQ si hay Redis; polling si no). */
export function startQueueProcessor(fastify: FastifyInstance, intervalMs = 15000): void {
  if (fastify.redis) {
    startWorker(fastify, QUEUE_NAME, async (data) => {
      const { messageId } = data as { messageId: string };
      await sendMessageById(fastify, messageId);
    });
    return;
  }

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
