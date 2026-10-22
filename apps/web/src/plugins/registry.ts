import type { ClientPlugin } from '@webs/plugin-sdk';

/**
 * Registro de plugins del lado cliente. En esta base los plugins se empaquetan
 * en tiempo de build (se importan estáticamente en `./index.ts`). La carga
 * dinámica en runtime (importmap / module federation) es una evolución futura.
 */
const registry = new Map<string, ClientPlugin>();

export function registerClientPlugin(plugin: ClientPlugin): void {
  registry.set(plugin.manifest.id, plugin);
}

export function getClientPlugin(id: string): ClientPlugin | undefined {
  return registry.get(id);
}

/** @deprecated Usar {@link registerClientPlugin}. Alias por retrocompatibilidad. */
export const registerClientBlock = registerClientPlugin;
/** @deprecated Usar {@link getClientPlugin}. Alias por retrocompatibilidad. */
export const getClientBlock = getClientPlugin;
