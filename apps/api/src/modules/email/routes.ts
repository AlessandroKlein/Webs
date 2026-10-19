import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '@webs/core';
import { paginationQuerySchema, pageParams, pageResponse } from '../../lib/pagination';
import { audit } from '../../lib/audit';
import { listEvents } from './events';
import { processQueue } from './queue';
import { cancelCampaign, resolveRecipients, scheduleCampaign, sendCampaign } from './service';
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

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  const headers = Object.keys(rows[0] ?? {});
  return [headers.join(','), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(','))].join('\n');
}

export default async function emailRoutes(fastify: FastifyInstance): Promise<void> {
  const canRead = [fastify.authenticate, fastify.authorize('email.read')];
  const canWrite = [fastify.authenticate, fastify.authorize('email.write')];
  const canSend = [fastify.authenticate, fastify.authorize('email.send')];

  // -------- Eventos disponibles (criterios de automatización) --------
  fastify.get('/email/events', { schema: { tags: ['email'] }, preHandler: canRead }, async () => listEvents());

  // -------- Variables disponibles en plantillas --------
  fastify.get('/email/variables', { schema: { tags: ['email'] }, preHandler: canRead }, async () => [
    { key: 'user.name', description: 'Nombre de usuario' },
    { key: 'user.email', description: 'Correo del usuario' },
    { key: 'user.firstName', description: 'Nombre (primer nombre)' },
    { key: 'user.lastName', description: 'Apellido' },
    { key: 'user.gender', description: 'Género' },
    { key: 'user.locale', description: 'Idioma del usuario' },
    { key: 'site.name', description: 'Nombre del sitio' },
    { key: 'site.tagline', description: 'Lema del sitio' },
    { key: 'site.url', description: 'URL del sitio' },
    { key: 'link', description: 'Enlace (verificación / reseteo)' },
    { key: 'date', description: 'Fecha actual' },
    { key: 'year', description: 'Año actual' },
  ]);

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

  fastify.post(
    '/email/campaigns/:id/schedule',
    {
      schema: {
        tags: ['email'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        body: { type: 'object', required: ['scheduledAt'], properties: { scheduledAt: { type: 'string', format: 'date-time' } } },
      },
      preHandler: canSend,
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const { scheduledAt } = request.body as { scheduledAt: string };
      const result = await scheduleCampaign(fastify, id, new Date(scheduledAt));
      audit(fastify, request, { actorId: request.user?.sub, action: 'email.campaign.schedule', resource: 'email_campaign', resourceId: id });
      return result;
    },
  );

  fastify.post(
    '/email/campaigns/:id/cancel',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canSend,
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const result = await cancelCampaign(fastify, id);
      audit(fastify, request, { actorId: request.user?.sub, action: 'email.campaign.cancel', resource: 'email_campaign', resourceId: id });
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

  // -------- Reporte y exportación --------
  fastify.get(
    '/email/campaigns/:id/report',
    {
      schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } },
      preHandler: canRead,
    },
    async (request) => {
      const id = (request.params as { id: string }).id;
      const campaign = await fastify.prisma.emailCampaign.findUnique({ where: { id } });
      if (!campaign) throw new NotFoundError('Campaña');

      const messages = await fastify.prisma.emailMessage.findMany({
        where: { campaignId: id },
        select: { to: true, status: true, openedAt: true, clickCount: true },
      });
      const clicks = await fastify.prisma.emailClick.findMany({
        where: { message: { campaignId: id } },
        select: { clickedAt: true },
      });

      const sent = messages.filter((m) => m.status === 'sent');
      const sentCount = sent.length;
      const openCount = sent.filter((m) => m.openedAt).length;
      const uniqueClicks = sent.filter((m) => m.clickCount > 0).length;
      const totalClicks = sent.reduce((sum, m) => sum + m.clickCount, 0);
      const openRate = sentCount > 0 ? openCount / sentCount : 0;
      const clickRate = sentCount > 0 ? uniqueClicks / sentCount : 0;

      // Serie temporal por día (aperturas y clics).
      const day = (d: Date) => d.toISOString().slice(0, 10);
      const series = new Map<string, { date: string; opens: number; clicks: number }>();
      const bump = (date: string, field: 'opens' | 'clicks') => {
        const entry = series.get(date) ?? { date, opens: 0, clicks: 0 };
        entry[field] += 1;
        series.set(date, entry);
      };
      for (const m of sent) if (m.openedAt) bump(day(m.openedAt), 'opens');
      for (const c of clicks) bump(day(c.clickedAt), 'clicks');
      const timeSeries = [...series.values()].sort((a, b) => a.date.localeCompare(b.date));

      return {
        campaign: { id: campaign.id, name: campaign.name, status: campaign.status, totalCount: campaign.totalCount },
        summary: { sentCount, openCount, uniqueClicks, totalClicks, openRate, clickRate },
        timeSeries,
        recipients: messages.map((m) => ({
          email: m.to,
          status: m.status,
          openedAt: m.openedAt?.toISOString() ?? null,
          clickCount: m.clickCount,
        })),
      };
    },
  );

  fastify.get(
    '/email/campaigns/:id/export',
    {
      schema: {
        tags: ['email'],
        params: { type: 'object', properties: { id: { type: 'string' } } },
        querystring: { type: 'object', properties: { format: { type: 'string', enum: ['csv', 'json', 'xlsx'], default: 'csv' } } },
      },
      preHandler: canRead,
    },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const format = (request.query as { format?: string }).format ?? 'csv';
      const campaign = await fastify.prisma.emailCampaign.findUnique({ where: { id } });
      if (!campaign) throw new NotFoundError('Campaña');

      let rows: Array<Record<string, unknown>>;
      const hasSent = campaign.sentCount > 0 || campaign.status === 'sent' || campaign.status === 'sending';
      if (hasSent) {
        const messages = await fastify.prisma.emailMessage.findMany({
          where: { campaignId: id },
          select: { to: true, status: true, openedAt: true, clickCount: true },
        });
        rows = messages.map((m) => ({
          email: m.to,
          status: m.status,
          opened: m.openedAt ? m.openedAt.toISOString() : '',
          clicks: m.clickCount,
        }));
      } else {
        const recipients = await resolveRecipients(fastify, campaign);
        rows = recipients.map((r) => ({ email: r.email, status: 'pending', opened: '', clicks: 0 }));
      }

      if (format === 'json') {
        return { campaign: campaign.name, recipients: rows };
      }

      if (format === 'xlsx') {
        const ExcelJS = (await import('exceljs')).default;
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Destinatarios');
        ws.columns = [
          { header: 'email', key: 'email', width: 30 },
          { header: 'status', key: 'status', width: 12 },
          { header: 'opened', key: 'opened', width: 24 },
          { header: 'clicks', key: 'clicks', width: 10 },
        ];
        for (const r of rows) ws.addRow(r);
        const buffer = await wb.xlsx.writeBuffer();
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="campaign-${id}.xlsx"`);
        return reply.send(Buffer.from(buffer));
      }

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="campaign-${id}.csv"`);
      return toCsv(rows);
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
