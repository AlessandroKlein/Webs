import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

interface Lesson { id: string; title: string; videoUrl?: string; pdfUrl?: string }
interface Course { id: string; title: string; description: string; level: string; lessons: Lesson[] }
interface Enrollment { id: string; courseId: string; student: string; progress: number; completedAt?: string }
const enrollments: Enrollment[] = [];

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const courses = (Array.isArray((config as Record<string, unknown>).courses) ? (config as Record<string, unknown>).courses : []) as Course[];

    fastify.get('/courses', async () => courses.map(({ lessons, ...c }) => ({ ...c, lessons: lessons.length })));
    fastify.get('/courses/:id', async (request: unknown) => {
      const { params } = request as { params?: { id?: string } };
      return courses.find((c) => c.id === params?.id) ?? null;
    });
    fastify.post('/enrollments', async (request: unknown) => {
      const { body } = request as { body?: { courseId?: string; student?: string } };
      const e: Enrollment = { id: crypto.randomUUID(), courseId: body?.courseId ?? '', student: body?.student ?? '', progress: 0 };
      enrollments.unshift(e);
      return e;
    });
    fastify.patch('/enrollments/:id', async (request: unknown) => {
      const { params, body } = request as { params?: { id?: string }; body?: { progress?: number } };
      const e = enrollments.find((x) => x.id === params?.id);
      if (!e) return { ok: false };
      if (body?.progress !== undefined) {
        e.progress = body.progress;
        if (e.progress >= 100 && !e.completedAt) e.completedAt = new Date().toISOString();
      }
      return e;
    });
    fastify.get('/enrollments', async () => enrollments);
  },
});
