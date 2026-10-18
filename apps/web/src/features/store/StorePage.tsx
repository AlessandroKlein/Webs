import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../lib/auth-store';
import { useCartStore } from '../../lib/cart-store';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

const PRODUCTS = [
  { id: 'p1', title: 'Membresía mensual', price: 5000, description: 'Acceso total por 30 días' },
  { id: 'p2', title: 'Plan trimestral', price: 13000, description: '3 meses con descuento' },
  { id: 'p3', title: 'Clase personal', price: 2000, description: 'Sesión 1 a 1' },
];

interface Provider {
  id: string;
  displayName: string;
}

export function StorePage() {
  const items = useCartStore((s) => s.items);
  const add = useCartStore((s) => s.add);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const status = useAuthStore((s) => s.status);
  const [provider, setProvider] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const { data: providers } = useQuery({
    queryKey: ['payment-providers'],
    queryFn: () => api.get<Provider[]>('/api/v1/payments/providers'),
    enabled: status === 'authenticated',
  });

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const pay = async () => {
    if (!provider) return;
    setPaying(true);
    setResult(null);
    try {
      const data = await api.post<{ transactionId: string; paymentUrl?: string | null; qr?: string | null }>(
        '/api/v1/payments/checkout',
        { provider, amount: total, currency: 'ARS', description: 'Compra en la tienda' },
      );
      if (data.paymentUrl) window.open(data.paymentUrl, '_blank');
      setResult(`Transacción creada: ${data.transactionId}`);
      clear();
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Error al crear el pago');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--ws-space-4)' }}>
      <h1>Tienda</h1>
      <div className="grid-2" style={{ gap: 'var(--ws-space-3)', alignItems: 'start' }}>
        <div className="stack">
          {PRODUCTS.map((p) => (
            <Card key={p.id}>
              <strong>{p.title}</strong>
              <p className="muted">{p.description}</p>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>${(p.price / 100).toFixed(2)}</span>
                <Button variant="secondary" onClick={() => add({ id: p.id, title: p.title, price: p.price, quantity: 1 })}>
                  Agregar
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <h3>Carrito</h3>
          {items.length === 0 && <p className="muted">Vacío.</p>}
          {items.map((i) => (
            <div key={i.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>
                {i.title} × {i.quantity}
              </span>
              <span>
                ${((i.price * i.quantity) / 100).toFixed(2)}{' '}
                <button onClick={() => remove(i.id)} style={{ border: 0, cursor: 'pointer' }}>
                  ✕
                </button>
              </span>
            </div>
          ))}
          <hr />
          <p>
            <strong>Total: ${(total / 100).toFixed(2)}</strong>
          </p>

          {status === 'authenticated' ? (
            <div className="stack">
              <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">Elegí medio de pago</option>
                {(providers ?? []).map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.displayName}
                  </option>
                ))}
              </select>
              <Button onClick={pay} disabled={paying || !provider || total === 0}>
                Pagar
              </Button>
            </div>
          ) : (
            <p className="muted">Iniciá sesión para pagar.</p>
          )}
          {result && <p className="muted">{result}</p>}
        </Card>
      </div>
    </div>
  );
}
