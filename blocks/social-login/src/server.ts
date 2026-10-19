import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type Provider = { id: string; name: string; clientId: string; clientSecret: string };

export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const providers = (Array.isArray((config as Record<string, unknown>).providers)
      ? (config as Record<string, unknown>).providers
      : []) as Provider[];

    // Lista los proveedores habilitados sin exponer secretos.
    fastify.get('/providers', async () =>
      providers.map((p) => ({ id: p.id, name: p.name })),
    );

    // Referencia: el OAuth real requiere un redirect flow al proveedor
    // (authorize → redirect → callback con `code` → exchange por token →
    // fetch del perfil). Aquí se simula recibiendo providerId/email/displayName
    // ya resueltos por el cliente, para no depender de secretos ni redirects.
    fastify.post('/callback', async (request: unknown) => {
      const { body } = request as {
        body?: { provider?: string; providerId?: string; email?: string; displayName?: string };
      };
      const provider = body?.provider ?? '';
      const providerId = body?.providerId ?? '';
      const email = (body?.email ?? '').trim().toLowerCase();
      if (!provider || !providerId || !email) {
        return { ok: false, error: 'provider, providerId y email son requeridos' };
      }

      // Asocia (o crea) el usuario por email. Un usuario social no tiene
      // contraseña local: passwordHash queda como placeholder.
      const user = await db.user.upsert({
        where: { email },
        create: {
          email,
          passwordHash: 'social',
          displayName: body?.displayName ?? email,
          active: true,
        },
        update: {},
      });

      // Upsert de la cuenta social por (provider, providerId).
      const existing = await db.socialAccount.findUnique({
        where: { provider_providerId: { provider, providerId } },
      });
      if (existing) {
        await db.socialAccount.update({
          where: { id: existing.id },
          data: { userId: user.id },
        });
      } else {
        await db.socialAccount.create({
          data: { provider, providerId, userId: user.id },
        });
      }

      return { ok: true };
    });
  },
});
