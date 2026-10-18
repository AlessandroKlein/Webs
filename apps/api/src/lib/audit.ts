import type { FastifyInstance } from 'fastify';

export interface AuditEntry {
  actorId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  metadata?: unknown;
}

/** Registra una entrada de auditoría de forma no bloqueante. */
export function audit(fastify: FastifyInstance, request: { ip?: string }, entry: AuditEntry): void {
  void fastify.prisma.auditLog
    .create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        resource: entry.resource ?? null,
        resourceId: entry.resourceId ?? null,
        metadata: entry.metadata !== undefined ? (entry.metadata as object) : undefined,
        ip: request.ip ?? null,
      },
    })
    .catch((err) => fastify.log.warn({ err }, 'failed to write audit log'));
}
