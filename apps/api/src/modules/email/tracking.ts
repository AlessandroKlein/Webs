import type { FastifyInstance } from 'fastify';

/**
 * Tracking de correos: pixel de apertura y reescritura de enlaces para contar
 * clics. Las rutas son públicas (las abre el cliente de correo del destinatario).
 */

const GIF_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export function baseUrl(fastify: FastifyInstance): string {
  return (fastify.config.CORS_ORIGIN.split(',')[0] ?? 'http://localhost:5173').trim();
}

/** Inyecta el pixel de apertura y reescribe los enlaces para tracking de clics. */
export function injectTracking(html: string, messageId: string, base: string): string {
  const pixel = `<img src="${base}/api/v1/public/email/open/${messageId}" width="1" height="1" alt="" style="display:none" />`;

  let out = html.replace(/<a\s+([^>]*?)href="([^"]+)"/gi, (match, attrs, href) => {
    if (href.startsWith(base) || href.startsWith('#') || href.startsWith('mailto:')) return match;
    const tracked = `${base}/api/v1/public/email/click/${messageId}?url=${encodeURIComponent(href)}`;
    return `<a ${attrs}href="${tracked}"`;
  });

  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${pixel}</body>`);
  else out += pixel;
  return out;
}

export async function trackOpen(fastify: FastifyInstance, id: string): Promise<Buffer> {
  const message = await fastify.prisma.emailMessage.findUnique({ where: { id } });
  if (message && !message.openedAt) {
    await fastify.prisma.emailMessage.update({ where: { id }, data: { openedAt: new Date() } });
    if (message.campaignId) {
      await fastify.prisma.emailCampaign.update({
        where: { id: message.campaignId },
        data: { openCount: { increment: 1 } },
      });
    }
  }
  return GIF_1x1;
}

export async function trackClick(
  fastify: FastifyInstance,
  id: string,
  url: string,
): Promise<string | null> {
  const message = await fastify.prisma.emailMessage.findUnique({ where: { id } });
  if (message) {
    await fastify.prisma.emailMessage.update({ where: { id }, data: { clickCount: { increment: 1 } } });
    await fastify.prisma.emailClick.create({ data: { messageId: id, url } }).catch(() => {});
    if (message.campaignId) {
      await fastify.prisma.emailCampaign.update({
        where: { id: message.campaignId },
        data: { clickCount: { increment: 1 } },
      });
    }
  }
  // Evita open redirect: solo http/https.
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

export default async function trackingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/public/email/open/:id',
    { schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } } },
    async (request, reply) => {
      const buffer = await trackOpen(fastify, (request.params as { id: string }).id);
      return reply.type('image/gif').send(buffer);
    },
  );

  fastify.get(
    '/public/email/click/:id',
    { schema: { tags: ['email'], params: { type: 'object', properties: { id: { type: 'string' } } } } },
    async (request, reply) => {
      const id = (request.params as { id: string }).id;
      const url = (request.query as { url?: string }).url ?? '';
      const target = await trackClick(fastify, id, url);
      if (!target) return reply.status(400).send();
      return reply.redirect(target);
    },
  );
}
