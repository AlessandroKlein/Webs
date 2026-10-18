import type { FastifyInstance } from 'fastify';
import { buildBaseData, renderTemplate } from './render';
import { enqueueEmail } from './queue';

/**
 * Sistema de eventos → automatizaciones. Un evento es un "criterio" que se
 * cumple (registro de usuario, correo verificado, contraseña cambiada, etc.).
 * Al emitirse, se disparan las automatizaciones habilitadas que lo escuchan.
 * Los bloques pueden emitir sus propios eventos vía `ctx.services.events`.
 */

export interface EmailEvent {
  key: string;
  label: string;
  description?: string;
}

export const BUILT_IN_EVENTS: EmailEvent[] = [
  { key: 'user.registered', label: 'Usuario registrado' },
  { key: 'user.email_verified', label: 'Correo verificado' },
  { key: 'user.password_changed', label: 'Contraseña cambiada' },
];

/** Eventos registrados por los bloques instalados (vía `manifest.events`). */
const blockEvents = new Map<string, EmailEvent>();

export function registerBlockEvent(event: EmailEvent): void {
  blockEvents.set(event.key, event);
}

export function listEvents(): EmailEvent[] {
  return [...BUILT_IN_EVENTS, ...blockEvents.values()];
}

export interface EventPayload {
  user?: { id?: string; email?: string; name?: string; roles?: string[] };
  [key: string]: unknown;
}

function matchesConditions(conditions: unknown, payload: EventPayload): boolean {
  const c = (conditions ?? {}) as { roles?: string[] };
  if (!c.roles || c.roles.length === 0) return true;
  const userRoles = payload.user?.roles ?? [];
  return c.roles.some((r) => userRoles.includes(r));
}

/** Emite un evento y encola los correos de las automatizaciones que lo escuchan. */
export async function emitEvent(
  fastify: FastifyInstance,
  eventKey: string,
  payload: EventPayload,
): Promise<void> {
  const automations = await fastify.prisma.emailAutomation.findMany({
    where: { event: eventKey, enabled: true },
    include: { template: true },
  });

  for (const automation of automations) {
    if (!automation.template) continue;
    if (!matchesConditions(automation.conditions, payload)) continue;

    const to = payload.user?.email;
    if (!to) continue;

    const data = { ...(await buildBaseData(fastify)), ...payload };
    const { subject, body } = renderTemplate(automation.template, data);

    await enqueueEmail(fastify, {
      to,
      subject,
      body,
      templateId: automation.template.id,
    });
  }
}
