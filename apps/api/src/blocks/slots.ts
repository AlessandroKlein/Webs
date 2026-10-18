import type { SlotDefinition } from '@webs/plugin-sdk';

/**
 * Slots base del sitio: regiones donde el administrador puede colocar bloques.
 * Los bloques pueden declarar slots adicionales mediante su manifiesto.
 */
export const CORE_SLOTS: SlotDefinition[] = [
  { id: 'header', displayName: { es: 'Cabecera', en: 'Header' } },
  { id: 'content', displayName: { es: 'Contenido', en: 'Content' } },
  { id: 'sidebar', displayName: { es: 'Barra lateral', en: 'Sidebar' } },
  { id: 'footer', displayName: { es: 'Pie de página', en: 'Footer' } },
];
