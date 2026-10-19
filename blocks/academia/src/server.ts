import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const authenticate = (fastify as unknown as { authenticate: unknown }).authenticate as (
      req: unknown,
    ) => Promise<void>;

    // Cursos (listado público).
    fastify.get('/courses', async () => db.course.findMany({ orderBy: { title: 'asc' } }));

    fastify.post('/courses', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as {
        body?: { title?: string; description?: string | null; level?: string | null; lessons?: unknown };
      };
      return db.course.create({
        data: {
          title: body?.title ?? '',
          description: body?.description ?? null,
          level: body?.level ?? null,
          lessons: Array.isArray(body?.lessons) ? body.lessons : [],
        },
      });
    });

    fastify.patch('/courses/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { title?: string; description?: string | null; level?: string | null; lessons?: unknown };
      };
      const data: Record<string, unknown> = {};
      if (body?.title !== undefined) data.title = body.title;
      if (body?.description !== undefined) data.description = body.description;
      if (body?.level !== undefined) data.level = body.level;
      if (body?.lessons !== undefined) data.lessons = body.lessons;
      return db.course.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/courses/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.course.delete({ where: { id: params?.id } });
    });

    // Inscripciones (requieren autenticación).
    fastify.get('/enrollments', { preHandler: [authenticate] }, async () =>
      db.enrollment.findMany({ orderBy: { createdAt: 'desc' } }),
    );

    fastify.post('/enrollments', { preHandler: [authenticate] }, async (request: unknown) => {
      const { body } = request as { body?: { courseId?: string; student?: string } };
      return db.enrollment.create({
        data: { courseId: body?.courseId ?? '', student: body?.student ?? '', progress: 0 },
      });
    });

    fastify.patch('/enrollments/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params, body } = request as {
        params?: { id?: string };
        body?: { progress?: number; completedAt?: string | null };
      };
      const data: Record<string, unknown> = {};
      if (body?.progress !== undefined) {
        const progress = Math.max(0, Math.min(100, Math.round(body.progress)));
        data.progress = progress;
        if (progress >= 100 && body.completedAt === undefined) data.completedAt = new Date();
      }
      if (body?.completedAt !== undefined) {
        data.completedAt = body.completedAt ? new Date(body.completedAt) : null;
      }
      return db.enrollment.update({ where: { id: params?.id }, data });
    });

    fastify.delete('/enrollments/:id', { preHandler: [authenticate] }, async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return db.enrollment.delete({ where: { id: params?.id } });
    });
  },
});
