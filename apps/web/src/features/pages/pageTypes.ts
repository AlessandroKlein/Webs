/**
 * Tipos compartidos del constructor de páginas y del renderizado público.
 *
 * El `layout` de una página (columna JSON `Page.layout`) es una lista de
 * secciones; cada sección tiene un ancho (`full`/`half`/`third`) y una lista
 * de `items`. Un item puede ser:
 *  - un `string` = id de plugin (plugin) instalado (retrocompatible con el
 *    formato anterior, donde `blocks` era `string[]`), o
 *  - un `PageElement` = elemento de contenido (título, texto, imagen, …).
 *
 * Mantenemos el nombre del campo `blocks` en la sección para no romper la
 * API ni las páginas ya guardadas; sólo ampliamos el tipo de cada entrada.
 */

import i18next from '../../lib/i18n';

export type Size = 'full' | 'half' | 'third';

export type PageElementType = 'heading' | 'text' | 'image' | 'divider' | 'spacer' | 'html';

export interface PageElement {
  type: PageElementType;
  /** heading/text: el texto; image: la URL; spacer: alto en px (opcional); html: HTML crudo. */
  content?: string;
  /** Nivel del heading (1–4). Por defecto 2. */
  level?: number;
}

/** Item de una sección: id de plugin (string) o elemento de contenido (objeto). */
export type PageItem = string | PageElement;

export interface PageSection {
  size?: Size;
  blocks: PageItem[];
}

export interface Page {
  id: string;
  slug: string;
  title: string;
  layout: PageSection[];
  redirectUrl: string | null;
  isHome: boolean;
}

/** Guard de tipo: `true` si el item es un elemento de contenido (objeto). */
export function isPageElement(value: unknown): value is PageElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PageElement).type === 'string'
  );
}

export function elementTypeOptions(): Array<{ type: PageElementType; label: string }> {
  return [
    { type: 'heading', label: i18next.t('pages.elemHeading') },
    { type: 'text', label: i18next.t('pages.elemText') },
    { type: 'image', label: i18next.t('pages.elemImage') },
    { type: 'divider', label: i18next.t('pages.elemDivider') },
    { type: 'spacer', label: i18next.t('pages.elemSpacer') },
    { type: 'html', label: i18next.t('pages.elemHtml') },
  ];
}

/** Crea un elemento de contenido con valores por defecto según su tipo. */
export function createElement(type: PageElementType): PageElement {
  switch (type) {
    case 'heading':
      return { type, content: i18next.t('pages.elemNewTitle'), level: 2 };
    case 'text':
      return { type, content: i18next.t('pages.elemSampleText') };
    case 'image':
      return { type, content: '' };
    case 'divider':
      return { type };
    case 'spacer':
      return { type, content: '24' };
    case 'html':
      return { type, content: '' };
  }
}

/** Etiqueta legible de un item (para el constructor). */
export function itemLabel(item: PageItem, pluginLabel: (id: string) => string): string {
  if (isPageElement(item)) return elementLabel(item);
  return pluginLabel(item);
}

/** Etiqueta legible de un elemento de contenido. */
export function elementLabel(element: PageElement): string {
  switch (element.type) {
    case 'heading': {
      const tag = `H${element.level ?? 2}`;
      return `${tag} · ${element.content ?? i18next.t('pages.elemHeading')}`;
    }
    case 'text':
      return `${i18next.t('pages.elemText')} · ${(element.content ?? '').slice(0, 24) || i18next.t('pages.elemEmpty')}`;
    case 'image':
      return `${i18next.t('pages.elemImage')}${element.content ? ' · ' + element.content.slice(0, 24) : ''}`;
    case 'divider':
      return i18next.t('pages.elemDivider');
    case 'spacer':
      return `${i18next.t('pages.elemSpacer')} · ${element.content ?? '24'}px`;
    case 'html':
      return i18next.t('pages.elemHtml');
  }
}
