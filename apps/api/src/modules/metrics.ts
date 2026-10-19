import type { FastifyInstance } from 'fastify';

export default async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/metrics',
    { schema: { tags: ['metrics'] }, preHandler: [fastify.authenticate] },
    async () => {
      const now = new Date();
      const [users, content, media, campaigns, automations, blocks, sessions, payments, roles, pages] = await Promise.all([
        fastify.prisma.user.count(),
        fastify.prisma.content.count(),
        fastify.prisma.media.count(),
        fastify.prisma.emailCampaign.count(),
        fastify.prisma.emailAutomation.count(),
        fastify.prisma.blockInstallation.count(),
        fastify.prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
        fastify.prisma.payment.count(),
        fastify.prisma.role.count(),
        fastify.prisma.page.count(),
      ]);

      const messages = await fastify.prisma.emailMessage.aggregate({
        _count: { _all: true },
        _sum: { clickCount: true },
      });
      const opens = await fastify.prisma.emailMessage.count({ where: { openedAt: { not: null } } });

      return {
        users,
        content,
        media,
        blocks,
        activeSessions: sessions,
        payments,
        roles,
        pages,
        email: {
          campaigns,
          automations,
          sent: messages._count._all,
          opens,
          clicks: messages._sum.clickCount ?? 0,
        },
      };
    },
  );
}
