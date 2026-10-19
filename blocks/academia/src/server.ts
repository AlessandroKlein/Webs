import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Lesson { id: string; title: string; videoUrl?: string; pdfUrl?: string }
interface Course { id: string; title: string; description: string; level: string; lessons: Lesson[] }

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const courses = (Array.isArray((config as Record<string, unknown>).courses) ? (config as Record<string, unknown>).courses : []) as Course[];
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    fastify.get('/courses', async () => courses.map(({ lessons, ...c }) => ({ ...c, lessons: lessons.length })));
    fastify.get('/courses/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return courses.find((c) => c.id === params?.id) ?? null;
    });
    fastify.post('/enrollments', async (request: unknown) => {
      const { body } = request as { body?: { courseId?: string; student?: string } };
      return db.enrollment.create({ data: { courseId: body?.courseId ?? '', student: body?.student ?? '', progress: 0 } });
    });
    fastify.patch('/enrollments/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { progress?: number } };
      if (body?.progress === undefined) return { ok: false };
      const data: Record<string, unknown> = { progress: body.progress };
      if (body.progress >= 100) data.completedAt = new Date();
      return db.enrollment.update({ where: { id: params?.id }, data });
    });
    fastify.get('/enrollments', async () => db.enrollment.findMany({ orderBy: { createdAt: 'desc' } }));
  },
});
