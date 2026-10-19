import type { FastifyInstance } from 'fastify';
import { audit } from '../../lib/audit';
import { sendMail } from '../mail/service';
import { ensureDefaultSections, getSectionValue, listSections, setSectionValue } from './service';
import { decryptSecretFields } from '../../lib/crypto';

export default async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  ensureDefaultSections();

  // Footer público (datos no sensibles para el pie de página).
  fastify.get('/public/footer', { schema: { tags: ['settings'] } }, async () => {
    const pick = (v: Record<string, unknown>) => ({ ...v });
    const [site, footer, social] = await Promise.all([
      fastify.prisma.setting.findUnique({ where: { key: 'site' } }),
      fastify.prisma.setting.findUnique({ where: { key: 'footer' } }),
      fastify.prisma.setting.findUnique({ where: { key: 'social' } }),
    ]);
    return {
      site: pick((site?.value as Record<string, unknown>) ?? {}),
      footer: pick((footer?.value as Record<string, unknown>) ?? {}),
      social: pick((social?.value as Record<string, unknown>) ?? {}),
    };
  });

  fastify.get(
    '/settings',
    {
      schema: { tags: ['settings'] },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async () => listSections(fastify),
  );

  fastify.get(
    '/settings/:key',
    {
      schema: {
        tags: ['settings'],
        params: { type: 'object', properties: { key: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.read')],
    },
    async (request) => getSectionValue(fastify, (request.params as { key: string }).key),
  );

  fastify.put(
    '/settings/:key',
    {
      schema: {
        tags: ['settings'],
        params: { type: 'object', properties: { key: { type: 'string' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const key = (request.params as { key: string }).key;
      const value = request.body;
      const result = await setSectionValue(fastify, key, value, request.user?.sub);
      audit(fastify, request, { actorId: request.user?.sub, action: 'setting.update', resource: 'setting', resourceId: key });
      return result;
    },
  );

  // Test de SMTP: envía un correo de prueba con la configuración guardada.
  fastify.post(
    '/settings/test-smtp',
    {
      schema: {
        tags: ['settings'],
        body: { type: 'object', required: ['to'], properties: { to: { type: 'string', format: 'email' } } },
      },
      preHandler: [fastify.authenticate, fastify.authorize('setting.write')],
    },
    async (request) => {
      const { to } = request.body as { to: string };
      const sent = await sendMail(fastify, {
        to,
        subject: 'Test SMTP — Webs',
        html: '<p>Este es un correo de prueba de Webs. Si lo recibiste, el SMTP está configurado correctamente.</p>',
      });
      if (!sent) return { ok: false, message: 'SMTP no configurado (revisá host/puerto/enabled).' };
      return { ok: true, message: `Correo de prueba enviado a ${to}.` };
    },
  );
}
