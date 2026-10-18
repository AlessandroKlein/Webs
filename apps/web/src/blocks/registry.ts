import type { ClientBlock } from '@webs/plugin-sdk';

/**
 * Registro de bloques del lado cliente. En esta base los bloques se empaquetan
 * en tiempo de build (se importan estáticamente en `./index.ts`). La carga
 * dinámica en runtime (importmap / module federation) es una evolución futura.
 */
const registry = new Map<string, ClientBlock>();

export function registerClientBlock(block: ClientBlock): void {
  registry.set(block.manifest.id, block);
}

export function getClientBlock(id: string): ClientBlock | undefined {
  return registry.get(id);
}
