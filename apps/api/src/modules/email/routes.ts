import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '@webs/core';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { listEvents } from './events';
import { processQueue } from './queue';
import { sendCampaign } from './service';
import { buildBaseData, renderTemplate } from './render';
import { sanitize } from '../../lib/sanitize';

interface TemplateBody {
  key: string;
  name: string;
  subject: string;
  body: string;
  bodyMode?: string;
  variables?: unknown;
}

export default async function emailRoutes(fastify: FastifyInstance): Promise<void> {
  const canRead = [fastify.authenticate, fastify.authorize('email.read')];
  const canWrite = [fastify.authenticate, fastify.authorize('email.write')];
  const canSend = [fastify.authenticate, fastify.authorize('email.send')];

  // -------- Eventos disponibles (criterios de automatización) --------
  fastify.get('/email/events', { schema: { tags: ['email'] }, preHandler: canRead }, async () => listEvents());

  // -------- Plantillas --------
  fastify.get(
    '/email/templates',
    { schema: { tags: ['email'] }, preHandler: canRead },
    async () => fastify.prisma.emailTemplate.findMany({ orderBy: { updatedAt: 'desc' } }),
  );

  fastify.post(
    '/email/templates',
    { schema: { tags: ['email'] }, preHandler: canWrite },
    async (request, reply) => {
      const body = request.body as TemplateBody;
      const created = await fastify.prisma.emailTemplate.create({
        data: {
          key: body.key,
          name: body.name,
          subject: body.subject,
          body: sanitize(body.body),
          bodyMode: body.bodyMode ?? 'wysiwyg',
          variables: body.variables ?? [],
        },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'email.template.create', resource: 'email_template', resourceId: created.id });
      return reply.status(201).send(created);
    },
  );

  fastify.patch(
    '/email/templates/:id',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canWrite,
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const body = request.body as Partial<TemplateBody>;
      const existing = await fastify.prisma.emailTemplate.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Plantilla');
      return fastify.prisma.emailTemplate.update({
        where: { id },
        data: {
          key: body.key,
          name: body.name,
          subject: body.subject,
          body: body.body !== undefined ? sanitize(body.body) : undefined,
          bodyMode: body.bodyMode,
          variables: body.variables as Prisma.InputJsonValue,
        },
      });
    },
  );

  fastify.delete(
    '/email/templates/:id',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canWrite,
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      await fastify.prisma.emailTemplate.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  fastify.post(
    '/email/templates/:id/preview',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canRead,
    },
    async (request) => {
      const template = await fastify.prisma.emailTemplate.findUnique({
        where: { id: (request.params as { id: string }).id },
      });
      if (!template) throw new NotFoundError('Plantilla');
      const base = await buildBaseData(fastify);
      const data = { ...base, user: { name: 'Nombre Ejemplo', email: 'usuario@ejemplo.com' }, ...((request.body as object) ?? {}) };
      return renderTemplate(template, data);
    },
  );

  // -------- Campañas --------
  fastify.get(
    '/email/campaigns',
    { schema: { tags: ['email'] }, preHandler: canRead },
    async () =>
      fastify.prisma.emailCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        include: { template: { select: { id: true, name: true } } },
      }),
  );

  fastify.post(
    '/email/campaigns',
    { schema: { tags: ['email'] }, preHandler: canWrite },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        templateId?: string;
        subject?: string;
        recipientType?: string;
        recipientRoles?: unknown;
        recipientEmails?: unknown;
      };
      const created = await fastify.prisma.emailCampaign.create({
        data: {
          name: body.name,
          templateId: body.templateId ?? null,
          subject: body.subject ?? null,
          recipientType: body.recipientType ?? 'all',
          recipientRoles: body.recipientRoles ?? [],
          recipientEmails: body.recipientEmails ?? [],
        },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'email.campaign.create', resource: 'email_campaign', resourceId: created.id });
      return reply.status(201).send(created);
    },
  );

  fastify.post(
    '/email/campaigns/:id/send',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canSend,
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const result = await sendCampaign(fastify, id);
      audit(fastify, request, { actorId: request.user?.sub, action: 'email.campaign.send', resource: 'email_campaign', resourceId: id });
      return result;
    },
  );

  fastify.delete(
    '/email/campaigns/:id',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canWrite,
    },
    async (request, reply) => {
      await fastify.prisma.emailCampaign.delete({ where: { id: (request.params as { id: string }).id } });
      return reply.status(204).send();
    },
  );

  // -------- Automatizaciones --------
  fastify.get(
    '/email/automations',
    { schema: { tags: ['email'] }, preHandler: canRead },
    async () =>
      fastify.prisma.emailAutomation.findMany({
        orderBy: { createdAt: 'desc' },
        include: { template: { select: { id: true, name: true } } },
      }),
  );

  fastify.post(
    '/email/automations',
    { schema: { tags: ['email'] }, preHandler: canWrite },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        event: string;
        templateId?: string;
        enabled?: boolean;
        conditions?: unknown;
      };
      const created = await fastify.prisma.emailAutomation.create({
        data: {
          name: body.name,
          event: body.event,
          templateId: body.templateId ?? null,
          enabled: body.enabled ?? true,
          conditions: body.conditions ?? {},
        },
      });
      audit(fastify, request, { actorId: request.user?.sub, action: 'email.automation.create', resource: 'email_automation', resourceId: created.id });
      return reply.status(201).send(created);
    },
  );

  fastify.patch(
    '/email/automations/:id',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canWrite,
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const body = request.body as { name?: string; event?: string; templateId?: string; enabled?: boolean; conditions?: unknown };
      const data: Prisma.EmailAutomationUpdateInput = {
        name: body.name,
        event: body.event,
        enabled: body.enabled,
        conditions: body.conditions as Prisma.InputJsonValue | undefined,
      };
      if (body.templateId) data.template = { connect: { id: body.templateId } };
      return fastify.prisma.emailAutomation.update({ where: { id }, data });
    },
  );

  fastify.delete(
    '/email/automations/:id',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canWrite,
    },
    async (request, reply) => {
      await fastify.prisma.emailAutomation.delete({ where: { id: (request.params as { id: string }).id } });
      return reply.status(204).send();
    },
  );

  // -------- Cola / registro de envío --------
  fastify.get(
    '/email/messages',
    {
      schema: { tags: ['email'], querystring: paginationQuerySchema },
      preHandler: canRead,
    },
    async (request) => {
      const { page, pageSize } = pageParams(request.query as { page?: number; pageSize?: number });
      const [items, total] = await fastify.prisma.$transaction([
        fastify.prisma.emailMessage.findMany({
          skip: page * pageSize,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        fastify.prisma.emailMessage.count(),
      ]);
      return pageResponse(items, total, page, pageSize);
    },
  );

  fastify.post(
    '/email/messages/process',
    { schema: { tags: ['email'] }, preHandler: canSend },
    async () => {
      const processed = await processQueue(fastify);
      return { processed };
    },
  );
}
