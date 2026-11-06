import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import {
  isPageElement,
  type BlockSelection,
  type PageElement,
  type PageSection,
  type Size,
} from './pageTypes';

export interface BlockInspectorProps {
  selected: BlockSelection | null;
  sections: PageSection[];
  onUpdateSection: (index: number, patch: Partial<PageSection>) => void;
  onUpdateElement: (section: number, index: number, patch: Partial<PageElement>) => void;
  onRemoveSection: (index: number) => void;
  onRemoveItem: (section: number, index: number) => void;
  onDuplicate: (section: number, index: number) => void;
}

const SIZES: Size[] = ['full', 'half', 'third'];

/** Panel derecho: ajustes del bloque o de la sección seleccionada. */
export function BlockInspector(props: BlockInspectorProps) {
  const { t } = useTranslation();
  const { selected, sections } = props;

  const frame = (title: string, children: ReactNode) => (
    <aside
      className="stack"
      style={{ gap: 'var(--ws-space-3)', minWidth: 220, maxWidth: 280 }}
      aria-label={title}
    >
      <h3 style={{ margin: 0 }}>{title}</h3>
      {children}
    </aside>
  );

  if (!selected) {
    return frame(t('pages.inspector'), <p className="muted" style={{ margin: 0 }}>{t('pages.selectHint')}</p>);
  }

  const section = sections[selected.section];

  if (selected.index === null) {
    return frame(
      t('pages.sectionSettings'),
      <>
        <SegmentedControl
          ariaLabel={t('pages.sections')}
          value={section?.size ?? 'full'}
          onChange={(v) => props.onUpdateSection(selected.section, { size: v as Size })}
          options={SIZES.map((s) => ({ value: s, label: t(`pages.size${s.charAt(0).toUpperCase()}${s.slice(1)}`) }))}
        />
        <Button variant="destructive" size="sm" onClick={() => props.onRemoveSection(selected.section)}>
          <i className="bi bi-trash" /> {t('pages.deleteSection')}
        </Button>
      </>,
    );
  }

  const blockIndex = selected.index; // number (narrowed tras el guard de arriba)
  const item = section?.blocks[blockIndex];

  if (!isPageElement(item)) {
    return frame(
      t('pages.blockSettings'),
      <>
        <p className="muted" style={{ margin: 0 }}>{t('pages.pluginPlaceholder')}</p>
        <Button variant="ghost" size="sm" onClick={() => props.onDuplicate(selected.section, blockIndex)}>
          <i className="bi bi-copy" /> {t('pages.duplicate')}
        </Button>
        <Button variant="destructive" size="sm" onClick={() => props.onRemoveItem(selected.section, blockIndex)}>
          <i className="bi bi-trash" /> {t('pages.removeItem')}
        </Button>
      </>,
    );
  }

  return frame(
    t('pages.blockSettings'),
    <>
      <BlockFields el={item} onChange={(patch) => props.onUpdateElement(selected.section, blockIndex, patch)} />
      <Button variant="ghost" size="sm" onClick={() => props.onDuplicate(selected.section, blockIndex)}>
        <i className="bi bi-copy" /> {t('pages.duplicate')}
      </Button>
      <Button variant="destructive" size="sm" onClick={() => props.onRemoveItem(selected.section, blockIndex)}>
        <i className="bi bi-trash" /> {t('pages.removeItem')}
      </Button>
    </>,
  );
}

function BlockFields({ el, onChange }: { el: PageElement; onChange: (patch: Partial<PageElement>) => void }) {
  const { t } = useTranslation();
  switch (el.type) {
    case 'heading':
      return (
        <>
          <label className="stack" style={{ gap: 4 }}>
            <span className="form-label">{t('pages.level')}</span>
            <select
              className="input"
              value={String(el.level ?? 2)}
              onChange={(e) => onChange({ level: Number(e.target.value) })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>H{n}</option>
              ))}
            </select>
          </label>
          <textarea
            className="input"
            rows={2}
            value={el.content ?? ''}
            onChange={(e) => onChange({ content: e.target.value })}
            placeholder={t('pages.textPlaceholder')}
          />
        </>
      );
    case 'text':
      return (
        <textarea
          className="input"
          rows={4}
          value={el.content ?? ''}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder={t('pages.textPlaceholder')}
        />
      );
    case 'image':
      return <TextField label={t('pages.imageUrl')} value={el.content ?? ''} onChange={(e) => onChange({ content: e.target.value })} />;
    case 'spacer':
      return <TextField label={t('pages.height')} value={el.content ?? ''} onChange={(e) => onChange({ content: e.target.value })} />;
    case 'html':
      return (
        <textarea
          className="input"
          rows={6}
          value={el.content ?? ''}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder={t('pages.htmlPlaceholder')}
        />
      );
    case 'divider':
      return <p className="muted" style={{ margin: 0 }}>{t('pages.dividerNoContent')}</p>;
  }
}
