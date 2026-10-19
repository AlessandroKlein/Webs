import { useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';

const EC_BASE = '/api/v1/blocks/ecommerce';

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

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const money = (n: number) => `$${(n / 100).toFixed(2)}`;

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

  const [cart, setCart] = useState<CartLine[]>([]);
  const [selected, setSelected] = useState<RawProduct | null>(null);
  const [detailSize, setDetailSize] = useState<string | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);

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

  const buy = async () => {
    setBuying(true);
    setNotice(null);
    try {
      await api.post(`${EC_BASE}/orders`, {
        items: cart.map((l) => ({ id: l.id, qty: l.qty, size: l.size })),
      });
      setCart([]);
      setCartOpen(false);
      setNotice('¡Compra confirmada! Tu pedido fue creado.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Error al crear el pedido');
    } finally {
      setBuying(false);
    }
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
            Elegí tus productos con talles e imágenes
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
                <div className="stack" style={{ flex: 1, overflow: 'auto' }}>
                  {cart.map((l) => (
                    <div
                      key={l.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 'var(--ws-space-2)',
                        borderTop: '1px solid var(--ws-border)',
                        paddingTop: 'var(--ws-space-2)',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block' }}>{l.title}</strong>
                        <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                          {l.size ? `Talle ${l.size} · ` : ''}
                          {money(l.price)} × {l.qty}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--ws-space-1)' }}>
                        <span style={{ fontWeight: 600 }}>{money(l.price * l.qty)}</span>
                        <button onClick={() => removeLine(l.key)} style={closeBtnStyle} aria-label="Quitar">
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)', marginTop: 'var(--ws-space-3)' }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--ws-space-3)' }}>
                    <strong>Total</strong>
                    <strong>{money(total)}</strong>
                  </div>
                  <Button style={{ width: '100%' }} onClick={buy} disabled={buying || cart.length === 0}>
                    {buying ? 'Creando pedido…' : 'Comprar'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
