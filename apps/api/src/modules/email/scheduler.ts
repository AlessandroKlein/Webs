import type { FastifyInstance } from 'fastify';
import { sendCampaign } from './service';

/**
 * Programador de campañas: en cada tick envía las campañas con estado
 * `scheduled` cuya `scheduledAt` ya se cumplió.
 */
export async function runDueCampaigns(fastify: FastifyInstance): Promise<number> {
  const due = await fastify.prisma.emailCampaign.findMany({
    where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
  });

  for (const campaign of due) {
    try {
      await sendCampaign(fastify, campaign.id);
    } catch (err) {
      fastify.log.warn({ err, campaignId: campaign.id }, 'error al enviar campaña programada');
      await fastify.prisma.emailCampaign
        .update({ where: { id: campaign.id }, data: { status: 'failed' } })
        .catch(() => {});
    }
  }

  return due.length;
}

export function startScheduler(fastify: FastifyInstance, intervalMs = 60_000): void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runDueCampaigns(fastify)
      .catch((err) => fastify.log.warn({ err }, 'error en el scheduler de campañas'))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref?.();
  fastify.addHook('onClose', () => clearInterval(timer));
}
