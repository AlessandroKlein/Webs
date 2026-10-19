import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

type Provider = {
  id: string;
  name: string;
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
};

/**
 * social-login — servidor.
 *
 * Modela el contrato de login social + vínculo de cuentas sin implementar el
 * flujo OAuth2 completo (authorize → redirect → callback → exchange), que queda
 * documentado como TODO. Las rutas viven bajo `/api/v1/blocks/social-login`.
 */
export default defineBlock(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const providers = (Array.isArray(config.providers) ? config.providers : []) as Provider[];

    // GET /providers → lista los proveedores habilitados (nunca expone secretos).
    fastify.get('/providers', async () =>
      providers
        .filter((p) => Boolean(p.enabled))
        .map((p) => ({ id: p.id, name: p.name })),
    );

    // POST /verify {provider, providerId, email?, displayName?}
    // Crea/recupera la SocialAccount y, si hay email, vincula con el User que
    // coincida. No crea usuarios: eso lo hace el auth core / bloque register.
    fastify.post('/verify', async (request: unknown) => {
      const { body } = request as {
        body?: { provider?: string; providerId?: string; email?: string; displayName?: string };
      };
      const provider = (body?.provider ?? '').trim();
      const providerId = (body?.providerId ?? '').trim();
      if (!provider || !providerId) {
        return { ok: false, linked: false, error: 'provider y providerId son requeridos' };
      }

      const email = (body?.email ?? '').trim().toLowerCase();

      let account = await db.socialAccount.findUnique({
        where: { provider_providerId: { provider, providerId } },
      });
      if (!account) {
        account = await db.socialAccount.create({
          data: { provider, providerId, userId: null },
        });
      }

      if (email) {
        const user = await db.user.findUnique({ where: { email } });
        if (user) {
          account = await db.socialAccount.update({
            where: { id: account.id },
            data: { userId: user.id },
          });
          return { ok: true, linked: true, userId: user.id, socialAccountId: account.id };
        }
      }

      return { ok: true, linked: false, socialAccountId: account.id };
    });
  },
});
