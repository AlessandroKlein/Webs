import type { FastifyInstance } from 'fastify';

export default async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/admin/metrics',
    { schema: { tags: ['metrics'] }, preHandler: [fastify.authenticate] },
    async () => {
      const [users, content, media, campaigns, automations, blocks, sessions] = await Promise.all([
        fastify.prisma.user.count(),
        fastify.prisma.content.count(),
        fastify.prisma.media.count(),
        fastify.prisma.emailCampaign.count(),
        fastify.prisma.emailAutomation.count(),
        fastify.prisma.blockInstallation.count(),
        fastify.prisma.session.count(),
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
