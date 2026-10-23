import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import grapesjs, { type Component, type Editor } from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import {
  type PageElement,
  type PageItem,
  type PageSection,
  type Size,
} from '../pages/pageTypes';
import i18next from '../../lib/i18n';

export interface GrapesEditorHandle {
  /** Reemplaza el contenido del lienzo por el layout estructurado dado. */
  load: (sections: PageSection[]) => void;
  /** Serializa el lienzo de vuelta a un layout estructurado (PageSection[]). */
  serialize: () => PageSection[];
}

export interface GrapesPluginBlock {
  id: string;
  name: string;
}

interface GrapesEditorProps {
  plugins: GrapesPluginBlock[];
  onChange?: (sections: PageSection[]) => void;
  className?: string;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function esc(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => ESC[ch] ?? ch);
}

/** Tag de heading según nivel (1–4). */
function headingTag(level: number | undefined): string {
  const l = Math.min(Math.max(level ?? 2, 1), 4);
  return `h${l}`;
}

function levelFromTag(tag: string): number {
  const m = /^h([1-4])$/i.exec(tag);
  return m ? Number(m[1]) : 2;
}

function elementToHtml(element: PageElement): string {
  switch (element.type) {
    case 'heading':
      return `<${headingTag(element.level)} data-ws-block="heading" style="margin:0">${esc(element.content ?? '')}</${headingTag(element.level)}>`;
    case 'text':
      return `<p data-ws-block="text" style="white-space:pre-wrap;margin:0">${esc(element.content ?? '')}</p>`;
    case 'image':
      return `<img data-ws-block="image" src="${esc(element.content ?? '')}" alt="" style="max-width:100%;display:block"/>`;
    case 'divider':
      return `<hr data-ws-block="divider"/>`;
    case 'spacer':
      return `<div data-ws-block="spacer" style="height:${esc(element.content ?? '24')}px"></div>`;
    case 'html':
      return `<div data-ws-block="html">${element.content ?? ''}</div>`;
    default:
      return '';
  }
}

function itemToHtml(item: PageItem): string {
  if (typeof item === 'string') {
    return `<div data-ws-block="plugin" data-ws-plugin="${esc(item)}" style="padding:8px 12px;border:1px dashed var(--ws-border, #94a3b8);border-radius:6px">${i18next.t('editor.pluginPrefix', { name: esc(item) })}</div>`;
  }
  return elementToHtml(item);
}

function sectionToHtml(section: PageSection): string {
  const size = section.size ?? 'full';
  const inner = (section.blocks ?? []).map(itemToHtml).join('');
  return `<section data-ws-section="1" data-ws-size="${size}" style="min-height:64px;padding:12px;margin:8px 0;border:1px dashed #94a3b8;border-radius:6px">${inner}</section>`;
}

export function sectionsToHtml(sections: PageSection[]): string {
  return sections.map(sectionToHtml).join('');
}

const SIZE_LABEL: Record<Size, string> = {
  full: 'editor.sizeFull',
  half: 'editor.sizeHalf',
  third: 'editor.sizeThird',
};

/** Registra los bloques del builder visual (estructura + elementos + plugins). */
function addBlocks(editor: Editor, plugins: GrapesPluginBlock[]): void {
  const bm = editor.BlockManager;

  // Secciones (definen el ancho con el que el renderizador las dibuja).
  (['full', 'half', 'third'] as const).forEach((size) => {
    bm.add(`ws-section-${size}`, {
      label: i18next.t('editor.sectionLabel', { size: i18next.t(SIZE_LABEL[size]) }),
      category: i18next.t('editor.categoryStructure'),
      media: '<i class="bi bi-layout-three-columns"></i>',
      content: `<section data-ws-section="1" data-ws-size="${size}" style="min-height:64px;padding:12px;border:1px dashed #94a3b8;border-radius:6px"></section>`,
    });
  });

  const elements: Array<{ id: string; label: string; icon: string; html: string }> = [
    {
      id: 'ws-heading-h1',
      label: i18next.t('editor.headingH1'),
      icon: 'bi-type-h1',
      html: `<h1 data-ws-block="heading" style="margin:0">${i18next.t('pages.elemHeading')}</h1>`,
    },
    {
      id: 'ws-heading-h2',
      label: i18next.t('editor.headingH2'),
      icon: 'bi-type-h2',
      html: `<h2 data-ws-block="heading" style="margin:0">${i18next.t('editor.subtitle')}</h2>`,
    },
    {
      id: 'ws-text',
      label: i18next.t('pages.elemText'),
      icon: 'bi-text-paragraph',
      html: `<p data-ws-block="text" style="white-space:pre-wrap;margin:0">${i18next.t('pages.textPlaceholder')}</p>`,
    },
    {
      id: 'ws-image',
      label: i18next.t('pages.elemImage'),
      icon: 'bi-image',
      html: '<img data-ws-block="image" src="https://placehold.co/600x300" alt="" style="max-width:100%;display:block"/>',
    },
    {
      id: 'ws-divider',
      label: i18next.t('pages.elemDivider'),
      icon: 'bi-hr',
      html: '<hr data-ws-block="divider"/>',
    },
    {
      id: 'ws-spacer',
      label: i18next.t('pages.elemSpacer'),
      icon: 'bi-arrows-expand-vertical',
      html: '<div data-ws-block="spacer" style="height:24px"></div>',
    },
    {
      id: 'ws-html',
      label: i18next.t('pages.elemHtml'),
      icon: 'bi-code-slash',
      html: `<div data-ws-block="html"><p>${i18next.t('editor.htmlPlaceholder')}</p></div>`,
    },
  ];

  elements.forEach((e) => {
    bm.add(e.id, { label: e.label, category: i18next.t('editor.categoryContent'), media: `<i class="bi ${e.icon}"></i>`, content: e.html });
  });

  // Un bloque por plugin instalado (se serializa como su `id`).
  plugins.forEach((p) => {
    bm.add(`ws-plugin-${p.id}`, {
      label: p.name,
      category: i18next.t('editor.categoryPlugins'),
      media: '<i class="bi bi-puzzle"></i>',
      content: `<div data-ws-block="plugin" data-ws-plugin="${esc(p.id)}" style="padding:8px 12px;border:1px dashed #94a3b8;border-radius:6px">${esc(p.name)}</div>`,
    });
  });
}

function serializeItem(component: Component): PageItem | null {
  const attrs = component.getAttributes() as Record<string, string | undefined>;
  const block = attrs['data-ws-block'];
  if (!block) return null;

  if (block === 'plugin') {
    const id = attrs['data-ws-plugin'];
    return id ? id : null;
  }

  const el = component.getEl();

  switch (block) {
    case 'heading': {
      const tag = el?.tagName ?? 'H2';
      return { type: 'heading', content: el?.textContent ?? '', level: levelFromTag(tag) };
    }
    case 'text':
      return { type: 'text', content: el?.textContent ?? '' };
    case 'image':
      return { type: 'image', content: el?.getAttribute('src') ?? '' };
    case 'divider':
      return { type: 'divider' };
    case 'spacer': {
      const height = el?.style?.height ?? '';
      return { type: 'spacer', content: height.replace('px', '') || '24' };
    }
    case 'html':
      return { type: 'html', content: el?.innerHTML ?? '' };
    default:
      return null;
  }
}

function serializeEditor(editor: Editor): PageSection[] {
  const sections: PageSection[] = [];
  const root = editor.getComponents();

  root.each((child: Component) => {
    const attrs = child.getAttributes() as Record<string, string | undefined>;
    if (attrs['data-ws-section'] === '1') {
      const size = (attrs['data-ws-size'] as Size) ?? 'full';
      const blocks: PageItem[] = [];
      child.components().each((block: Component) => {
        const item = serializeItem(block);
        if (item !== null) blocks.push(item);
      });
      sections.push({ size, blocks });
    } else if (attrs['data-ws-block']) {
      const item = serializeItem(child);
      if (item !== null) sections.push({ size: 'full', blocks: [item] });
    }
  });

  return sections;
}

export const GrapesEditor = forwardRef<GrapesEditorHandle, GrapesEditorProps>(function GrapesEditor(
  { plugins, onChange, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pluginsRef = useRef<GrapesPluginBlock[]>(plugins);

  useImperativeHandle(ref, () => ({
    load: (sections) => {
      const editor = editorRef.current;
      if (editor) editor.setComponents(sectionsToHtml(sections));
    },
    serialize: () => {
      const editor = editorRef.current;
      return editor ? serializeEditor(editor) : [];
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editor = grapesjs.init({
      container,
      fromElement: false,
      storageManager: false,
      height: '100%',
      width: 'auto',
    });
    editorRef.current = editor;

    addBlocks(editor, pluginsRef.current);

    editor.on('update', () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onChange?.(serializeEditor(editor));
      }, 400);
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      editor.destroy();
      editorRef.current = null;
    };
    // Se inicializa una sola vez; `onChange` se mantiene estable vía ref.
  }, []);

  // Actualiza los bloques de plugin cuando cambia el catálogo instalado.
  useEffect(() => {
    pluginsRef.current = plugins;
    const editor = editorRef.current;
    if (!editor) return;
    (['full', 'half', 'third'] as const).forEach((size) => editor.BlockManager.remove(`ws-section-${size}`));
    ['ws-heading-h1', 'ws-heading-h2', 'ws-text', 'ws-image', 'ws-divider', 'ws-spacer', 'ws-html'].forEach((id) =>
      editor.BlockManager.remove(id),
    );
    plugins.forEach((p) => editor.BlockManager.remove(`ws-plugin-${p.id}`));
    addBlocks(editor, plugins);
  }, [plugins]);

  return <div ref={containerRef} className={className} style={{ height: '100%', minHeight: 480 }} />;
});
