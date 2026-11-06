import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import { PageHeader } from '../../components/ui/PageHeader';
import { Alert } from '../../components/ui/Alert';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { useAuthStore } from '../../lib/auth-store';
import {
  createElement,
  isPageElement,
  uid,
  type BlockSelection,
  type Page,
  type PageElement,
  type PageElementType,
  type PageSection,
  type Size,
} from './pageTypes';
import { useBlockHistory } from './useBlockHistory';
import { BlockInserter } from './BlockInserter';
import { BlockInspector } from './BlockInspector';
import { BlockCanvas, type DeviceViewport } from './BlockCanvas';

interface CatalogBlock {
  id: string;
  name: string;
  displayName?: Record<string, string>;
}

interface InstalledBlock {
  pluginId: string;
  name: string;
}

/** Asegura `id` en cada sección y elemento (en memoria; no migra registros). */
function withIds(layout: PageSection[]): PageSection[] {
  return layout.map((s) => ({
    ...s,
    id: s.id ?? uid(),
    size: (s.size ?? 'full') as Size,
    blocks: (s.blocks ?? []).map((b) => (isPageElement(b) ? { ...b, id: b.id ?? uid() } : b)),
  }));
}

export function PagesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useAuthStore((s) => s.hasPermission)('content.write');
  const { data, isLoading } = useQuery({
    queryKey: ['pages'],
    queryFn: () => api.get<Page[]>('/api/v1/pages'),
  });
  const { data: pluginsData } = useQuery({
    queryKey: ['plugins'],
    queryFn: () =>
      api.get<{ installed: InstalledBlock[]; catalog: CatalogBlock[] }>('/api/v1/plugins'),
  });

  // Mapa id → nombre legible (displayName.es || name).
  const blockNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of pluginsData?.catalog ?? []) {
      m.set(b.id, b.displayName?.es ?? b.name);
    }
    return m;
  }, [pluginsData]);
  const blockLabel = (id: string) => blockNames.get(id) ?? id;

  const create = useMutation({
    mutationFn: (body: { slug: string; title: string; layout?: unknown; redirectUrl?: string | null; isHome?: boolean }) =>
      api.post('/api/v1/pages', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pages'] });
      resetForm();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/pages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }),
  });
  const update = useMutation({
    mutationFn: (vars: { id: string; body: { slug?: string; title?: string; layout?: unknown; redirectUrl?: string | null; isHome?: boolean } }) =>
      api.patch(`/api/v1/pages/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pages'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [redirectUrl, setRedirectUrl] = useState('');
  const [isHome, setIsHome] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<'editor' | 'list'>('editor');

  const { present: sections, push, undo, redo, reset: resetHistory, canUndo, canRedo } =
    useBlockHistory<PageSection[]>([]);

  const [selected, setSelected] = useState<BlockSelection | null>(null);
  const [device, setDevice] = useState<DeviceViewport>('desktop');
  const [preview, setPreview] = useState(false);
  const [inserterOpen, setInserterOpen] = useState(true);

  const resetForm = () => {
    setSlug(''); setTitle(''); setRedirectUrl(''); setIsHome(false); setEditingId(null);
    setSelected(null);
    resetHistory([]);
  };
  const editPage = (p: Page) => {
    setEditingId(p.id);
    setSlug(p.slug);
    setTitle(p.title);
    setRedirectUrl(p.redirectUrl ?? '');
    setIsHome(p.isHome);
    setSelected(null);
    resetHistory(withIds(p.layout ?? []));
  };

  const addSection = () => push((s) => [...s, { id: uid(), blocks: [], size: 'full' as Size }]);
  const removeSection = (i: number) => {
    push((s) => s.filter((_, idx) => idx !== i));
    setSelected(null);
  };
  const updateSection = (i: number, patch: Partial<PageSection>) =>
    push((s) => s.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));

  const addBlock = (i: number, pluginId: string) =>
    push((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: [...sec.blocks, pluginId] } : sec)));

  const addElement = (i: number, type: PageElementType) =>
    push((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: [...sec.blocks, createElement(type)] } : sec)));

  const updateElement = (i: number, index: number, patch: Partial<PageElement>) =>
    push((s) =>
      s.map((sec, idx) => {
        if (idx !== i) return sec;
        const blocks = sec.blocks.map((item, bi) => {
          if (bi !== index || !isPageElement(item)) return item;
          return { ...item, ...patch };
        });
        return { ...sec, blocks };
      }),
    );

  const removeItem = (i: number, index: number) =>
    push((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: sec.blocks.filter((_, bi) => bi !== index) } : sec)));

  const duplicateItem = (i: number, index: number) =>
    push((s) =>
      s.map((sec, idx) => {
        if (idx !== i) return sec;
        const item = sec.blocks[index];
        if (item === undefined) return sec;
        const copy = isPageElement(item) ? { ...item, id: uid() } : item;
        const blocks = [...sec.blocks.slice(0, index + 1), copy, ...sec.blocks.slice(index + 1)];
        return { ...sec, blocks };
      }),
    );

  const moveSection = (from: number, to: number) =>
    push((s) => {
      if (from < 0 || to < 0 || from >= s.length || to >= s.length) return s;
      const next = [...s];
      const [moved] = next.splice(from, 1);
      if (moved === undefined) return s;
      next.splice(to, 0, moved);
      return next;
    });

  /** Mueve un item entre secciones (y dentro de la misma). */
  const moveItem = (from: { section: number; index: number } | null, to: { section: number; index: number }) => {
    if (!from) return;
    push((s) => {
      if (from.section < 0 || from.section >= s.length || to.section < 0 || to.section >= s.length) return s;
      const next = s.map((sec) => ({ ...sec, blocks: [...sec.blocks] }));
      const src = next[from.section];
      const dst = next[to.section];
      if (!src || !dst) return s;
      if (from.index < 0 || from.index >= src.blocks.length) return s;
      const [moved] = src.blocks.splice(from.index, 1);
      if (moved === undefined) return s;
      dst.blocks.splice(Math.min(to.index, dst.blocks.length), 0, moved);
      return next;
    });
  };

  const activeSection = () => (selected ? selected.section : Math.max(0, sections.length - 1));

  const insertElement = (type: PageElementType) => {
    if (sections.length === 0) {
      push(() => [{ id: uid(), blocks: [createElement(type)], size: 'full' as Size }]);
      setSelected({ section: 0, index: 0 });
      return;
    }
    const i = activeSection();
    addElement(i, type);
    setSelected({ section: i, index: sections[i]?.blocks.length ?? 0 });
  };

  const insertPlugin = (pluginId: string) => {
    if (sections.length === 0) {
      push(() => [{ id: uid(), blocks: [pluginId], size: 'full' as Size }]);
      setSelected({ section: 0, index: 0 });
      return;
    }
    const i = activeSection();
    addBlock(i, pluginId);
    setSelected({ section: i, index: sections[i]?.blocks.length ?? 0 });
  };

  const doSave = () => {
    if (!slug.trim()) return;
    const body = { slug, title, layout: sections, redirectUrl: redirectUrl || null, isHome };
    if (editingId) {
      update.mutate({ id: editingId, body });
    } else {
      create.mutate(body);
    }
  };

  // Atajos: "/" abre el inserter, Esc deselecciona, Ctrl/Cmd+S guarda, Supr borra la selección.
  const doSaveRef = useRef<() => void>(() => {});
  const deleteSelRef = useRef<() => void>(() => {});
  useEffect(() => {
    doSaveRef.current = doSave;
    deleteSelRef.current = () => {
      if (!selected) return;
      if (selected.index === null) removeSection(selected.section);
      else removeItem(selected.section, selected.index);
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!(
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      );
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setInserterOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        setSelected(null);
        setInserterOpen(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSaveRef.current();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        e.preventDefault();
        deleteSelRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  if (isLoading) return <Spinner />;

  const homePage = (data ?? []).find((p) => p.isHome);
  const activeView = canWrite ? view : 'list';
  const pending = create.isPending || update.isPending;

  return (
    <div className="stack">
      <PageHeader
        title={t('pages.title')}
        actions={homePage ? (
          <Button variant="secondary" onClick={() => window.open('/', '_blank', 'noopener,noreferrer')}>
            <i className="bi bi-box-arrow-up-right" /> {t('common.viewSite')}
          </Button>
        ) : undefined}
      >
        <SegmentedControl
          options={[
            ...(canWrite ? [{ value: 'editor', label: t('pages.editor') }] : []),
            { value: 'list', label: t('pages.existing') },
          ]}
          value={activeView}
          onChange={(v) => setView(v as 'editor' | 'list')}
          ariaLabel={t('pages.title')}
        />
      </PageHeader>

      {activeView === 'editor' && (
        <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
          {(create.isError || update.isError) && <Alert variant="danger">{t('common.error')}</Alert>}
          {/* Barra superior */}
          <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
            <Button variant="ghost" size="sm" onClick={() => setView('list')} title={t('pages.back')} aria-label={t('pages.back')}>
              <i className="bi bi-arrow-left" />
            </Button>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('pages.newPage')}
              aria-label={t('common.title')}
              style={{ flex: 1, minWidth: 180, fontSize: 'var(--ws-font-size-lg)', fontWeight: 600 }}
            />
            <span className="badge">
              {pending ? t('common.saving') : saved ? t('common.saved') : t('pages.noChanges')}
            </span>
            <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title={t('pages.undo')} aria-label={t('pages.undo')}>
              <i className="bi bi-arrow-counterclockwise" />
            </Button>
            <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title={t('pages.redo')} aria-label={t('pages.redo')}>
              <i className="bi bi-arrow-clockwise" />
            </Button>
            <SegmentedControl
              ariaLabel={t('pages.device')}
              value={device}
              onChange={(v) => setDevice(v as DeviceViewport)}
              options={[
                { value: 'desktop', label: t('pages.desktop'), icon: 'bi-display' },
                { value: 'tablet', label: t('pages.tablet'), icon: 'bi-tablet' },
                { value: 'mobile', label: t('pages.mobile'), icon: 'bi-phone' },
              ]}
            />
            <Button variant={preview ? 'primary' : 'secondary'} size="sm" onClick={() => setPreview((p) => !p)}>
              <i className="bi bi-eye" /> {t('pages.preview')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setInserterOpen((o) => !o)} title={t('pages.insertBlock')} aria-label={t('pages.insertBlock')}>
              <i className="bi bi-plus-square" />
            </Button>
            <Button onClick={doSave} disabled={pending}>
              <i className="bi bi-cloud-arrow-up" /> {t('pages.publish')}
            </Button>
          </div>

          {/* Ajustes de página */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)', alignItems: 'flex-end' }}>
            <TextField label={t('pages.slug')} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="contacto" required />
            <TextField label={t('pages.redirect')} value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://…" />
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={isHome} onChange={(e) => setIsHome(e.target.checked)} /> {t('pages.isHome')}
            </label>
          </div>

          {/* Inserter | lienzo | inspector */}
          <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-3)' }}>
            {inserterOpen && (
              <BlockInserter
                plugins={pluginsData?.installed ?? []}
                onInsertElement={insertElement}
                onInsertPlugin={insertPlugin}
              />
            )}
            <div className="stack" style={{ flex: 1, minWidth: 0 }}>
              <BlockCanvas
                sections={sections}
                selected={selected}
                device={device}
                preview={preview}
                blockLabel={blockLabel}
                onSelect={setSelected}
                onUpdateElement={updateElement}
                onAddSection={addSection}
                onRemoveSection={removeSection}
                onRemoveItem={removeItem}
                onDuplicate={duplicateItem}
                onMoveItem={moveItem}
                onMoveSection={moveSection}
              />
            </div>
            <BlockInspector
              selected={selected}
              sections={sections}
              onUpdateSection={updateSection}
              onUpdateElement={updateElement}
              onRemoveSection={removeSection}
              onRemoveItem={removeItem}
              onDuplicate={duplicateItem}
            />
          </div>
        </div>
      )}

      {activeView === 'list' && (
        <Card>
          <h3>{t('pages.existing')}</h3>
          <div style={{ marginBottom: 'var(--ws-space-3)' }}>
            {homePage ? (
              canWrite ? (
                <Button onClick={() => { editPage(homePage); setView('editor'); }} style={{ gap: 'var(--ws-space-1)' }}>
                  <i className="bi bi-house" /> {t('pages.editHome')}
                </Button>
              ) : null
            ) : (
              <p className="muted" style={{ margin: 0 }}>{t('pages.noHome')}</p>
            )}
          </div>
          <div className="stack">
            {(data ?? []).map((p) => (
              <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  <strong>{p.title}</strong> <span className="muted">/{p.slug}</span>
                  {p.isHome && <span className="badge" style={{ marginLeft: 6 }}>{t('pages.homeBadge')}</span>}
                  {p.redirectUrl && <span className="badge" style={{ marginLeft: 6 }}>{t('pages.redirectBadge')}</span>}
                </span>
                {canWrite && (
                  <div className="row">
                    <Button variant="secondary" onClick={() => { editPage(p); setView('editor'); }}>{t('common.edit')}</Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(t('common.confirmDelete'))) remove.mutate(p.id);
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {(data ?? []).length === 0 && <p className="muted">{t('pages.noPages')}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
