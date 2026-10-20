import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { QrCode } from '../../components/ui/QrCode';

const EC_BASE = '/api/v1/blocks/ecommerce';
const PAY_BASE = '/api/v1/payments';

interface RawProduct {
  id: string;
  title: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  imageUrl: string | null;
  images: unknown;
  sizes: unknown;
}

interface CartLine {
  key: string;
  id: string;
  title: string;
  price: number;
  size: string | null;
  qty: number;
}

interface PaymentProvider {
  id: string;
  displayName: string;
}

interface CheckoutResult {
  id: string;
  transactionId: string;
  status: string;
  paymentUrl?: string | null;
  qr?: string | null;
}

interface ShippingAddress {
  street: string;
  number: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

interface ShippingQuote {
  provider: string;
  cost: number;
  days: number | null;
  currency: string;
  source: 'provider' | 'local';
}

const EMPTY_ADDRESS: ShippingAddress = {
  street: '',
  number: '',
  city: '',
  province: '',
  postalCode: '',
  country: 'Argentina',
};

const SHIPPING_LABELS: Record<string, string> = {
  local: 'Envío local',
  andreani: 'Andreani',
  oca: 'OCA',
  correo: 'Correo Argentino',
  mercadolibre: 'Mercado Envíos',
  dhl: 'DHL',
};

const shippingLabel = (provider: string) => SHIPPING_LABELS[provider] ?? provider;

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const money = (n: number) => `$${(n / 100).toFixed(2)}`;

const CART_STORAGE_KEY = 'webs-cart';

const loadCart = (): CartLine[] => {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is CartLine =>
        typeof l === 'object' &&
        l !== null &&
        typeof (l as CartLine).key === 'string' &&
        typeof (l as CartLine).id === 'string' &&
        typeof (l as CartLine).title === 'string' &&
        typeof (l as CartLine).price === 'number' &&
        typeof (l as CartLine).qty === 'number',
    );
  } catch {
    return [];
  }
};

const qtyBtnStyle: CSSProperties = {
  width: 32,
  height: 32,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--ws-radius-md)',
  background: 'var(--ws-surface)',
  color: 'var(--ws-text)',
  cursor: 'pointer',
};

const closeBtnStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  color: 'var(--ws-text-muted)',
  fontSize: '1.2rem',
  lineHeight: 1,
};

const addrFieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ws-space-1)',
  minWidth: 0,
};

const addrInputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--ws-space-2) var(--ws-space-3)',
  border: '1px solid var(--ws-border)',
  borderRadius: 'var(--ws-radius-md)',
  background: 'var(--ws-surface-2)',
  color: 'var(--ws-text)',
  fontSize: 'var(--ws-font-size-sm)',
};

const addrLabelStyle: CSSProperties = {
  fontSize: 'var(--ws-font-size-sm)',
  color: 'var(--ws-text-muted)',
};

function ProductImage({ product, height = 180 }: { product: RawProduct; height?: number }) {
  const url = product.imageUrl ?? asStringArray(product.images)[0] ?? null;
  if (url) {
    return (
      <img
        src={url}
        alt={product.title}
        style={{ width: '100%', height, objectFit: 'cover', display: 'block', background: 'var(--ws-surface-2)' }}
      />
    );
  }
  return (
    <div
      style={{
        width: '100%',
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ws-surface-2)',
        color: 'var(--ws-text-muted)',
      }}
    >
      <i className="bi bi-image" style={{ fontSize: '2.25rem' }} />
    </div>
  );
}

export function StorePage() {
  const { data: products, isLoading: loading } = useQuery({
    queryKey: ['store-products'],
    queryFn: () => api.get<RawProduct[]>(`${EC_BASE}/products/persisted`),
  });

  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);

  const [cart, setCart] = useState<CartLine[]>(loadCart);
  const [selected, setSelected] = useState<RawProduct | null>(null);
  const [detailSize, setDetailSize] = useState<string | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [providers, setProviders] = useState<PaymentProvider[] | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[] | null>(null);
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* no-op */
    }
  }, [cart]);

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const selectedQuote = shippingQuotes?.find((q) => q.provider === selectedShipping) ?? null;
  const shippingCost = selectedQuote?.cost ?? 0;
  const grandTotal = total + shippingCost;

  const openProduct = (p: RawProduct) => {
    setSelected(p);
    setDetailSize(asStringArray(p.sizes)[0] ?? null);
    setDetailQty(1);
    setActiveImage(0);
  };

  const addToCart = (p: RawProduct, size: string | null, qty: number) => {
    const key = `${p.id}::${size ?? ''}`;
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { key, id: p.id, title: p.title, price: p.price, size, qty }];
    });
    setSelected(null);
    setNotice('Agregado al carrito');
  };

  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  const changeQty = (key: string, delta: number) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: Math.max(1, l.qty + delta) } : l)));

  const updateAddress = (field: keyof ShippingAddress, value: string) =>
    setAddress((prev) => ({ ...prev, [field]: value }));

  const loadQuotes = async () => {
    const postalCode = address.postalCode.trim();
    if (!postalCode) {
      setCartError('Ingresá tu código postal para cotizar el envío');
      return;
    }
    setLoadingQuotes(true);
    setCartError(null);
    try {
      // Peso estimado: 1 kg por unidad (los productos no declaran peso).
      const weight = Math.max(1, count);
      const qs =
        `provider=all&weight=${encodeURIComponent(String(weight))}` +
        `&postalCode=${encodeURIComponent(postalCode)}` +
        `&province=${encodeURIComponent(address.province.trim())}` +
        `&city=${encodeURIComponent(address.city.trim())}`;
      const res = await api.get<{ ok: boolean; quotes: ShippingQuote[] }>(`${EC_BASE}/shipping/quotes?${qs}`);
      const quotes = res?.quotes ?? [];
      setShippingQuotes(quotes);
      setSelectedShipping(quotes[0]?.provider ?? null);
    } catch {
      setShippingQuotes(null);
      setSelectedShipping(null);
      setCartError('No se pudo cotizar el envío. Revisá la dirección e intentá de nuevo.');
    } finally {
      setLoadingQuotes(false);
    }
  };

  const resetCheckout = () => {
    setProviders(null);
    setSelectedProvider(null);
    setCheckout(null);
    setCartError(null);
  };

  const requireLogin = () => {
    if (!user || status === 'unauthenticated') {
      setNotice('Iniciá sesión para comprar');
      navigate('/login');
      return false;
    }
    return true;
  };

  const startCheckout = async () => {
    if (!requireLogin()) return;
    if (!selectedShipping) {
      setCartError('Completá la dirección y elegí un método de envío');
      return;
    }
    setCartError(null);
    setNotice(null);
    setLoadingProviders(true);
    try {
      const list = await api.get<PaymentProvider[]>(`${PAY_BASE}/providers`);
      if (!list || list.length === 0) {
        setProviders(null);
        setCartError('No hay métodos de pago configurados');
        return;
      }
      setProviders(list);
      setSelectedProvider(list[0]?.id ?? null);
      setCheckout(null);
    } catch {
      setProviders(null);
      setCartError('No hay métodos de pago configurados');
    } finally {
      setLoadingProviders(false);
    }
  };

  const pay = async () => {
    if (!requireLogin()) return;
    if (!selectedProvider) return;
    if (!selectedShipping) {
      setCartError('Elegí un método de envío antes de pagar');
      return;
    }
    setPaying(true);
    setCartError(null);
    setNotice(null);
    try {
      // 1) Registra el pedido con la dirección y el costo de envío.
      await api.post(`${EC_BASE}/orders`, {
        items: cart.map((l) => ({ id: l.id, qty: l.qty, size: l.size })),
        shippingAddress: address,
        shippingMethod: selectedShipping,
        shippingCost,
      });
      // 2) Inicia el pago. Los precios ya vienen en centavos (`price`/`total`),
      // por lo que el monto entero (subtotal + envío) se envía tal cual.
      const result = await api.post<CheckoutResult>(`${PAY_BASE}/checkout`, {
        provider: selectedProvider,
        amount: grandTotal,
        currency: 'ARS',
        description: `Compra en la tienda · ${cart.length} producto${cart.length === 1 ? '' : 's'}`,
        externalReference: `store-${Date.now()}`,
        items: cart.map((l) => ({ id: l.id, title: l.title, quantity: l.qty, unitPrice: l.price })),
      });
      setCheckout(result);
    } catch (e) {
      setCartError(e instanceof Error ? e.message : 'Error al iniciar el pago');
    } finally {
      setPaying(false);
    }
  };

  const finalizeCheckout = () => {
    setCart([]);
    setAddress(EMPTY_ADDRESS);
    setShippingQuotes(null);
    setSelectedShipping(null);
    resetCheckout();
    setCartOpen(false);
    setNotice('Pago iniciado. Completá el pago en la pasarela para confirmar tu compra.');
  };

  const sizes = selected ? asStringArray(selected.sizes) : [];
  const gallery = (() => {
    const imgs = selected ? asStringArray(selected.images) : [];
    return imgs.length ? imgs : selected?.imageUrl ? [selected.imageUrl] : [];
  })();

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'var(--ws-space-4)' }}>
      {/* Header local con icono de carrito (solo en esta página) */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--ws-space-4)',
          marginBottom: 'var(--ws-space-5)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--ws-font-size-lg)' }}>Tienda</h1>
          <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
            Productos, ofertas y más
          </p>
        </div>
        <button
          onClick={() => setCartOpen(true)}
          aria-label="Abrir carrito"
          style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 46,
            height: 46,
            border: '1px solid var(--ws-border)',
            borderRadius: 'var(--ws-radius-full)',
            background: 'var(--ws-surface)',
            color: 'var(--ws-text)',
            cursor: 'pointer',
          }}
        >
          <i className="bi bi-bag" style={{ fontSize: '1.25rem' }} />
          {count > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 20,
                height: 20,
                padding: '0 5px',
                borderRadius: 'var(--ws-radius-full)',
                background: 'var(--ws-primary)',
                color: 'var(--ws-on-primary)',
                fontSize: 'var(--ws-font-size-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {count}
            </span>
          )}
        </button>
      </header>

      {notice && (
        <div
          style={{
            padding: 'var(--ws-space-2) var(--ws-space-3)',
            marginBottom: 'var(--ws-space-4)',
            background: 'var(--ws-primary-soft)',
            color: 'var(--ws-primary)',
            borderRadius: 'var(--ws-radius-md)',
          }}
        >
          {notice}
        </div>
      )}

      {loading ? (
        <p className="muted">Cargando productos…</p>
      ) : (products ?? []).length === 0 ? (
        <p className="muted">No hay productos todavía.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 'var(--ws-space-4)',
          }}
        >
          {(products ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => openProduct(p)}
              style={{
                textAlign: 'left',
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-lg)',
                background: 'var(--ws-surface)',
                padding: 0,
                overflow: 'hidden',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <ProductImage product={p} height={170} />
              <div style={{ padding: 'var(--ws-space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)' }}>
                <strong>{p.title}</strong>
                {p.category ? <span className="badge">{p.category}</span> : null}
                <span style={{ fontWeight: 600 }}>{money(p.price)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detalle de producto */}
      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--ws-space-4)',
            zIndex: 100,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: 'var(--ws-surface)',
              border: '1px solid var(--ws-border)',
              borderRadius: 'var(--ws-radius-lg)',
              boxShadow: 'var(--ws-shadow-lg)',
              maxWidth: 760,
              width: '100%',
              maxHeight: '88vh',
              overflow: 'auto',
              padding: 'var(--ws-space-5)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--ws-space-3)' }}>
                <h2 style={{ margin: 0, fontSize: 'var(--ws-font-size-lg)' }}>{selected.title}</h2>
                <button onClick={() => setSelected(null)} style={closeBtnStyle} aria-label="Cerrar">
                  ✕
                </button>
              </div>

              {selected.category ? <span className="badge">{selected.category}</span> : null}
              <span style={{ fontWeight: 700, fontSize: '1.25rem' }}>{money(selected.price)}</span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)' }}>
                <div
                  style={{
                    width: '100%',
                    height: 260,
                    borderRadius: 'var(--ws-radius-md)',
                    overflow: 'hidden',
                    background: 'var(--ws-surface-2)',
                  }}
                >
                  {gallery.length ? (
                    <img
                      src={gallery[activeImage]}
                      alt={selected.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--ws-text-muted)',
                      }}
                    >
                      <i className="bi bi-image" style={{ fontSize: '3rem' }} />
                    </div>
                  )}
                </div>
                {gallery.length > 1 && (
                  <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                    {gallery.map((src, idx) => (
                      <button
                        key={`${src}-${idx}`}
                        onClick={() => setActiveImage(idx)}
                        style={{
                          width: 56,
                          height: 56,
                          border: idx === activeImage ? '2px solid var(--ws-primary)' : '1px solid var(--ws-border)',
                          borderRadius: 'var(--ws-radius-md)',
                          overflow: 'hidden',
                          padding: 0,
                          cursor: 'pointer',
                          background: 'var(--ws-surface-2)',
                        }}
                      >
                        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selected.description ? <p style={{ margin: 0 }}>{selected.description}</p> : null}

              {sizes.length > 0 && (
                <div>
                  <strong style={{ display: 'block', marginBottom: 'var(--ws-space-2)' }}>Talle</strong>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                    {sizes.map((s) => (
                      <button
                        key={s}
                        onClick={() => setDetailSize(s)}
                        style={{
                          padding: 'var(--ws-space-2) var(--ws-space-3)',
                          borderRadius: 'var(--ws-radius-md)',
                          border: detailSize === s ? '2px solid var(--ws-primary)' : '1px solid var(--ws-border)',
                          background: detailSize === s ? 'var(--ws-primary-soft)' : 'var(--ws-surface)',
                          color: detailSize === s ? 'var(--ws-primary)' : 'var(--ws-text)',
                          cursor: 'pointer',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-3)', flexWrap: 'wrap' }}>
                <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
                  <button onClick={() => setDetailQty((q) => Math.max(1, q - 1))} style={qtyBtnStyle} aria-label="Menos">
                    −
                  </button>
                  <span style={{ minWidth: 32, textAlign: 'center' }}>{detailQty}</span>
                  <button onClick={() => setDetailQty((q) => q + 1)} style={qtyBtnStyle} aria-label="Más">
                    +
                  </button>
                </div>
                <Button onClick={() => addToCart(selected, detailSize, detailQty)} disabled={selected.stock === 0}>
                  Agregar al carrito
                </Button>
              </div>
              {selected.stock === 0 ? <p className="muted" style={{ margin: 0 }}>Sin stock.</p> : null}
            </div>
          </div>
        </div>
      )}

      {/* Panel del carrito */}
      {cartOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 100,
          }}
          onClick={() => setCartOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              height: '100%',
              background: 'var(--ws-surface)',
              borderLeft: '1px solid var(--ws-border)',
              boxShadow: 'var(--ws-shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              padding: 'var(--ws-space-4)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--ws-space-3)' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--ws-font-size-lg)' }}>Carrito</h2>
              <button onClick={() => setCartOpen(false)} style={closeBtnStyle} aria-label="Cerrar carrito">
                ✕
              </button>
            </div>

            {cart.length === 0 ? (
              <p className="muted">Tu carrito está vacío.</p>
            ) : (
              <>
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-3)' }}>
                  {cart.map((l) => (
                    <div
                      key={l.key}
                      style={{
                        display: 'flex',
                        gap: 'var(--ws-space-3)',
                        padding: 'var(--ws-space-3)',
                        border: '1px solid var(--ws-border)',
                        borderRadius: 'var(--ws-radius-md)',
                        background: 'var(--ws-surface-2)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: 'block' }}>{l.title}</strong>
                        <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)', display: 'block' }}>
                          {l.size ? `Talle ${l.size} · ` : ''}
                          {money(l.price)} c/u
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-2)' }}>
                          <button onClick={() => changeQty(l.key, -1)} style={qtyBtnStyle} aria-label="Menos">
                            −
                          </button>
                          <span style={{ minWidth: 24, textAlign: 'center' }}>{l.qty}</span>
                          <button onClick={() => changeQty(l.key, 1)} style={qtyBtnStyle} aria-label="Más">
                            +
                          </button>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-end',
                          justifyContent: 'space-between',
                          gap: 'var(--ws-space-2)',
                        }}
                      >
                        <button onClick={() => removeLine(l.key)} style={closeBtnStyle} aria-label="Quitar">
                          ✕
                        </button>
                        <strong>{money(l.price * l.qty)}</strong>
                      </div>
                    </div>
                  ))}

                  {/* Dirección de envío */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)' }}>
                    <strong style={{ fontSize: 'var(--ws-font-size-sm)' }}>Dirección de envío</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--ws-space-2)' }}>
                      <div style={{ ...addrFieldStyle, gridColumn: '1 / -1' }}>
                        <label style={addrLabelStyle} htmlFor="ship-street">Calle</label>
                        <input
                          id="ship-street"
                          style={addrInputStyle}
                          value={address.street}
                          onChange={(e) => updateAddress('street', e.target.value)}
                          placeholder="Av. Corrientes"
                        />
                      </div>
                      <div style={addrFieldStyle}>
                        <label style={addrLabelStyle} htmlFor="ship-number">Número</label>
                        <input
                          id="ship-number"
                          style={addrInputStyle}
                          value={address.number}
                          onChange={(e) => updateAddress('number', e.target.value)}
                          placeholder="1234"
                        />
                      </div>
                      <div style={addrFieldStyle}>
                        <label style={addrLabelStyle} htmlFor="ship-city">Ciudad</label>
                        <input
                          id="ship-city"
                          style={addrInputStyle}
                          value={address.city}
                          onChange={(e) => updateAddress('city', e.target.value)}
                          placeholder="Buenos Aires"
                        />
                      </div>
                      <div style={addrFieldStyle}>
                        <label style={addrLabelStyle} htmlFor="ship-province">Provincia</label>
                        <input
                          id="ship-province"
                          style={addrInputStyle}
                          value={address.province}
                          onChange={(e) => updateAddress('province', e.target.value)}
                          placeholder="Buenos Aires"
                        />
                      </div>
                      <div style={addrFieldStyle}>
                        <label style={addrLabelStyle} htmlFor="ship-cp">Código postal</label>
                        <input
                          id="ship-cp"
                          style={addrInputStyle}
                          value={address.postalCode}
                          onChange={(e) => updateAddress('postalCode', e.target.value)}
                          placeholder="1406"
                          inputMode="numeric"
                        />
                      </div>
                      <div style={addrFieldStyle}>
                        <label style={addrLabelStyle} htmlFor="ship-country">País</label>
                        <input
                          id="ship-country"
                          style={addrInputStyle}
                          value={address.country}
                          onChange={(e) => updateAddress('country', e.target.value)}
                          placeholder="Argentina"
                        />
                      </div>
                    </div>
                    <Button variant="secondary" style={{ width: '100%' }} onClick={loadQuotes} disabled={loadingQuotes}>
                      {loadingQuotes ? 'Cotizando…' : 'Cotizar envío'}
                    </Button>
                  </div>

                  {/* Método de envío */}
                  {shippingQuotes && shippingQuotes.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)' }}>
                      <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>Método de envío:</span>
                      {shippingQuotes.map((q) => (
                        <button
                          key={q.provider}
                          onClick={() => setSelectedShipping(q.provider)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--ws-space-2)',
                            padding: 'var(--ws-space-2) var(--ws-space-3)',
                            border: selectedShipping === q.provider ? '2px solid var(--ws-primary)' : '1px solid var(--ws-border)',
                            borderRadius: 'var(--ws-radius-md)',
                            background: selectedShipping === q.provider ? 'var(--ws-primary-soft)' : 'var(--ws-surface)',
                            color: 'var(--ws-text)',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <i className="bi bi-truck" />
                          <span style={{ flex: 1 }}>
                            {shippingLabel(q.provider)}
                            {q.days != null ? ` · ${q.days} días` : ''}
                          </span>
                          <strong>{money(q.cost)}</strong>
                          {selectedShipping === q.provider && (
                            <i className="bi bi-check-circle-fill" style={{ color: 'var(--ws-primary)' }} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    borderTop: '1px solid var(--ws-border)',
                    paddingTop: 'var(--ws-space-3)',
                    marginTop: 'var(--ws-space-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--ws-space-2)',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">Subtotal</span>
                    <span>{money(total)}</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="muted">Envío</span>
                    <span>{selectedShipping ? money(shippingCost) : '—'}</span>
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>Total</strong>
                    <strong style={{ fontSize: '1.15rem' }}>{money(grandTotal)}</strong>
                  </div>

                  {cartError && (
                    <div
                      style={{
                        padding: 'var(--ws-space-2) var(--ws-space-3)',
                        background: 'rgba(220, 38, 38, 0.12)',
                        color: 'var(--ws-danger)',
                        borderRadius: 'var(--ws-radius-md)',
                        fontSize: 'var(--ws-font-size-sm)',
                      }}
                    >
                      {cartError}
                    </div>
                  )}

                  {checkout ? (
                    <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
                      {checkout.paymentUrl ? (
                        <a
                          href={checkout.paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 'var(--ws-space-2)',
                            padding: 'var(--ws-space-3)',
                            background: 'var(--ws-primary)',
                            color: 'var(--ws-on-primary)',
                            borderRadius: 'var(--ws-radius-md)',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          <i className="bi bi-box-arrow-up-right" /> Pagar ahora
                        </a>
                      ) : checkout.qr ? (
                        <div className="stack" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
                          <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                            Escaneá el código QR para completar el pago:
                          </span>
                          <QrCode value={checkout.qr} />
                        </div>
                      ) : (
                        <div style={{ padding: 'var(--ws-space-3)', background: 'var(--ws-primary-soft)', borderRadius: 'var(--ws-radius-md)' }}>
                          <strong style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                            <i className="bi bi-hourglass-split" /> Pago pendiente
                          </strong>
                          <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
                            Código de transacción: <code>{checkout.transactionId}</code>
                          </p>
                        </div>
                      )}

                      <Button variant="secondary" style={{ width: '100%' }} onClick={finalizeCheckout}>
                        Entendido
                      </Button>
                    </div>
                  ) : providers ? (
                    <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
                      <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>Elegí un método de pago:</span>
                      {providers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedProvider(p.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--ws-space-2)',
                            padding: 'var(--ws-space-3)',
                            border: selectedProvider === p.id ? '2px solid var(--ws-primary)' : '1px solid var(--ws-border)',
                            borderRadius: 'var(--ws-radius-md)',
                            background: selectedProvider === p.id ? 'var(--ws-primary-soft)' : 'var(--ws-surface)',
                            color: 'var(--ws-text)',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <i className="bi bi-credit-card" />
                          <span style={{ flex: 1 }}>{p.displayName}</span>
                          {selectedProvider === p.id && <i className="bi bi-check-circle-fill" style={{ color: 'var(--ws-primary)' }} />}
                        </button>
                      ))}
                      <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
                        <Button variant="secondary" style={{ flex: 1 }} onClick={resetCheckout}>
                          Volver
                        </Button>
                        <Button style={{ flex: 1 }} onClick={pay} disabled={paying || !selectedProvider}>
                          {paying ? 'Iniciando pago…' : 'Pagar'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button style={{ width: '100%' }} onClick={startCheckout} disabled={loadingProviders || cart.length === 0 || !selectedShipping}>
                      {loadingProviders ? 'Buscando métodos de pago…' : 'Comprar'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
