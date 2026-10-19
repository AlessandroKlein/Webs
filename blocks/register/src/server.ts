import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

export default defineBlock(manifest, {
  register: async (fastify) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;

    // Registro público: crea un usuario `active: false` (pendiente de aprobación).
    // `passwordHash` queda como 'pending': el admin asigna la contraseña real
    // tras aprobar la cuenta (aquí no se guarda la contraseña en claro).
    fastify.post('/register', async (request: unknown) => {
      const { body } = request as {
        body?: { email?: string; password?: string; displayName?: string };
      };
      const email = (body?.email ?? '').trim().toLowerCase();
      if (!email || !body?.password) {
        return { ok: false, error: 'email y contraseña son requeridos' };
      }

      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        return { ok: false, error: 'email ya registrado' };
      }

      await db.user.create({
        data: {
          email,
          passwordHash: 'pending',
          displayName: body?.displayName ?? '',
          active: false,
        },
      });

      return { ok: true, pendingApproval: true };
    });
  },
});
