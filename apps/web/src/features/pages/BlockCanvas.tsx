import { useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import {
  isPageElement,
  type BlockSelection,
  type PageElement,
  type PageSection,
  type Size,
} from './pageTypes';
import { ElementView, PageLayoutView } from './PageRenderer';

export type DeviceViewport = 'desktop' | 'tablet' | 'mobile';

export interface BlockCanvasProps {
  sections: PageSection[];
  selected: BlockSelection | null;
  device: DeviceViewport;
  preview: boolean;
  blockLabel: (id: string) => string;
  onSelect: (sel: BlockSelection | null) => void;
  onUpdateElement: (section: number, index: number, patch: Partial<PageElement>) => void;
  onAddSection: () => void;
  onRemoveSection: (index: number) => void;
  onRemoveItem: (section: number, index: number) => void;
  onDuplicate: (section: number, index: number) => void;
  onMoveItem: (from: { section: number; index: number } | null, to: { section: number; index: number }) => void;
  onMoveSection: (from: number, to: number) => void;
}

const DEVICE_WIDTH: Record<DeviceViewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

const SIZE_LABEL: Record<Size, string> = {
  full: 'pages.sizeFull',
  half: 'pages.sizeHalf',
  third: 'pages.sizeThird',
};

/** Lienzo centrado del editor: previsualización o edición por bloques. */
export function BlockCanvas(props: BlockCanvasProps) {
  const { t } = useTranslation();
  const { sections, selected, device, preview, blockLabel } = props;

  const [dragSection, setDragSection] = useState<number | null>(null);
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);
  const [dragItem, setDragItem] = useState<{ section: number; index: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ section: number; index: number } | null>(null);

  return (
    <div
      style={{
        width: DEVICE_WIDTH[device],
        maxWidth: '100%',
        margin: '0 auto',
        minHeight: 300,
        border: '1px solid var(--ws-border)',
        borderRadius: 'var(--ws-radius-md)',
        padding: 'var(--ws-space-4)',
        background: 'var(--ws-surface-2)',
        boxSizing: 'border-box',
      }}
      onClick={() => props.onSelect(null)}
    >
      {preview ? (
        sections.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>{t('pages.emptyPage')}</p>
        ) : (
          <PageLayoutView sections={sections} />
        )
      ) : sections.length === 0 ? (
        <div className="stack" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 'var(--ws-space-3)' }}>
          <p className="muted" style={{ margin: 0 }}>{t('pages.emptyPage')}</p>
          <Button variant="secondary" onClick={props.onAddSection}>{t('pages.addSection')}</Button>
        </div>
      ) : (
        <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
          {sections.map((sec, si) => (
            <div
              key={sec.id ?? si}
              draggable
              onDragStart={(e: DragEvent) => {
                e.dataTransfer.setData('text/plain', String(si));
                e.dataTransfer.effectAllowed = 'move';
                setDragSection(si);
              }}
              onDragEnd={() => { setDragSection(null); setDragOverSection(null); }}
              onDragOver={(e: DragEvent) => {
                if (dragSection === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragSection !== si) setDragOverSection(si);
              }}
              onDrop={(e: DragEvent) => {
                if (dragSection === null) return;
                e.preventDefault();
                if (dragSection !== si) props.onMoveSection(dragSection, si);
                setDragSection(null);
                setDragOverSection(null);
              }}
              style={{
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-md)',
                padding: 'var(--ws-space-3)',
                background: dragOverSection === si ? 'var(--ws-primary-soft)' : 'var(--ws-surface)',
              }}
            >
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--ws-space-2)', cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); props.onSelect({ section: si, index: null }); }}
              >
                <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                  <span title={t('pages.dragSection')} style={{ cursor: 'grab', color: 'var(--ws-muted)', lineHeight: 1, display: 'inline-flex' }}>
                    <i className="bi bi-grip-vertical" />
                  </span>
                  <strong>{t('pages.section', { n: si + 1 })}</strong>
                  <span className="muted" style={{ fontSize: '0.75rem' }}>{t(SIZE_LABEL[sec.size ?? 'full'])}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); props.onRemoveSection(si); }}
                  title={t('pages.deleteSection')}
                >✕</Button>
              </div>

              <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
                {sec.blocks.map((item, bi) => {
                  const isEl = isPageElement(item);
                  const el = isEl ? (item as PageElement) : null;
                  const isSel = selected?.section === si && selected.index === bi;
                  const inlineEditable = isSel && el !== null && (el.type === 'heading' || el.type === 'text');
                  return (
                    <div
                      key={(isEl ? el!.id : item) ?? bi}
                      draggable
                      onDragStart={(e: DragEvent) => {
                        e.dataTransfer.setData('text/plain', 'item');
                        e.dataTransfer.effectAllowed = 'move';
                        setDragItem({ section: si, index: bi });
                      }}
                      onDragEnd={() => { setDragItem(null); setDragOverItem(null); }}
                      onDragOver={(e: DragEvent) => {
                        if (dragItem === null) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverItem({ section: si, index: bi });
                      }}
                      onDrop={(e: DragEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        props.onMoveItem(dragItem, { section: si, index: bi });
                      }}
                      onClick={(e) => { e.stopPropagation(); props.onSelect({ section: si, index: bi }); }}
                      title={t('pages.dragItem')}
                      style={{
                        border: isSel ? '1px solid var(--ws-primary)' : '1px solid var(--ws-border)',
                        borderRadius: 'var(--ws-radius-sm)',
                        padding: 'var(--ws-space-2)',
                        background: isSel ? 'var(--ws-primary-soft)' : 'var(--ws-surface)',
                        cursor: 'pointer',
                        outline: dragOverItem?.section === si && dragOverItem.index === bi ? '1px dashed var(--ws-primary)' : undefined,
                      }}
                    >
                      {isEl ? (
                        inlineEditable ? (
                          <textarea
                            className="input"
                            rows={el!.type === 'text' ? 3 : 1}
                            value={el!.content ?? ''}
                            onChange={(e) => props.onUpdateElement(si, bi, { content: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={t('pages.textPlaceholder')}
                          />
                        ) : (
                          <ElementView element={el!} />
                        )
                      ) : (
                        <div
                          style={{
                            border: '1px dashed var(--ws-border)',
                            borderRadius: 'var(--ws-radius-sm)',
                            padding: 'var(--ws-space-3)',
                            textAlign: 'center',
                            color: 'var(--ws-muted)',
                          }}
                        >
                          <i className="bi bi-puzzle" /> {blockLabel(item)}
                        </div>
                      )}

                      {isSel && (
                        <div className="row" style={{ gap: 'var(--ws-space-1)', marginTop: 'var(--ws-space-2)' }} onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => props.onMoveItem({ section: si, index: bi }, { section: si, index: bi - 1 })} disabled={bi === 0} title={t('pages.moveItemUp')}>↑</Button>
                          <Button variant="ghost" size="sm" onClick={() => props.onMoveItem({ section: si, index: bi }, { section: si, index: bi + 1 })} disabled={bi === sec.blocks.length - 1} title={t('pages.moveItemDown')}>↓</Button>
                          <Button variant="ghost" size="sm" onClick={() => props.onDuplicate(si, bi)} title={t('pages.duplicate')}><i className="bi bi-copy" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => props.onRemoveItem(si, bi)} title={t('pages.removeItem')}><i className="bi bi-trash" /></Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {sec.blocks.length === 0 && <p className="muted" style={{ margin: 0 }}>{t('pages.emptySection')}</p>}
              </div>
            </div>
          ))}
          <Button variant="secondary" onClick={props.onAddSection}>{t('pages.addSection')}</Button>
        </div>
      )}
    </div>
  );
}
