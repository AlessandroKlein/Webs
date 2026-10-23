import type { PluginManifest, ServerPlugin, SlotDefinition, PluginMenuItem } from '@webs/plugin-sdk';

/** Un plugin cargado en memoria (instalado y activado). */
export interface LoadedPlugin {
  manifest: PluginManifest;
  serverPlugin: ServerPlugin;
  installationId: string;
  config: Record<string, unknown>;
  sourcePath: string;
}

/** @deprecated Usar {@link LoadedPlugin}. Alias por retrocompatibilidad. */
export type LoadedBlock = LoadedPlugin;

/**
 * Registro en memoria del sistema de plugins:
 *  - `available`: plugins descubiertos (catálogo).
 *  - `loaded`: plugins instalados y activados en el proceso actual.
 *  - `slots`: regiones del sitio donde se pueden colocar plugins.
 *  - `translations`: traducciones de los plugins instalados (namespace = id).
 *  - `menuItems`: items de menú declarados por los plugins instalados.
 */
class PluginRegistry {
  private available = new Map<string, PluginManifest>();
  private loaded = new Map<string, LoadedPlugin>();
  private slots = new Map<string, SlotDefinition>();
  private translations = new Map<string, Record<string, Record<string, string>>>();
  private menuItems = new Map<string, PluginMenuItem[]>();

  registerAvailable(manifest: PluginManifest): void {
    this.available.set(manifest.id, manifest);
  }

  unregisterAvailable(pluginId: string): void {
    this.available.delete(pluginId);
  }

  getAvailable(): PluginManifest[] {
    return [...this.available.values()];
  }

  getAvailableManifest(id: string): PluginManifest | undefined {
    return this.available.get(id);
  }

  registerLoaded(plugin: LoadedPlugin): void {
    this.loaded.set(plugin.manifest.id, plugin);
  }

  /** Quita un plugin del registro de cargados (hot-reload / desactivación). */
  unregisterLoaded(pluginId: string): void {
    this.loaded.delete(pluginId);
  }

  getLoadedPlugins(): LoadedPlugin[] {
    return [...this.loaded.values()];
  }

  /** @deprecated Usar {@link getLoadedPlugins}. Alias por retrocompatibilidad. */
  getLoadedBlocks(): LoadedPlugin[] {
    return this.getLoadedPlugins();
  }

  registerSlot(slot: SlotDefinition): void {
    if (!this.slots.has(slot.id)) this.slots.set(slot.id, slot);
  }

  getSlots(): SlotDefinition[] {
    return [...this.slots.values()];
  }

  registerTranslations(pluginId: string, translations: Record<string, Record<string, string>>): void {
    this.translations.set(pluginId, translations);
  }

  unregisterTranslations(pluginId: string): void {
    this.translations.delete(pluginId);
  }

  getTranslations(): Array<{ pluginId: string; translations: Record<string, Record<string, string>> }> {
    return [...this.translations.entries()].map(([pluginId, translations]) => ({ pluginId, translations }));
  }

  /** Registra los items de menú declarados por un plugin instalado/activado. */
  registerMenuItems(pluginId: string, items: PluginMenuItem[]): void {
    if (items && items.length > 0) {
      this.menuItems.set(pluginId, items);
    } else {
      this.menuItems.delete(pluginId);
    }
  }

  unregisterMenuItems(pluginId: string): void {
    this.menuItems.delete(pluginId);
  }

  getMenuItems(): Array<{ pluginId: string; items: PluginMenuItem[] }> {
    return [...this.menuItems.entries()].map(([pluginId, items]) => ({ pluginId, items }));
  }
}

export const pluginRegistry = new PluginRegistry();

/** @deprecated Usar {@link pluginRegistry}. Alias por retrocompatibilidad. */
export const blockRegistry = pluginRegistry;
