import type { FastifyInstance } from 'fastify';
import { BadRequestError, NotFoundError } from '@webs/core';
import { buildBaseData, renderTemplate } from './render';
import { enqueueEmail } from './queue';

export interface Recipient {
  email: string;
  name?: string;
}

/** Resuelve los destinatarios de una campaña según su tipo. */
export async function resolveRecipients(
  fastify: FastifyInstance,
  campaign: { recipientType: string; recipientRoles: unknown; recipientEmails: unknown },
): Promise<Recipient[]> {
  switch (campaign.recipientType) {
    case 'list':
      return (campaign.recipientEmails as Recipient[]) ?? [];
    case 'roles': {
      const roles = (campaign.recipientRoles as string[]) ?? [];
      const users = await fastify.prisma.user.findMany({
        where: { active: true, roles: { some: { role: { key: { in: roles } } } } },
        select: { email: true, displayName: true },
      });
      return users.map((u) => ({ email: u.email, name: u.displayName ?? undefined }));
    }
    case 'all':
    default: {
      const users = await fastify.prisma.user.findMany({
        where: { active: true },
        select: { email: true, displayName: true },
      });
      return users.map((u) => ({ email: u.email, name: u.displayName ?? undefined }));
    }
  }
}

/** Encola el envío masivo de una campaña (lo procesa la cola en segundo plano). */
export async function sendCampaign(fastify: FastifyInstance, campaignId: string): Promise<{ queued: number }> {
  const campaign = await fastify.prisma.emailCampaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });
  if (!campaign) throw new NotFoundError('Campaña');
  if (!campaign.template) throw new BadRequestError('La campaña no tiene una plantilla asociada');

  const recipients = await resolveRecipients(fastify, campaign);
  const base = await buildBaseData(fastify);

  await fastify.prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'sending', totalCount: recipients.length, sentCount: 0 },
  });

  for (const recipient of recipients) {
    const data = { ...base, user: recipient };
    const { subject, body } = renderTemplate(campaign.template, data);
    await enqueueEmail(fastify, {
      to: recipient.email,
      subject: campaign.subject ?? subject,
      body,
      templateId: campaign.template.id,
      campaignId,
    });
  }

  await fastify.prisma.emailCampaign.update({
    where: { id: campaignId },
    data: { status: 'sent' },
  });

  return { queued: recipients.length };
}
