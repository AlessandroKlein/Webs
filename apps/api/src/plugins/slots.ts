import type { SlotDefinition } from '@webs/plugin-sdk';

/**
 * Slots base del sitio: regiones donde el administrador puede colocar plugins.
 * Los plugins pueden declarar slots adicionales mediante su manifiesto.
 */
export const CORE_SLOTS: SlotDefinition[] = [
  { id: 'header', displayName: { es: 'Cabecera', en: 'Header' } },
  { id: 'content', displayName: { es: 'Contenido', en: 'Content' } },
  { id: 'sidebar', displayName: { es: 'Barra lateral', en: 'Sidebar' } },
  { id: 'payment', displayName: { es: 'Pago', en: 'Checkout' } },
  { id: 'footer', displayName: { es: 'Pie de página', en: 'Footer' } },
];
