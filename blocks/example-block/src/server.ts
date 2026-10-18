import { defineBlock, type BlockManifest } from '@webs/plugin-sdk';
import manifestJson from '../block.json';

const manifest = manifestJson as unknown as BlockManifest;

/**
 * Bloque de ejemplo — servidor.
 *
 * Registra una ruta bajo `/api/v1/blocks/example` y ejecuta hooks de ciclo de
 * vida. Es la referencia mínima para crear un bloque con el SDK.
 */
export default defineBlock(manifest, {
  register: async (fastify) => {
    fastify.get('/', async () => ({
      block: 'example',
      message: 'hola desde el bloque de ejemplo',
      ts: new Date().toISOString(),
    }));
  },
  hooks: {
    onInstall: async (ctx) => ctx.logger.info('bloque de ejemplo instalado'),
    onUninstall: async (ctx) => ctx.logger.info('bloque de ejemplo desinstalado'),
  },
});
