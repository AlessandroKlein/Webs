import { PluginById } from '../../plugins/PluginSlot';
import {
  isPageElement,
  type PageElement,
  type PageItem,
  type PageSection,
} from './pageTypes';

/** Mapea un ancho de sección a la clase de grilla del tema. */
export const sizeClass = (size?: string) =>
  size === 'half' ? 'grid-2' : size === 'third' ? 'grid-3' : '';

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4'] as const;

/** Renderiza un elemento de contenido (título, texto, imagen, …). */
export function ElementView({ element }: { element: PageElement }) {
  const content = element.content ?? '';

  switch (element.type) {
    case 'heading': {
      const idx = Math.min(Math.max((element.level ?? 2) - 1, 0), HEADING_TAGS.length - 1);
      const Tag = HEADING_TAGS[idx] ?? 'h2';
      return <Tag style={{ marginTop: 0 }}>{content}</Tag>;
    }
    case 'text':
      return (
        <p style={{ whiteSpace: 'pre-wrap', margin: 'var(--ws-space-2) 0' }}>{content}</p>
      );
    case 'image':
      return content ? (
        <img
          src={content}
          alt=""
          style={{ maxWidth: '100%', height: 'auto', borderRadius: 'var(--ws-radius-md)', display: 'block' }}
        />
      ) : null;
    case 'divider':
      return (
        <hr style={{ border: 'none', borderTop: '1px solid var(--ws-border)', margin: 'var(--ws-space-4) 0' }} />
      );
    case 'spacer':
      return <div style={{ height: content || '24px' }} aria-hidden="true" />;
    case 'html':
      return <div dangerouslySetInnerHTML={{ __html: content }} />;
    default:
      return null;
  }
}

/** Renderiza un item: plugin (por id) o elemento de contenido. */
export function PageItemView({ item }: { item: PageItem }) {
  if (isPageElement(item)) return <ElementView element={item} />;
  return <PluginById blockId={item} />;
}

/** Renderiza una sección (aplica la clase de ancho y recorre sus items). */
export function PageSectionView({ section }: { section: PageSection }) {
  return (
    <div className={sizeClass(section.size)} style={{ marginBottom: 'var(--ws-space-4)' }}>
      {(section.blocks ?? []).map((item, i) => (
        <PageItemView
          key={typeof item === 'string' ? `${item}-${i}` : `${item.type}-${i}`}
          item={item}
        />
      ))}
    </div>
  );
}

/** Renderiza el layout completo de una página (lista de secciones). */
export function PageLayoutView({ sections }: { sections: PageSection[] }) {
  return (
    <>
      {sections.map((section, i) => (
        <PageSectionView key={i} section={section} />
      ))}
    </>
  );
}
