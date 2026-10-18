import type { BlockManifest, ServerBlock, SlotDefinition } from '@webs/plugin-sdk';

/** Un bloque cargado en memoria (instalado y activado). */
export interface LoadedBlock {
  manifest: BlockManifest;
  serverBlock: ServerBlock;
  installationId: string;
  config: Record<string, unknown>;
  sourcePath: string;
}

/**
 * Registro en memoria del sistema de bloques:
 *  - `available`: bloques descubiertos (catálogo).
 *  - `loaded`: bloques instalados y activados en el proceso actual.
 *  - `slots`: regiones del sitio donde se pueden colocar bloques.
 *  - `translations`: traducciones de los bloques instalados (namespace = id).
 */
class BlockRegistry {
  private available = new Map<string, BlockManifest>();
  private loaded = new Map<string, LoadedBlock>();
  private slots = new Map<string, SlotDefinition>();
  private translations = new Map<string, Record<string, Record<string, string>>>();

  registerAvailable(manifest: BlockManifest): void {
    this.available.set(manifest.id, manifest);
  }

  getAvailable(): BlockManifest[] {
    return [...this.available.values()];
  }

  getAvailableManifest(id: string): BlockManifest | undefined {
    return this.available.get(id);
  }

  registerLoaded(block: LoadedBlock): void {
    this.loaded.set(block.manifest.id, block);
  }

  getLoadedBlocks(): LoadedBlock[] {
    return [...this.loaded.values()];
  }

  registerSlot(slot: SlotDefinition): void {
    if (!this.slots.has(slot.id)) this.slots.set(slot.id, slot);
  }

  getSlots(): SlotDefinition[] {
    return [...this.slots.values()];
  }

  registerTranslations(blockId: string, translations: Record<string, Record<string, string>>): void {
    this.translations.set(blockId, translations);
  }

  getTranslations(): Array<{ blockId: string; translations: Record<string, Record<string, string>> }> {
    return [...this.translations.entries()].map(([blockId, translations]) => ({ blockId, translations }));
  }
}

export const blockRegistry = new BlockRegistry();
