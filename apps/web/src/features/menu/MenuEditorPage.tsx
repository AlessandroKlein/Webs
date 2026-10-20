import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface MenuItem {
  label: string;
  path: string;
  order?: number;
}

/**
 * Editor visual del menú público (tabla `menus`, clave `main`).
 * Permite agregar, editar, eliminar y reordenar items (↑ / ↓) y guardarlos
 * contra `PUT /api/v1/menu`.
 */
export function MenuEditorPage() {
  const qc = useQueryClient();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-menu'],
    queryFn: () => api.get<{ items: MenuItem[] }>('/api/v1/menu'),
  });

  // Sincroniza la lista local cuando llega el menú del servidor (orden por `order`).
  useEffect(() => {
    if (data?.items) {
      setItems([...data.items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (next: MenuItem[]) =>
      api.put<{ items: MenuItem[] }>('/api/v1/menu', {
        items: next.map((it, idx) => ({ label: it.label, path: it.path, order: idx })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-menu'] });
      qc.invalidateQueries({ queryKey: ['public-menu'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const addItem = () => setItems((prev) => [...prev, { label: '', path: '/' }]);
  const updateItem = (idx: number, patch: Partial<MenuItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const moveItem = (idx: number, dir: -1 | 1) =>
    setItems((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const item = next[idx];
      if (!item) return prev;
      next.splice(idx, 1);
      next.splice(target, 0, item);
      return next;
    });

  const canSave = items.every((it) => it.label.trim() !== '' && it.path.trim() !== '');

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Menú del sitio</h1>
        <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
          {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>Guardado ✓</span>}
          {save.error && <span style={{ color: 'var(--ws-danger)' }}>{save.error.message}</span>}
          <Button onClick={() => save.mutate(items)} disabled={save.isPending || !canSave}>
            Guardar
          </Button>
        </div>
      </div>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : (
          <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: 'var(--ws-space-2)',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                  padding: 'var(--ws-space-3)',
                  border: '1px solid var(--ws-border)',
                  borderRadius: 'var(--ws-radius-md)',
                }}
              >
                <div className="field" style={{ width: 72 }}>
                  <label>Orden</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={item.order ?? idx}
                    onChange={(e) => updateItem(idx, { order: Number(e.target.value) })}
                  />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>Etiqueta</label>
                  <input
                    className="input"
                    value={item.label}
                    onChange={(e) => updateItem(idx, { label: e.target.value })}
                    placeholder="Inicio"
                  />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 160 }}>
                  <label>Ruta</label>
                  <input
                    className="input"
                    value={item.path}
                    onChange={(e) => updateItem(idx, { path: e.target.value })}
                    placeholder="/"
                  />
                </div>
                <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                  <Button variant="secondary" title="Subir" disabled={idx === 0} onClick={() => moveItem(idx, -1)}>
                    ↑
                  </Button>
                  <Button variant="secondary" title="Bajar" disabled={idx === items.length - 1} onClick={() => moveItem(idx, 1)}>
                    ↓
                  </Button>
                  <Button variant="ghost" title="Eliminar" style={{ color: 'var(--ws-danger)' }} onClick={() => removeItem(idx)}>
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}

            {items.length === 0 && (
              <p className="muted" style={{ margin: 0 }}>
                No hay ítems en el menú. Agregá el primero con el botón de abajo.
              </p>
            )}

            <div className="row" style={{ gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-2)' }}>
              <Button variant="secondary" onClick={addItem}>
                + Agregar ítem
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
