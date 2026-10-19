import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const EC_BASE = '/api/v1/blocks/ecommerce';
const INV_BASE = '/api/v1/blocks/inventario';

const parseList = (s: string): string[] =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

interface Product {
  id: string;
  title: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  imageUrl: string | null;
  images: string[];
  sizes: string[];
}

interface InventoryItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  status: string;
  total: number;
  items: unknown[];
  createdAt: string;
}

interface Shipment {
  id: string;
  orderId: string;
  provider: string;
  trackingNumber: string | null;
  status: string;
  cost: number;
  createdAt: string;
}

interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  validUntil: string | null;
  active: boolean;
}

interface ShippingQuote {
  provider: string;
  cost: number;
  days: number;
}

type View = 'products' | 'orders' | 'shipments' | 'coupons';

const ORDER_STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--ws-warning)',
  paid: 'var(--ws-success)',
  processing: 'var(--ws-primary)',
  shipped: 'var(--ws-primary)',
  delivered: 'var(--ws-success)',
  cancelled: 'var(--ws-danger)',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? 'var(--ws-surface-2)';
  const isMuted = color === 'var(--ws-surface-2)';
  return (
    <span className="badge" style={{ background: color, color: isMuted ? 'var(--ws-text-muted)' : '#fff' }}>
      {status}
    </span>
  );
}

function OrderStatusEditor({
  order,
  busy,
  onUpdate,
}: {
  order: Order;
  busy: boolean;
  onUpdate: (id: string, status: string) => void;
}) {
  const [status, setStatus] = useState(order.status);
  const { t } = useTranslation();
  return (
    <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
      <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button variant="secondary" onClick={() => onUpdate(order.id, status)} disabled={busy || status === order.status}>
        {t('common.save')}
      </Button>
    </div>
  );
}

export function CommercePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('products');

  // ── Productos ───────────────────────────────────────────
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['ecommerce-products'],
    queryFn: () => api.get<Product[]>(`${EC_BASE}/products/persisted`),
  });

  const { data: inventoryItems } = useQuery({
    queryKey: ['ecommerce-inventory'],
    queryFn: () => api.get<InventoryItem[]>(`${INV_BASE}/inventory`),
  });

  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pTitle, setPTitle] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pStock, setPStock] = useState('');
  const [pCategory, setPCategory] = useState('');
  const [pDescription, setPDescription] = useState('');
  const [pImageUrl, setPImageUrl] = useState('');
  const [pImages, setPImages] = useState('');
  const [pSizes, setPSizes] = useState('');
  const [pStockBySize, setPStockBySize] = useState<Record<string, string>>({});
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);

  const saveProduct = useMutation({
    mutationFn: (vars: { id: string | null; body: Record<string, unknown> }) =>
      vars.id ? api.patch(`${EC_BASE}/products/${vars.id}`, vars.body) : api.post(`${EC_BASE}/products`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecommerce-products'] });
      qc.invalidateQueries({ queryKey: ['ecommerce-inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-low'] });
      resetProduct();
    },
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.del(`${EC_BASE}/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ecommerce-products'] }),
  });

  const resetProduct = () => {
    setProductFormOpen(false);
    setEditingProduct(null);
    setPTitle('');
    setPPrice('');
    setPStock('');
    setPCategory('');
    setPDescription('');
    setPImageUrl('');
    setPImages('');
    setPSizes('');
    setPStockBySize({});
  };

  const startEditProduct = (p: Product) => {
    setEditingProduct(p);
    setPTitle(p.title);
    setPPrice(String(p.price));
    setPStock(String(p.stock));
    setPCategory(p.category ?? '');
    setPDescription(p.description ?? '');
    setPImageUrl(p.imageUrl ?? '');
    setPImages((p.images ?? []).join(', '));
    setPSizes((p.sizes ?? []).join(', '));
    const bySize: Record<string, string> = {};
    for (const s of p.sizes ?? []) {
      const item = (inventoryItems ?? []).find((it) => it.productId === p.id && it.name === `${p.title} (${s})`);
      bySize[s] = item ? String(item.quantity) : '';
    }
    setPStockBySize(bySize);
    setProductFormOpen(true);
  };

  const sizesList = parseList(pSizes);

  const submitProduct = () => {
    const sizes = parseList(pSizes);
    const stockBySize: Record<string, number> = {};
    for (const s of sizes) {
      const n = Number(pStockBySize[s] ?? '');
      stockBySize[s] = Number.isFinite(n) ? n : 0;
    }
    const body: Record<string, unknown> = {
      title: pTitle.trim(),
      price: Number(pPrice),
      stock: Number(pStock),
      category: pCategory.trim() || undefined,
      description: pDescription.trim() || undefined,
      imageUrl: pImageUrl.trim() || undefined,
      images: parseList(pImages),
      sizes,
      stockBySize,
    };
    saveProduct.mutate({ id: editingProduct?.id ?? null, body });
  };

  // ── Pedidos ─────────────────────────────────────────────
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['ecommerce-orders'],
    queryFn: () => api.get<Order[]>(`${EC_BASE}/orders`),
  });

  const updateOrderStatus = useMutation({
    mutationFn: (vars: { id: string; status: string }) => api.patch(`${EC_BASE}/orders/${vars.id}`, { status: vars.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ecommerce-orders'] }),
  });

  // ── Envíos ──────────────────────────────────────────────
  const { data: shipments, isLoading: shipmentsLoading } = useQuery({
    queryKey: ['ecommerce-shipments'],
    queryFn: () => api.get<Shipment[]>(`${EC_BASE}/shipments`),
  });

  const [shipOrderId, setShipOrderId] = useState('');
  const [shipProvider, setShipProvider] = useState('');
  const [shipTracking, setShipTracking] = useState('');

  const createShipment = useMutation({
    mutationFn: () =>
      api.post<Shipment>(`${EC_BASE}/shipments`, {
        orderId: shipOrderId.trim(),
        provider: shipProvider.trim(),
        trackingNumber: shipTracking.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecommerce-shipments'] });
      setShipOrderId('');
      setShipProvider('');
      setShipTracking('');
    },
  });

  const [trackingShipment, setTrackingShipment] = useState<Shipment | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingStatus, setTrackingStatus] = useState('');

  const updateShipment = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      api.patch(`${EC_BASE}/shipments/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecommerce-shipments'] });
      setTrackingShipment(null);
      setTrackingNumber('');
      setTrackingStatus('');
    },
  });

  // ── Cupones ─────────────────────────────────────────────
  const { data: coupons, isLoading: couponsLoading } = useQuery({
    queryKey: ['ecommerce-coupons'],
    queryFn: () => api.get<Coupon[]>(`${EC_BASE}/coupons`),
  });

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState('');
  const [couponValidUntil, setCouponValidUntil] = useState('');
  const [confirmCoupon, setConfirmCoupon] = useState<Coupon | null>(null);

  const createCoupon = useMutation({
    mutationFn: () =>
      api.post<Coupon>(`${EC_BASE}/coupons`, {
        code: couponCode.trim(),
        discountPercent: Number(couponDiscount),
        validUntil: couponValidUntil ? new Date(couponValidUntil).toISOString() : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ecommerce-coupons'] });
      setCouponCode('');
      setCouponDiscount('');
      setCouponValidUntil('');
    },
  });

  const deleteCoupon = useMutation({
    mutationFn: (id: string) => api.del(`${EC_BASE}/coupons/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ecommerce-coupons'] }),
  });

  // ── Cotizador de envío ──────────────────────────────────
  const [quoteProvider, setQuoteProvider] = useState('');
  const [quoteWeight, setQuoteWeight] = useState('');
  const [quoteResult, setQuoteResult] = useState<ShippingQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');

  const quote = useMutation({
    mutationFn: () =>
      api.get<ShippingQuote>(
        `${EC_BASE}/shipping/quotes?provider=${encodeURIComponent(quoteProvider.trim())}&weight=${encodeURIComponent(quoteWeight)}`,
      ),
    onSuccess: (r) => {
      setQuoteResult(r);
      setQuoteError('');
    },
    onError: (err) => {
      setQuoteResult(null);
      setQuoteError(err.message);
    },
  });

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('admin.commerce.title')}</h1>
        {(
          [
            ['products', t('admin.commerce.products')],
            ['orders', t('admin.commerce.orders')],
            ['shipments', t('admin.commerce.shipments')],
            ['coupons', t('admin.commerce.coupons')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`nav-link ${view === key ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'products' && (
          <Card>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <h3 style={{ margin: 0 }}>{t('admin.commerce.products')}</h3>
              <Button
                onClick={() => {
                  resetProduct();
                  setProductFormOpen(true);
                }}
              >
                {t('admin.commerce.newProduct')}
              </Button>
            </div>

            {productFormOpen && (
              <Card style={{ marginTop: 'var(--ws-space-4)' }}>
                <h3>{editingProduct ? t('admin.commerce.editProduct') : t('admin.commerce.newProduct')}</h3>
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitProduct();
                  }}
                >
                  <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField label={t('admin.commerce.titleCol')} value={pTitle} onChange={(e) => setPTitle(e.target.value)} required />
                    <TextField label={t('admin.commerce.price')} type="number" value={pPrice} onChange={(e) => setPPrice(e.target.value)} required />
                    <TextField label={t('admin.commerce.stock')} type="number" value={pStock} onChange={(e) => setPStock(e.target.value)} required />
                    <TextField label={t('admin.commerce.categoryOptional')} value={pCategory} onChange={(e) => setPCategory(e.target.value)} />
                  </div>
                  <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField label="URL de imagen" value={pImageUrl} onChange={(e) => setPImageUrl(e.target.value)} placeholder="https://…" />
                    <TextField label="Imágenes (URLs separadas por coma)" value={pImages} onChange={(e) => setPImages(e.target.value)} placeholder="https://…, https://…" />
                    <TextField label="Talles (separados por coma)" value={pSizes} onChange={(e) => setPSizes(e.target.value)} placeholder="S, M, L" />
                  </div>
                  {sizesList.length > 0 && (
                    <div className="field">
                      <label>Stock por talle</label>
                      <div className="row" style={{ flexWrap: 'wrap' }}>
                        {sizesList.map((s) => (
                          <div key={s} className="field" style={{ minWidth: 120 }}>
                            <label>Stock {s}</label>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              value={pStockBySize[s] ?? ''}
                              onChange={(e) => setPStockBySize((prev) => ({ ...prev, [s]: e.target.value }))}
                              placeholder="0"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="field">
                    <label>Descripción</label>
                    <textarea className="input" value={pDescription} onChange={(e) => setPDescription(e.target.value)} />
                  </div>
                  <div className="row">
                    <Button type="submit" disabled={saveProduct.isPending || !pTitle || !pPrice || !pStock}>
                      {editingProduct ? t('common.save') : t('common.create')}
                    </Button>
                    <Button variant="ghost" onClick={resetProduct}>
                      {t('common.cancel')}
                    </Button>
                    {saveProduct.error && <span style={{ color: 'var(--ws-danger)' }}>{saveProduct.error.message}</span>}
                  </div>
                </form>
              </Card>
            )}

            {productsLoading ? (
              <Spinner />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('admin.commerce.titleCol')}</th>
                    <th>{t('admin.commerce.price')}</th>
                    <th>{t('admin.commerce.stock')}</th>
                    <th>{t('admin.commerce.category')}</th>
                    <th>Imagen</th>
                    <th>Talles</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(products ?? []).map((p) => (
                    <tr key={p.id}>
                      <td>{p.title}</td>
                      <td>{p.price}</td>
                      <td>{p.stock}</td>
                      <td>{p.category ?? '—'}</td>
                      <td>
                        {p.imageUrl || (p.images ?? []).length > 0 ? (
                          <img
                            src={p.imageUrl ?? p.images[0]}
                            alt={p.title}
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 'var(--ws-radius-md)' }}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{(p.sizes ?? []).length > 0 ? (p.sizes ?? []).join(', ') : '—'}</td>
                      <td>
                        <div className="row">
                          <Button variant="secondary" onClick={() => startEditProduct(p)}>
                            {t('common.edit')}
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmProduct(p)}>
                            {t('common.delete')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(products ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <p className="muted">{t('admin.commerce.noProducts')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {view === 'orders' && (
          <Card>
            <h3 style={{ marginTop: 0 }}>{t('admin.commerce.orders')}</h3>
            {ordersLoading ? (
              <Spinner />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('admin.commerce.order')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('admin.commerce.total')}</th>
                    <th>{t('admin.commerce.items')}</th>
                    <th>{t('admin.commerce.created')}</th>
                    <th>{t('admin.commerce.changeStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(orders ?? []).map((o) => (
                    <tr key={o.id}>
                      <td>
                        <code>{o.id}</code>
                      </td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
                      <td>{o.total}</td>
                      <td>{o.items?.length ?? 0}</td>
                      <td>{new Date(o.createdAt).toLocaleString()}</td>
                      <td>
                        <OrderStatusEditor
                          order={o}
                          busy={updateOrderStatus.isPending}
                          onUpdate={(id, status) => updateOrderStatus.mutate({ id, status })}
                        />
                      </td>
                    </tr>
                  ))}
                  {(orders ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <p className="muted">{t('admin.commerce.noOrders')}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {view === 'shipments' && (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.commerce.newShipment')}</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  createShipment.mutate();
                }}
              >
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <TextField label={t('admin.commerce.orderId')} value={shipOrderId} onChange={(e) => setShipOrderId(e.target.value)} required />
                  <TextField label={t('admin.commerce.provider')} value={shipProvider} onChange={(e) => setShipProvider(e.target.value)} required />
                  <TextField label={t('admin.commerce.trackingOptional')} value={shipTracking} onChange={(e) => setShipTracking(e.target.value)} />
                </div>
                <div className="row">
                  <Button type="submit" disabled={createShipment.isPending || !shipOrderId || !shipProvider}>
                    {t('admin.commerce.createShipment')}
                  </Button>
                  {createShipment.error && <span style={{ color: 'var(--ws-danger)' }}>{createShipment.error.message}</span>}
                </div>
              </form>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.commerce.shipments')}</h3>
              {shipmentsLoading ? (
                <Spinner />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('admin.commerce.order')}</th>
                      <th>{t('admin.commerce.provider')}</th>
                      <th>{t('admin.commerce.tracking')}</th>
                      <th>{t('common.status')}</th>
                      <th>{t('admin.commerce.cost')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(shipments ?? []).map((s) => (
                      <tr key={s.id}>
                        <td>
                          <code>{s.orderId}</code>
                        </td>
                        <td>{s.provider}</td>
                        <td>{s.trackingNumber ?? '—'}</td>
                        <td>
                          <StatusBadge status={s.status} />
                        </td>
                        <td>{s.cost}</td>
                        <td>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setTrackingShipment(s);
                              setTrackingNumber(s.trackingNumber ?? '');
                              setTrackingStatus(s.status);
                            }}
                          >
                            {t('admin.commerce.tracking')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(shipments ?? []).length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <p className="muted">{t('admin.commerce.noShipments')}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>

            {trackingShipment && (
              <Card>
                <h3 style={{ marginTop: 0 }}>{t('admin.commerce.updateTracking', { orderId: trackingShipment.orderId })}</h3>
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateShipment.mutate({
                      id: trackingShipment.id,
                      body: {
                        trackingNumber: trackingNumber.trim() || undefined,
                        status: trackingStatus.trim() || undefined,
                      },
                    });
                  }}
                >
                  <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <TextField label={t('admin.commerce.trackingNumber')} value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
                    <TextField label={t('common.status')} value={trackingStatus} onChange={(e) => setTrackingStatus(e.target.value)} />
                  </div>
                  <div className="row">
                    <Button type="submit" disabled={updateShipment.isPending}>
                      {t('common.save')}
                    </Button>
                    <Button variant="ghost" onClick={() => setTrackingShipment(null)}>
                      {t('common.cancel')}
                    </Button>
                    {updateShipment.error && <span style={{ color: 'var(--ws-danger)' }}>{updateShipment.error.message}</span>}
                  </div>
                </form>
              </Card>
            )}
          </>
        )}

        {view === 'coupons' && (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.commerce.newCoupon')}</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  createCoupon.mutate();
                }}
              >
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <TextField label={t('admin.commerce.code')} value={couponCode} onChange={(e) => setCouponCode(e.target.value)} required />
                  <TextField label={t('admin.commerce.discount')} type="number" value={couponDiscount} onChange={(e) => setCouponDiscount(e.target.value)} required />
                  <TextField label={t('admin.commerce.validUntilOptional')} type="datetime-local" value={couponValidUntil} onChange={(e) => setCouponValidUntil(e.target.value)} />
                </div>
                <div className="row">
                  <Button type="submit" disabled={createCoupon.isPending || !couponCode || !couponDiscount}>
                    {t('admin.commerce.createCoupon')}
                  </Button>
                  {createCoupon.error && <span style={{ color: 'var(--ws-danger)' }}>{createCoupon.error.message}</span>}
                </div>
              </form>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.commerce.coupons')}</h3>
              {couponsLoading ? (
                <Spinner />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('admin.commerce.code')}</th>
                      <th>{t('admin.commerce.discount')}</th>
                      <th>{t('admin.commerce.validUntil')}</th>
                      <th>{t('common.active')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(coupons ?? []).map((c) => (
                      <tr key={c.id}>
                        <td>
                          <code>{c.code}</code>
                        </td>
                        <td>{c.discountPercent}%</td>
                        <td>{c.validUntil ? new Date(c.validUntil).toLocaleString() : '—'}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: c.active ? 'var(--ws-success)' : 'var(--ws-surface-2)',
                              color: c.active ? '#fff' : 'var(--ws-text-muted)',
                            }}
                          >
                            {c.active ? t('common.active') : t('common.inactive')}
                          </span>
                        </td>
                        <td>
                          <Button variant="ghost" onClick={() => setConfirmCoupon(c)}>
                            {t('common.delete')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {(coupons ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5}>
                          <p className="muted">{t('admin.commerce.noCoupons')}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.commerce.shippingQuote')}</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  quote.mutate();
                }}
              >
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <TextField label={t('admin.commerce.provider')} value={quoteProvider} onChange={(e) => setQuoteProvider(e.target.value)} required />
                  <TextField label={t('admin.commerce.weight')} type="number" value={quoteWeight} onChange={(e) => setQuoteWeight(e.target.value)} required />
                </div>
                <div className="row">
                  <Button type="submit" disabled={quote.isPending || !quoteProvider || !quoteWeight}>
                    {t('admin.commerce.quote')}
                  </Button>
                </div>
                {quoteError && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{quoteError}</p>}
                {quoteResult && (
                  <p style={{ margin: 0 }}>
                    <strong>{quoteResult.provider}</strong>: ${quoteResult.cost} · {quoteResult.days} {t('admin.commerce.days')}
                  </p>
                )}
              </form>
            </Card>
          </>
        )}

        <ConfirmDialog
          open={confirmProduct !== null}
          title={t('admin.commerce.deleteProduct')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            if (confirmProduct) deleteProduct.mutate(confirmProduct.id);
            setConfirmProduct(null);
          }}
          onCancel={() => setConfirmProduct(null)}
        >
          {t('admin.commerce.deleteProductConfirm', { title: confirmProduct?.title })}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmCoupon !== null}
          title={t('admin.commerce.deleteCoupon')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            if (confirmCoupon) deleteCoupon.mutate(confirmCoupon.id);
            setConfirmCoupon(null);
          }}
          onCancel={() => setConfirmCoupon(null)}
        >
          {t('admin.commerce.deleteCouponConfirm', { code: confirmCoupon?.code })}
        </ConfirmDialog>
      </div>
    </div>
  );
}
