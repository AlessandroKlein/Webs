import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const INV_BASE = '/api/v1/blocks/inventario';
const ORG_BASE = '/api/v1/blocks/organizaciones';

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  minQuantity: number;
  unitPrice: number;
  category: string | null;
  organizationId: string | null;
  productId: string | null;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  active: boolean;
  shareInventory: boolean;
  logoUrl: string | null;
  memberCount: number;
  createdAt: string;
}

interface AdjustResult {
  ok: boolean;
  item?: InventoryItem;
  reason?: string;
  error?: string;
}

type View = 'list' | 'low';

export function InventoryPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('list');
  const [orgFilter, setOrgFilter] = useState('');

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<Organization[]>(`${ORG_BASE}/organizations`),
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ['inventory', orgFilter],
    queryFn: () =>
      api.get<InventoryItem[]>(`${INV_BASE}/inventory${orgFilter ? `?organizationId=${encodeURIComponent(orgFilter)}` : ''}`),
  });

  const { data: lowItems } = useQuery({
    queryKey: ['inventory-low'],
    queryFn: () => api.get<InventoryItem[]>(`${INV_BASE}/inventory/low`),
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [minQuantity, setMinQuantity] = useState('0');
  const [unitPrice, setUnitPrice] = useState('0');
  const [category, setCategory] = useState('');
  const [itemOrgId, setItemOrgId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<InventoryItem | null>(null);

  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [adjustMsg, setAdjustMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`${INV_BASE}/inventory`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-low'] });
      reset();
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api.patch(`${INV_BASE}/inventory/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-low'] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`${INV_BASE}/inventory/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-low'] });
    },
  });

  const adjust = useMutation({
    mutationFn: (vars: { id: string; delta: number; reason: string }) =>
      api.post<AdjustResult>(`${INV_BASE}/inventory/${vars.id}/adjust`, { delta: vars.delta, reason: vars.reason }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-low'] });
      if (r.ok) {
        setAdjustMsg({ ok: true, text: `Stock ajustado ✓${r.item ? ` (${r.item.name}: ${r.item.quantity})` : ''}` });
        setAdjusting(null);
        setDelta('');
        setReason('');
      } else {
        setAdjustMsg({ ok: false, text: r.error ?? 'No se pudo ajustar el stock.' });
      }
    },
  });

  const reset = () => {
    setFormOpen(false);
    setEditing(null);
    setSku('');
    setName('');
    setQuantity('0');
    setMinQuantity('0');
    setUnitPrice('0');
    setCategory('');
    setItemOrgId('');
  };

  const startCreate = () => {
    setEditing(null);
    reset();
    setFormOpen(true);
  };

  const startEdit = (it: InventoryItem) => {
    setEditing(it);
    setSku(it.sku);
    setName(it.name);
    setQuantity(String(it.quantity));
    setMinQuantity(String(it.minQuantity));
    setUnitPrice(String(it.unitPrice));
    setCategory(it.category ?? '');
    setItemOrgId(it.organizationId ?? '');
    setFormOpen(true);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      sku: sku.trim(),
      name: name.trim(),
      quantity: Number(quantity),
      minQuantity: Number(minQuantity),
      unitPrice: Number(unitPrice),
      category: category.trim() || undefined,
      organizationId: itemOrgId || undefined,
    };
    if (editing) update.mutate({ id: editing.id, body });
    else create.mutate(body);
  };

  const quickAdjust = (it: InventoryItem, d: number) => adjust.mutate({ id: it.id, delta: d, reason: 'Ajuste rápido' });

  if (isLoading) return <Spinner />;

  const itemList = items ?? [];
  const lowList = lowItems ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Inventario</h1>
        <button className={`nav-link ${view === 'list' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('list')}>Listado</button>
        <button className={`nav-link ${view === 'low' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('low')}>Stock bajo</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'list' && (
          <>
            {lowList.length > 0 && (
              <Card style={{ borderLeft: '3px solid var(--ws-warning)' }}>
                <h3 style={{ marginTop: 0 }}>Stock bajo</h3>
                <div className="stack">
                  {lowList.map((it) => (
                    <div key={it.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <span>
                        <strong>{it.name}</strong> <span className="muted">({it.sku})</span>
                      </span>
                      <span style={{ color: 'var(--ws-danger)', fontWeight: 600 }}>{it.quantity} / mín {it.minQuantity}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Ítems</h3>
                  <div className="field" style={{ marginTop: 'var(--ws-space-2)' }}>
                    <label>Filtrar por organización</label>
                    <select className="input" style={{ width: 'auto' }} value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
                      <option value="">Todas</option>
                      {(organizations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                </div>
                <Button onClick={startCreate}>Nuevo ítem</Button>
              </div>

              {formOpen && (
                <Card style={{ marginTop: 'var(--ws-space-4)' }}>
                  <h3>{editing ? 'Editar ítem' : 'Nuevo ítem'}</h3>
                  <form className="stack" onSubmit={onSubmit}>
                    <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <TextField label="SKU" value={sku} onChange={(e) => setSku(e.target.value)} required />
                      <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
                      <TextField label="Cantidad" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                      <TextField label="Mínimo" type="number" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} required />
                      <TextField label="Precio unidad" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
                      <TextField label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Opcional" />
                      <div className="field">
                        <label>Organización</label>
                        <select className="input" style={{ width: 'auto' }} value={itemOrgId} onChange={(e) => setItemOrgId(e.target.value)}>
                          <option value="">Sin organización</option>
                          {(organizations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="row">
                      <Button type="submit" disabled={create.isPending || update.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
                      <Button variant="ghost" onClick={reset}>Cancelar</Button>
                      {(create.isSuccess || update.isSuccess) && <span style={{ color: 'var(--ws-success)' }}>Guardado ✓</span>}
                    </div>
                    {create.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{create.error.message}</p>}
                    {update.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{update.error.message}</p>}
                  </form>
                </Card>
              )}

              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nombre</th>
                    <th>Cantidad</th>
                    <th>Mínimo</th>
                    <th>Precio unidad</th>
                    <th>Categoría</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemList.map((it) => (
                    <tr key={it.id} style={it.quantity <= it.minQuantity ? { background: 'var(--ws-warning-soft, var(--ws-surface-2))' } : undefined}>
                      <td><code>{it.sku}</code></td>
                      <td>{it.name}</td>
                      <td>{it.quantity}</td>
                      <td>{it.minQuantity}</td>
                      <td>{it.unitPrice}</td>
                      <td>{it.category ?? '—'}</td>
                      <td>
                        <div className="row">
                          <Button variant="ghost" onClick={() => quickAdjust(it, -1)} title="Restar 1">−1</Button>
                          <Button variant="ghost" onClick={() => quickAdjust(it, 1)} title="Sumar 1">+1</Button>
                          <Button variant="secondary" onClick={() => { setAdjusting(it); setDelta(''); setReason(''); setAdjustMsg(null); }}>Ajustar</Button>
                          <Button variant="secondary" onClick={() => startEdit(it)}>Editar</Button>
                          <Button variant="ghost" onClick={() => setConfirmDelete(it)}>Eliminar</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {itemList.length === 0 && (
                    <tr><td colSpan={7}><p className="muted">No hay ítems.</p></td></tr>
                  )}
                </tbody>
              </table>
            </Card>

            {adjusting && (
              <Card>
                <h3>Ajustar stock · {adjusting.name} <span className="muted">({adjusting.sku})</span></h3>
                <form className="stack" onSubmit={(e) => { e.preventDefault(); adjust.mutate({ id: adjusting.id, delta: Number(delta), reason: reason.trim() || 'Ajuste manual' }); }}>
                  <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField label="Cantidad (+/−)" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required />
                    <TextField label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opcional" />
                  </div>
                  <div className="row">
                    <Button type="submit" disabled={adjust.isPending}>Aplicar ajuste</Button>
                    <Button variant="ghost" onClick={() => setAdjusting(null)}>Cancelar</Button>
                  </div>
                  {adjustMsg && (
                    <p style={{ color: adjustMsg.ok ? 'var(--ws-success)' : 'var(--ws-danger)', margin: 0 }}>{adjustMsg.text}</p>
                  )}
                  {adjust.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{adjust.error.message}</p>}
                </form>
              </Card>
            )}
          </>
        )}

        {view === 'low' && (
          <Card>
            <h3>Stock bajo</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th>Cantidad</th>
                  <th>Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {lowList.map((it) => (
                  <tr key={it.id}>
                    <td><code>{it.sku}</code></td>
                    <td>{it.name}</td>
                    <td style={{ color: 'var(--ws-danger)', fontWeight: 600 }}>{it.quantity}</td>
                    <td>{it.minQuantity}</td>
                  </tr>
                ))}
                {lowList.length === 0 && (
                  <tr><td colSpan={4}><p className="muted">No hay ítems con stock bajo.</p></td></tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        <ConfirmDialog
          open={confirmDelete !== null}
          title="Eliminar ítem"
          confirmLabel="Eliminar"
          danger
          onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        >
          ¿Eliminar el ítem <strong>{confirmDelete?.name}</strong>? Esta acción es irreversible.
        </ConfirmDialog>
      </div>
    </div>
  );
}
