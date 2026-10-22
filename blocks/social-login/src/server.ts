import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

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
 * documentado como TODO. Las rutas viven bajo `/api/v1/plugins/social-login`.
 */
export default definePlugin(manifest, {
  register: async (fastify, config) => {
    const db = (fastify as unknown as { prisma: Record<string, any> }).prisma;
    const fallback = (Array.isArray(config.providers) ? config.providers : []) as Provider[];

    // GET /providers → lista los proveedores habilitados (nunca expone secretos).
    // Lee la configuración vigente desde BD (no el snapshot capturado al registrar
    // el plugin) para que deshabilitar un proveedor se refleje de inmediato.
    fastify.get('/providers', async () => {
      const installation = await db.blockInstallation.findUnique({
        where: { blockId: manifest.id },
        select: { config: true },
      });
      const cfg = (installation?.config ?? {}) as { providers?: Provider[] };
      const fresh = (Array.isArray(cfg.providers) ? cfg.providers : fallback) as Provider[];
      return fresh
        .filter((p) => Boolean(p.enabled))
        .map((p) => ({ id: p.id, name: p.name }));
    });

    // POST /verify {provider, providerId, email?, displayName?}
    // Crea/recupera la SocialAccount SIN vincular a ningún User. El vínculo real
    // requiere el flujo OAuth2 completo (authorize → callback → exchange con
    // state/PKCE) que aún es TODO: el `email` del body es auto-afirmado y NUNCA
    // debe usarse como prueba de identidad (F3 — evita el secuestro de cuentas).
    // No se crean usuarios aquí: eso lo hace el auth core / plugin register.
    fastify.post('/verify', async (request: unknown) => {
      const { body } = request as {
        body?: { provider?: string; providerId?: string };
      };
      const provider = (body?.provider ?? '').trim();
      const providerId = (body?.providerId ?? '').trim();
      if (!provider || !providerId) {
        return { ok: false, linked: false, error: 'provider y providerId son requeridos' };
      }

      let account = await db.socialAccount.findUnique({
        where: { provider_providerId: { provider, providerId } },
      });
      if (!account) {
        account = await db.socialAccount.create({
          data: { provider, providerId, userId: null },
        });
      }

      // F3 (P0): sin OAuth real no hay prueba de posesión del proveedor; nunca se
      // vincula por email auto-afirmado.
      return { ok: true, linked: false, socialAccountId: account.id };
    });
  },
});
