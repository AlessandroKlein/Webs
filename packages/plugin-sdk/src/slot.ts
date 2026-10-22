import type { LocalizedString } from './manifest';

/**
 * Un **slot** es una región nombrada del sitio (header, footer, sidebar, zona de
 * contenido, etc.) donde el administrador puede colocar plugins desde la UI.
 *
 * La plataforma define los slots base; los plugins pueden declarar en su
 * manifiesto en qué slots (`manifest.slots`) tienen permitido ubicarse.
 */
export interface SlotDefinition {
  /** Identificador único del slot (slug). Ej: `content`, `footer`. */
  id: string;
  displayName: LocalizedString;
  description?: LocalizedString;
  /** Número máximo de plugins permitidos en este slot (sin límite si se omite). */
  maxBlocks?: number;
  /** Si el slot es obligatorio y no puede deshabilitarse. */
  required?: boolean;
}

/**
 * Una **colocación** es la instancia concreta de un plugin dentro de un slot,
 * con su orden y su configuración particular (el admin puede colocar el mismo
 * plugin varias veces con distinta configuración).
 */
export interface PluginPlacement {
  id: string;
  blockId: string;
  slotId: string;
  order: number;
  enabled: boolean;
  config: Record<string, unknown>;
}

/** @deprecated Usar {@link PluginPlacement}. Alias por retrocompatibilidad. */
export type BlockPlacement = PluginPlacement;
