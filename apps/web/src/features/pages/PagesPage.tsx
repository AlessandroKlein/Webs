import { useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import {
  ELEMENT_TYPES,
  createElement,
  itemLabel,
  isPageElement,
  type Page,
  type PageElement,
  type PageElementType,
  type PageItem,
  type Size,
} from './pageTypes';
import { ElementView } from './PageRenderer';

interface CatalogBlock {
  id: string;
  name: string;
  displayName?: Record<string, string>;
}

interface InstalledBlock {
  blockId: string;
  name: string;
}

type Section = { blocks: PageItem[]; size: Size };

const SIZE_WIDTH: Record<Size, string> = {
  full: '100%',
  half: 'calc(50% - 4px)',
  third: 'calc(33.333% - 5.5px)',
};

const SIZE_LABEL: Record<Size, string> = {
  full: 'Completo',
  half: 'Mitad',
  third: 'Tercio',
};

/** Editor inline de un elemento de contenido (título, texto, …). */
function ElementEditor({
  element,
  onChange,
  onClose,
}: {
  element: PageElement;
  onChange: (patch: Partial<PageElement>) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="stack"
      style={{
        gap: 'var(--ws-space-2)',
        padding: 'var(--ws-space-3)',
        border: '1px dashed var(--ws-border)',
        borderRadius: 'var(--ws-radius-sm)',
        background: 'var(--ws-surface-2)',
        marginTop: 'var(--ws-space-2)',
      }}
    >
      {element.type === 'heading' && (
        <label className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
          Nivel
          <select
            className="input"
            style={{ width: 'auto' }}
            value={String(element.level ?? 2)}
            onChange={(e) => onChange({ level: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((l) => (
              <option key={l} value={l}>H{l}</option>
            ))}
          </select>
        </label>
      )}
      {element.type === 'text' || element.type === 'html' ? (
        <textarea
          className="input"
          rows={element.type === 'html' ? 4 : 2}
          value={element.content ?? ''}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder={element.type === 'html' ? '<div>HTML…</div>' : 'Texto…'}
        />
      ) : element.type !== 'divider' ? (
        <TextField
          label={element.type === 'spacer' ? 'Alto (px)' : element.type === 'image' ? 'URL de la imagen' : 'Contenido'}
          value={element.content ?? ''}
          onChange={(e) => onChange({ content: e.target.value })}
        />
      ) : (
        <p className="muted" style={{ margin: 0 }}>El separador no tiene contenido editable.</p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose}>Listo</Button>
      </div>
    </div>
  );
}

export function PagesPage() {
  const qc = useQueryClient();
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pages'] }),
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
  const [sections, setSections] = useState<Section[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<'editor' | 'list'>('editor');

  // Estado para drag & drop nativo.
  const [dragSection, setDragSection] = useState<number | null>(null);
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);
  const [dragItem, setDragItem] = useState<{ section: number; index: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ section: number; index: number } | null>(null);

  // Elemento que se está editando inline (índice de sección + índice de item).
  const [editingItem, setEditingItem] = useState<{ section: number; index: number } | null>(null);

  const resetForm = () => {
    setSlug(''); setTitle(''); setRedirectUrl(''); setSections([]); setIsHome(false); setEditingId(null);
    setEditingItem(null);
  };
  const editPage = (p: Page) => {
    setEditingId(p.id);
    setSlug(p.slug);
    setTitle(p.title);
    setRedirectUrl(p.redirectUrl ?? '');
    setIsHome(p.isHome);
    setEditingItem(null);
    setSections(
      (p.layout ?? []).map((s) => ({
        blocks: (s.blocks ?? []) as PageItem[],
        size: (s.size as Size) ?? 'full',
      })),
    );
  };

  const installedBlocks = (pluginsData?.installed ?? []).map((b) => b.blockId);

  const addSection = () => setSections((s) => [...s, { blocks: [], size: 'full' }]);
  const removeSection = (i: number) => {
    setSections((s) => s.filter((_, idx) => idx !== i));
    setEditingItem(null);
  };
  const setSize = (i: number, size: Size) => setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, size } : sec)));

  const addBlock = (i: number, blockId: string) =>
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: [...sec.blocks, blockId] } : sec)));

  const addElement = (i: number, type: PageElementType) =>
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: [...sec.blocks, createElement(type)] } : sec)));

  const updateElement = (i: number, index: number, patch: Partial<PageElement>) =>
    setSections((s) =>
      s.map((sec, idx) => {
        if (idx !== i) return sec;
        const blocks = sec.blocks.map((item, bi) => {
          if (bi !== index || !isPageElement(item)) return item;
          return { ...item, ...patch };
        });
        return { ...sec, blocks };
      }),
    );

  const removeItem = (i: number, index: number) => {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, blocks: sec.blocks.filter((_, bi) => bi !== index) } : sec)));
    setEditingItem(null);
  };

  const moveSection = (from: number, to: number) =>
    setSections((s) => {
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
    setSections((s) => {
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
    setEditingItem(null);
    setDragItem(null);
    setDragOverItem(null);
  };

  if (isLoading) return <Spinner />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = { slug, title, layout: sections, redirectUrl: redirectUrl || null, isHome };
    if (editingId) {
      update.mutate({ id: editingId, body });
    } else {
      create.mutate(body);
      resetForm();
    }
  };

  const homePage = (data ?? []).find((p) => p.isHome);

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Páginas</h1>
        <button className={`nav-link ${view === 'editor' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('editor')}>Editor</button>
        <button className={`nav-link ${view === 'list' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('list')}>Páginas existentes</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
      {view === 'editor' && (
      <Card>
        <h3>{editingId ? `Editar página` : 'Nueva página'}</h3>
        <form className="row" onSubmit={onSubmit} style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <TextField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="contacto" required />
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField label="Redirección (URL externa)" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://…" />
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={isHome} onChange={(e) => setIsHome(e.target.checked)} /> Es la página de inicio
          </label>
          <Button type="submit" disabled={create.isPending || update.isPending}>{editingId ? 'Guardar' : 'Crear'}</Button>
          {editingId && <Button variant="ghost" onClick={resetForm}>Cancelar</Button>}
          {saved && <span style={{ color: 'var(--ws-success)' }}>Guardado ✓</span>}
        </form>

        <hr style={{ border: 'none', borderTop: '1px solid var(--ws-border)', margin: 'var(--ws-space-4) 0' }} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Secciones (bloques + elementos + tamaño)</h3>
          <Button variant="secondary" onClick={addSection}>+ Agregar sección</Button>
        </div>
        <p className="muted" style={{ margin: 'var(--ws-space-1) 0 var(--ws-space-3)' }}>
          Arrastrá el icono ⠿ para reordenar secciones o elementos. Usá ↑/↓ para mover un elemento, o el selector «Mover a» para cambiarlo de sección.
        </p>

        <div className="stack" style={{ marginTop: 'var(--ws-space-3)' }}>
          {sections.map((sec, i) => (
            <div
              key={i}
              onDragOver={(e: DragEvent) => {
                if (dragSection === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragSection !== i) setDragOverSection(i);
              }}
              onDrop={(e: DragEvent) => {
                if (dragSection === null) return;
                e.preventDefault();
                if (dragSection !== i) moveSection(dragSection, i);
                setDragSection(null);
                setDragOverSection(null);
              }}
              style={{
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-md)',
                padding: 'var(--ws-space-3)',
                background: dragOverSection === i ? 'var(--ws-primary-soft)' : undefined,
              }}
            >
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--ws-space-2)', gap: 'var(--ws-space-2)' }}>
                <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                  <span
                    draggable
                    onDragStart={(e: DragEvent) => {
                      e.dataTransfer.setData('text/plain', String(i));
                      e.dataTransfer.effectAllowed = 'move';
                      setDragSection(i);
                    }}
                    onDragEnd={() => { setDragSection(null); setDragOverSection(null); }}
                    title="Arrastrar para reordenar la sección"
                    style={{ cursor: 'grab', fontSize: '1.2rem', color: 'var(--ws-muted)', lineHeight: 1, display: 'inline-flex' }}
                  >
                    <i className="bi bi-grip-vertical" />
                  </span>
                  <strong>Sección {i + 1}</strong>
                  <Button variant="ghost" onClick={() => moveSection(i, i - 1)} disabled={i === 0} title="Subir sección" style={{ padding: '2px 6px', lineHeight: 1 }}>↑</Button>
                  <Button variant="ghost" onClick={() => moveSection(i, i + 1)} disabled={i === sections.length - 1} title="Bajar sección" style={{ padding: '2px 6px', lineHeight: 1 }}>↓</Button>
                </div>
                <Button variant="ghost" onClick={() => removeSection(i)} title="Eliminar sección">✕</Button>
              </div>
              <div className="row" style={{ marginBottom: 'var(--ws-space-2)', flexWrap: 'wrap', gap: 'var(--ws-space-1)' }}>
                {(['full', 'half', 'third'] as Size[]).map((size) => (
                  <Button key={size} variant={sec.size === size ? 'secondary' : 'ghost'} onClick={() => setSize(i, size)}>
                    {SIZE_LABEL[size]}
                  </Button>
                ))}
              </div>

              <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
                {sec.blocks.map((item, bi) => (
                  <div
                    key={bi}
                    className="stack"
                    draggable
                    onDragStart={(e: DragEvent) => {
                      e.dataTransfer.setData('text/plain', 'item');
                      e.dataTransfer.effectAllowed = 'move';
                      setDragItem({ section: i, index: bi });
                    }}
                    onDragEnd={() => { setDragItem(null); setDragOverItem(null); }}
                    onDragOver={(e: DragEvent) => {
                      if (dragItem === null) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverItem({ section: i, index: bi });
                    }}
                    onDrop={(e: DragEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      moveItem(dragItem, { section: i, index: bi });
                    }}
                    title="Arrastrar para reordenar o mover de sección"
                    style={{
                      border: '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-sm)',
                      padding: 'var(--ws-space-2)',
                      background: 'var(--ws-surface)',
                      cursor: 'grab',
                      outline: dragOverItem && dragOverItem.section === i && dragOverItem.index === bi ? '1px dashed var(--ws-primary)' : undefined,
                    }}
                  >
                    <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-1)', flexWrap: 'wrap' }}>
                      <i className="bi bi-grip-vertical" style={{ color: 'var(--ws-muted)' }} />
                      <span className="badge" style={{ cursor: 'grab' }}>
                        {isPageElement(item) ? 'Elemento' : 'Plugin'}
                      </span>
                      <span style={{ flex: 1, minWidth: 120 }}>{itemLabel(item, blockLabel)}</span>
                      <Button variant="ghost" onClick={() => moveItem({ section: i, index: bi }, { section: i, index: bi - 1 })} disabled={bi === 0} title="Subir elemento" style={{ padding: '2px 6px', lineHeight: 1 }}>↑</Button>
                      <Button variant="ghost" onClick={() => moveItem({ section: i, index: bi }, { section: i, index: bi + 1 })} disabled={bi === sec.blocks.length - 1} title="Bajar elemento" style={{ padding: '2px 6px', lineHeight: 1 }}>↓</Button>
                      {isPageElement(item) && (
                        <Button variant="ghost" onClick={() => setEditingItem(editingItem?.section === i && editingItem.index === bi ? null : { section: i, index: bi })} title="Editar elemento" style={{ padding: '2px 6px', lineHeight: 1 }}>✎</Button>
                      )}
                      <select
                        className="input"
                        style={{ width: 'auto', padding: '2px 6px' }}
                        value=""
                        onChange={(e) => {
                          if (e.target.value !== '') moveItem({ section: i, index: bi }, { section: Number(e.target.value), index: 9999 });
                          e.target.value = '';
                        }}
                        title="Mover a otra sección"
                      >
                        <option value="">Mover a…</option>
                        {sections.map((_, si) => (
                          <option key={si} value={si}>Sección {si + 1}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-danger)', padding: 0, lineHeight: 1 }}
                        onClick={() => removeItem(i, bi)}
                        title="Quitar elemento"
                      >✕</button>
                    </div>
                    {editingItem?.section === i && editingItem.index === bi && isPageElement(item) && (
                      <ElementEditor
                        element={item}
                        onChange={(patch) => updateElement(i, bi, patch)}
                        onClose={() => setEditingItem(null)}
                      />
                    )}
                  </div>
                ))}

                {sec.blocks.length === 0 && (
                  <p className="muted" style={{ margin: 0 }}>Sin elementos en esta sección.</p>
                )}

                <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-1)' }}>
                  <select
                    className="input"
                    style={{ width: 'auto' }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addBlock(i, e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">+ Agregar plugin…</option>
                    {installedBlocks.map((b) => (
                      <option key={b} value={b}>{blockLabel(b)}</option>
                    ))}
                  </select>
                  <select
                    className="input"
                    style={{ width: 'auto' }}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addElement(i, e.target.value as PageElementType);
                      e.target.value = '';
                    }}
                  >
                    <option value="">+ Agregar elemento…</option>
                    {ELEMENT_TYPES.map((el) => (
                      <option key={el.type} value={el.type}>{el.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
          {sections.length === 0 && <p className="muted">Sin secciones. Agregá una o dejá la redirección para una página externa.</p>}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--ws-border)', margin: 'var(--ws-space-4) 0' }} />
        <h3 style={{ margin: '0 0 var(--ws-space-2)' }}>Vista previa</h3>
        <div style={{ border: '1px dashed var(--ws-border)', borderRadius: 'var(--ws-radius-md)', padding: 'var(--ws-space-4)', background: 'var(--ws-surface-2)' }}>
          {sections.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>La página está vacía. Agregá secciones para ver la vista previa.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
              {sections.map((sec, i) => (
                <div
                  key={i}
                  style={{
                    width: SIZE_WIDTH[sec.size],
                    boxSizing: 'border-box',
                    border: '1px solid var(--ws-border)',
                    borderRadius: 'var(--ws-radius-sm)',
                    padding: 'var(--ws-space-2)',
                    background: 'var(--ws-surface)',
                  }}
                >
                  <div className="muted" style={{ fontSize: '0.75rem', marginBottom: 4 }}>
                    Sección {i + 1} · {SIZE_LABEL[sec.size]}
                  </div>
                  {sec.blocks.length === 0 ? (
                    <span className="muted" style={{ fontSize: '0.8rem' }}>Sin elementos</span>
                  ) : (
                    sec.blocks.map((item, bi) =>
                      isPageElement(item) ? (
                        <div key={bi} style={{ marginBottom: 4 }}>
                          <ElementView element={item} />
                        </div>
                      ) : (
                        <span key={bi} className="badge" style={{ marginRight: 4 }}>{blockLabel(item)}</span>
                      ),
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      )}

      {view === 'list' && (
      <Card>
        <h3>Páginas existentes</h3>
        <div style={{ marginBottom: 'var(--ws-space-3)' }}>
          {homePage ? (
            <Button onClick={() => { editPage(homePage); setView('editor'); }} style={{ gap: 'var(--ws-space-1)' }}>
              <i className="bi bi-house" /> Editar página de inicio
            </Button>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No hay una página de inicio configurada.</p>
          )}
        </div>
        <div className="stack">
          {(data ?? []).map((p) => (
            <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>{p.title}</strong> <span className="muted">/{p.slug}</span>
                {p.isHome && <span className="badge" style={{ marginLeft: 6 }}>inicio</span>}
                {p.redirectUrl && <span className="badge" style={{ marginLeft: 6 }}>redirige</span>}
              </span>
              <div className="row">
                <Button variant="secondary" onClick={() => { editPage(p); setView('editor'); }}>Editar</Button>
                <Button variant="ghost" onClick={() => remove.mutate(p.id)}>Eliminar</Button>
              </div>
            </div>
          ))}
          {(data ?? []).length === 0 && <p className="muted">No hay páginas.</p>}
        </div>
      </Card>
      )}
      </div>
    </div>
  );
}
