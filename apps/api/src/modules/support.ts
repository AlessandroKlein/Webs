import type { FastifyInstance } from 'fastify';
import type { Prisma, TicketPriority, TicketStatus } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@webs/core';
import { audit } from '../lib/audit';
import { DEFAULT_ORG_ID, resolveScope } from '../lib/tenant';

/**
 * Sistema de tickets (ADR-0021): CRUD + transición de estados + scoping fail-closed.
 * Rutas bajo `/api/v1/support/tickets`.
 *
 * Permisos:
 * - `support.read`  → listar/leer tickets (staff de soporte).
 * - `support.manage`→ actualizar estado/prioridad y eliminar.
 * - Crear ticket   → cualquier usuario autenticado (autor = `request.user.sub`).
 */

const TICKET_STATUSES: ReadonlySet<string> = new Set(['pending', 'in_progress', 'done']);
const TICKET_PRIORITIES: ReadonlySet<string> = new Set(['low', 'normal', 'high', 'urgent']);

interface TicketCreateBody {
  subject?: string;
  message?: string;
  priority?: string;
}

interface TicketPatchBody {
  subject?: string;
  message?: string;
  status?: string;
  priority?: string;
  assignedToUserId?: string | null;
}

/** Proyección del ticket para la API (sin campos internos). */
function ticketView(ticket: {
  id: string;
  organizationId: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  assignedToUserId: string | null;
  authorId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: ticket.id,
    organizationId: ticket.organizationId,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    priority: ticket.priority,
    assignedToUserId: ticket.assignedToUserId,
    authorId: ticket.authorId,
    resolvedAt: ticket.resolvedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

export default async function supportRoutes(fastify: FastifyInstance): Promise<void> {
  // -------- Listado (scoped) --------
  fastify.get(
    '/support/tickets',
    {
      schema: { tags: ['support'] },
      preHandler: [fastify.authenticate, fastify.authorize('support.read'), fastify.requireTenant],
    },
    async (request) => {
      const scope = await resolveScope(fastify, request.tenant!);
      const tickets = await fastify.prisma.ticket.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
      });
      return { items: tickets.map(ticketView) };
    },
  );

  // -------- Detalle (scoped) --------
  fastify.get(
    '/support/tickets/:id',
    {
      schema: { tags: ['support'] },
      preHandler: [fastify.authenticate, fastify.authorize('support.read'), fastify.requireTenant],
    },
    async (request) => {
      const scope = await resolveScope(fastify, request.tenant!);
      const { id } = request.params as { id: string };
      const ticket = await fastify.prisma.ticket.findFirst({ where: { id, ...scope } });
      if (!ticket) throw new NotFoundError('Ticket no encontrado');
      return ticketView(ticket);
    },
  );

  // -------- Crear (cualquier usuario autenticado) --------
  fastify.post(
    '/support/tickets',
    {
      schema: { tags: ['support'] },
      preHandler: [fastify.authenticate, fastify.requireTenant],
    },
    async (request) => {
      const body = (request.body ?? {}) as TicketCreateBody;
      const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
      if (!subject) throw new BadRequestError('El asunto es obligatorio');
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const priority = TICKET_PRIORITIES.has(body.priority ?? '') ? body.priority! : 'normal';

      const ticket = await fastify.prisma.ticket.create({
        data: {
          organizationId: request.tenant?.organizationId ?? DEFAULT_ORG_ID,
          subject,
          message,
          priority: priority as TicketPriority,
          status: 'pending',
          authorId: request.user?.sub ?? null,
        },
      });
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'ticket.create',
        resource: 'ticket',
        resourceId: ticket.id,
      });
      return ticketView(ticket);
    },
  );

  // -------- Actualizar (estado/prioridad/asignación) --------
  fastify.patch(
    '/support/tickets/:id',
    {
      schema: { tags: ['support'] },
      preHandler: [fastify.authenticate, fastify.authorize('support.manage'), fastify.requireTenant],
    },
    async (request) => {
      const scope = await resolveScope(fastify, request.tenant!);
      const { id } = request.params as { id: string };
      const existing = await fastify.prisma.ticket.findFirst({ where: { id, ...scope } });
      if (!existing) throw new NotFoundError('Ticket no encontrado');

      const body = (request.body ?? {}) as TicketPatchBody;
      const data: Prisma.TicketUpdateInput = {};

      if (typeof body.subject === 'string' && body.subject.trim()) data.subject = body.subject.trim();
      if (typeof body.message === 'string') data.message = body.message.trim();
      if (body.priority !== undefined) {
        if (!TICKET_PRIORITIES.has(body.priority)) throw new BadRequestError('Prioridad inválida');
        data.priority = body.priority as TicketPriority;
      }
      if (body.assignedToUserId !== undefined) data.assignedToUserId = body.assignedToUserId;
      if (body.status !== undefined) {
        if (!TICKET_STATUSES.has(body.status)) throw new BadRequestError('Estado inválido');
        data.status = body.status as TicketStatus;
        // Transición de estados: se marca/limpia `resolvedAt` según `done`.
        data.resolvedAt = body.status === 'done' ? new Date() : null;
      }

      const ticket = await fastify.prisma.ticket.update({ where: { id }, data });
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'ticket.update',
        resource: 'ticket',
        resourceId: ticket.id,
      });
      return ticketView(ticket);
    },
  );

  // -------- Eliminar (scoped) --------
  fastify.delete(
    '/support/tickets/:id',
    {
      schema: { tags: ['support'] },
      preHandler: [fastify.authenticate, fastify.authorize('support.manage'), fastify.requireTenant],
    },
    async (request) => {
      const scope = await resolveScope(fastify, request.tenant!);
      const { id } = request.params as { id: string };
      const existing = await fastify.prisma.ticket.findFirst({ where: { id, ...scope } });
      if (!existing) throw new NotFoundError('Ticket no encontrado');
      await fastify.prisma.ticket.delete({ where: { id } });
      audit(fastify, request, {
        actorId: request.user?.sub,
        action: 'ticket.delete',
        resource: 'ticket',
        resourceId: id,
      });
      return { ok: true };
    },
  );
}
