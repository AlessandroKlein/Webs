import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

/** Extrae el talle del nombre de un ítem generado por ecommerce ("Título (S)"). */
const sizeFromName = (name: string): string | null => {
  const m = /\(([^)]+)\)\s*$/.exec(name);
  return m?.[1] ?? null;
};

export function InventoryPage() {
  const { t } = useTranslation();
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
        setAdjustMsg({ ok: true, text: `${t('admin.inventory.stockAdjusted')}${r.item ? ` (${r.item.name}: ${r.item.quantity})` : ''}` });
        setAdjusting(null);
        setDelta('');
        setReason('');
      } else {
        setAdjustMsg({ ok: false, text: r.error ?? t('admin.inventory.adjustFailed') });
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

  const quickAdjust = (it: InventoryItem, d: number) => adjust.mutate({ id: it.id, delta: d, reason: t('admin.inventory.quickAdjust') });

  if (isLoading) return <Spinner />;

  const itemList = items ?? [];
  const lowList = lowItems ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('admin.inventory.title')}</h1>
        <button className={`nav-link ${view === 'list' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('list')}>{t('admin.inventory.list')}</button>
        <button className={`nav-link ${view === 'low' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('low')}>{t('admin.inventory.lowStock')}</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'list' && (
          <>
            {lowList.length > 0 && (
              <Card style={{ borderLeft: '3px solid var(--ws-warning)' }}>
                <h3 style={{ marginTop: 0 }}>{t('admin.inventory.lowStock')}</h3>
                <div className="stack">
                  {lowList.map((it) => (
                    <div key={it.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <span>
                        <strong>{it.name}</strong> <span className="muted">({it.sku})</span>
                      </span>
                      <span style={{ color: 'var(--ws-danger)', fontWeight: 600 }}>{it.quantity} / {t('admin.inventory.min')} {it.minQuantity}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{t('admin.inventory.items')}</h3>
                  <div className="field" style={{ marginTop: 'var(--ws-space-2)' }}>
                    <label>{t('admin.inventory.filterByOrganization')}</label>
                    <select className="input" style={{ width: 'auto' }} value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
                      <option value="">{t('admin.inventory.all')}</option>
                      {(organizations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                </div>
                <Button onClick={startCreate}>{t('admin.inventory.newItem')}</Button>
              </div>

              {formOpen && (
                <Card style={{ marginTop: 'var(--ws-space-4)' }}>
                  <h3>{editing ? t('admin.inventory.editItem') : t('admin.inventory.newItem')}</h3>
                  <form className="stack" onSubmit={onSubmit}>
                    <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <TextField label={t('admin.inventory.sku')} value={sku} onChange={(e) => setSku(e.target.value)} required />
                      <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} required />
                      <TextField label={t('admin.inventory.quantity')} type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                      <TextField label={t('admin.inventory.minimum')} type="number" value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} required />
                      <TextField label={t('admin.inventory.unitPrice')} type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />
                      <TextField label={t('admin.inventory.category')} value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('admin.blog.optional')} />
                      <div className="field">
                        <label>{t('admin.organizations.organization')}</label>
                        <select className="input" style={{ width: 'auto' }} value={itemOrgId} onChange={(e) => setItemOrgId(e.target.value)}>
                          <option value="">{t('admin.inventory.noOrganization')}</option>
                          {(organizations ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="row">
                      <Button type="submit" disabled={create.isPending || update.isPending}>{editing ? t('common.save') : t('common.create')}</Button>
                      <Button variant="ghost" onClick={reset}>{t('common.cancel')}</Button>
                      {(create.isSuccess || update.isSuccess) && <span style={{ color: 'var(--ws-success)' }}>{t('common.saved')}</span>}
                    </div>
                    {create.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{create.error.message}</p>}
                    {update.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{update.error.message}</p>}
                  </form>
                </Card>
              )}

              <table className="table">
                <thead>
                  <tr>
                    <th>{t('admin.inventory.sku')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('admin.inventory.quantity')}</th>
                    <th>{t('admin.inventory.minimum')}</th>
                    <th>{t('admin.inventory.unitPrice')}</th>
                    <th>{t('admin.inventory.category')}</th>
                    <th>Producto / Talle</th>
                    <th>{t('common.actions')}</th>
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
                        {it.productId ? (
                          <span>
                            <code>{it.productId}</code>
                            {sizeFromName(it.name) && <span className="muted"> · {sizeFromName(it.name)}</span>}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <div className="row">
                          <Button variant="ghost" onClick={() => quickAdjust(it, -1)} title={t('admin.inventory.subtractOne')}>−1</Button>
                          <Button variant="ghost" onClick={() => quickAdjust(it, 1)} title={t('admin.inventory.addOne')}>+1</Button>
                          <Button variant="secondary" onClick={() => { setAdjusting(it); setDelta(''); setReason(''); setAdjustMsg(null); }}>{t('admin.inventory.adjust')}</Button>
                          <Button variant="secondary" onClick={() => startEdit(it)}>{t('common.edit')}</Button>
                          <Button variant="ghost" onClick={() => setConfirmDelete(it)}>{t('common.delete')}</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {itemList.length === 0 && (
                    <tr><td colSpan={8}><p className="muted">{t('admin.inventory.noItems')}</p></td></tr>
                  )}
                </tbody>
              </table>
            </Card>

            {adjusting && (
              <Card>
                <h3>{t('admin.inventory.adjustStock', { name: adjusting.name })} <span className="muted">({adjusting.sku})</span></h3>
                <form className="stack" onSubmit={(e) => { e.preventDefault(); adjust.mutate({ id: adjusting.id, delta: Number(delta), reason: reason.trim() || t('admin.inventory.manualAdjust') }); }}>
                  <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField label={t('admin.inventory.quantityDelta')} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required />
                    <TextField label={t('admin.inventory.reason')} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.blog.optional')} />
                  </div>
                  <div className="row">
                    <Button type="submit" disabled={adjust.isPending}>{t('admin.inventory.applyAdjustment')}</Button>
                    <Button variant="ghost" onClick={() => setAdjusting(null)}>{t('common.cancel')}</Button>
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
            <h3>{t('admin.inventory.lowStock')}</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.inventory.sku')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('admin.inventory.quantity')}</th>
                  <th>{t('admin.inventory.minimum')}</th>
                  <th>Producto / Talle</th>
                </tr>
              </thead>
              <tbody>
                {lowList.map((it) => (
                  <tr key={it.id}>
                    <td><code>{it.sku}</code></td>
                    <td>{it.name}</td>
                    <td style={{ color: 'var(--ws-danger)', fontWeight: 600 }}>{it.quantity}</td>
                    <td>{it.minQuantity}</td>
                    <td>
                      {it.productId ? (
                        <span>
                          <code>{it.productId}</code>
                          {sizeFromName(it.name) && <span className="muted"> · {sizeFromName(it.name)}</span>}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
                {lowList.length === 0 && (
                  <tr><td colSpan={5}><p className="muted">{t('admin.inventory.noLowStock')}</p></td></tr>
                )}
              </tbody>
            </table>
          </Card>
        )}

        <ConfirmDialog
          open={confirmDelete !== null}
          title={t('admin.inventory.deleteItem')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
          onCancel={() => setConfirmDelete(null)}
        >
          {t('admin.inventory.deleteConfirm', { name: confirmDelete?.name })}
        </ConfirmDialog>
      </div>
    </div>
  );
}
