import { definePlugin, type PluginManifest } from '@webs/plugin-sdk';
import manifestJson from '../plugin.json';

const manifest = manifestJson as unknown as PluginManifest;

/**
 * Plugin de ejemplo — servidor.
 *
 * Registra una ruta bajo `/api/v1/plugins/example` y ejecuta hooks de ciclo de
 * vida. Es la referencia mínima para crear un plugin con el SDK.
 */
export default definePlugin(manifest, {
  register: async (fastify) => {
    fastify.get('/', async () => ({
      block: 'example',
      message: 'hola desde el plugin de ejemplo',
      ts: new Date().toISOString(),
    }));

    // Ejemplo de evento de negocio: al "crear un pedido" se emite
    // `order.created`, que dispara automatizaciones de correo.
    fastify.post('/order', async (request: unknown) => {
      const { body } = request as { body?: { email?: string; name?: string; total?: number } };
      if (fastify.events) {
        await fastify.events.emit('order.created', {
          user: { email: body?.email, name: body?.name },
          order: { id: Date.now().toString(), total: body?.total ?? 0 },
        });
      }
      return { ok: true, event: 'order.created', email: body?.email ?? null };
    });
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('plugin de ejemplo instalado'),
    onUninstall: async (ctx) => ctx.logger.info('plugin de ejemplo desinstalado'),
  },
});
