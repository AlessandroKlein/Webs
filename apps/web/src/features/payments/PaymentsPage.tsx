import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface PaymentRow {
  id: string;
  provider: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: string;
  userId: string | null;
  externalReference: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

interface Summary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  refunded: number;
  collectedAmount: number;
}

interface AnalyticsData {
  period: 'month' | 'year';
  series: Array<{ label: string; earnings: number; expenses: number; profit: number }>;
  totals: { earnings: number; expenses: number; profit: number };
}

interface ExpenseRow {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  date: string;
}

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  refunded: 'Reembolsado',
};

export function PaymentsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');

  const { data: summary } = useQuery({
    queryKey: ['payments-summary'],
    queryFn: () => api.get<Summary>('/api/v1/payments/summary'),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['payments', status, provider],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (provider) qs.set('provider', provider);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<PaymentRow[]>(`/api/v1/payments${suffix}`);
    },
  });

  const refund = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/payments/${id}/refund`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-summary'] });
    },
  });
  const markPaid = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/payments/${id}/mark-paid`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-summary'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/payments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-summary'] });
    },
  });
  const cancelPending = useMutation({
    mutationFn: () => api.post('/api/v1/payments/cancel-pending'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payments-summary'] });
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>Pagos</h1>

      {summary && (
        <div className="grid-3" style={{ gap: 'var(--ws-space-2)' }}>
          <Card><strong>Total</strong><p>{summary.total}</p></Card>
          <Card><strong>Aprobados</strong><p>{summary.approved}</p></Card>
          <Card><strong>Recaudado</strong><p>{money(summary.collectedAmount, 'ARS')}</p></Card>
          <Card><strong>Pendientes</strong><p>{summary.pending}</p></Card>
          <Card><strong>Rechazados</strong><p>{summary.rejected}</p></Card>
          <Card><strong>Reembolsados</strong><p>{summary.refunded}</p></Card>
        </div>
      )}

      <Card>
        <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
            <option value="refunded">Reembolsado</option>
          </select>
          <input className="input" placeholder="Proveedor (ej. mercadopago)" value={provider} onChange={(e) => setProvider(e.target.value)} />
          <Button
            variant="ghost"
            onClick={() => cancelPending.mutate()}
            disabled={cancelPending.isPending || !summary?.pending}
            style={{ color: 'var(--ws-danger)', marginLeft: 'auto' }}
          >
            <i className="bi bi-trash" /> Eliminar pendientes
          </Button>
        </div>

        <table className="table" style={{ marginTop: 'var(--ws-space-3)' }}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Transacción</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td><code>{p.provider}</code></td>
                <td><code style={{ fontSize: '0.8em' }}>{p.transactionId}</code></td>
                <td>{money(p.amount, p.currency)}</td>
                <td><span className="badge">{STATUS_LABEL[p.status] ?? p.status}</span></td>
                <td>
                  <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                    {p.status === 'approved' && (
                      <Button variant="ghost" onClick={() => refund.mutate(p.id)}>Reembolsar</Button>
                    )}
                    {p.status === 'pending' && (
                      <>
                        <Button variant="ghost" onClick={() => markPaid.mutate(p.id)}>Marcar pagado</Button>
                        <Button
                          variant="ghost"
                          onClick={() => remove.mutate(p.id)}
                          disabled={remove.isPending}
                          style={{ color: 'var(--ws-danger)' }}
                        >
                          <i className="bi bi-trash" /> Eliminar
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="muted">No hay transacciones.</p>}
      </Card>

      <CostsPanel />
    </div>
  );
}

function CostsPanel() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');

  const { data } = useQuery({
    queryKey: ['expenses-analytics', period],
    queryFn: () => api.get<AnalyticsData>(`/api/v1/expenses/analytics?period=${period}`),
  });
  const { data: expenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get<ExpenseRow[]>('/api/v1/expenses'),
  });

  const add = useMutation({
    mutationFn: () => api.post('/api/v1/expenses', { description, amount: Number(amount), category: category || undefined }),
    onSuccess: () => {
      setDescription('');
      setAmount('');
      setCategory('');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-analytics'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['expenses-analytics'] });
    },
  });

  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const max = Math.max(1, ...(data?.series ?? []).map((s) => Math.max(s.earnings, s.expenses)));

  return (
    <Card>
      <h3>Costos y ganancias</h3>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div className="row">
          <Button variant={period === 'month' ? 'secondary' : 'ghost'} onClick={() => setPeriod('month')}>Mensual</Button>
          <Button variant={period === 'year' ? 'secondary' : 'ghost'} onClick={() => setPeriod('year')}>Anual</Button>
        </div>
        {data && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <span>Ganancias: <strong style={{ color: 'var(--ws-success)' }}>{money(data.totals.earnings)}</strong></span>
            <span>Gastos: <strong style={{ color: 'var(--ws-danger)' }}>{money(data.totals.expenses)}</strong></span>
            <span>Beneficio: <strong>{money(data.totals.profit)}</strong></span>
          </div>
        )}
      </div>

      <div className="stack" style={{ gap: 'var(--ws-space-1)', marginTop: 'var(--ws-space-3)' }}>
        {(data?.series ?? []).map((s) => (
          <div key={s.label} className="row" style={{ gap: 'var(--ws-space-2)' }}>
            <span className="muted" style={{ width: 70, fontSize: '0.85em' }}>{s.label}</span>
            <div style={{ flex: 1, display: 'flex', gap: 2, height: 16 }}>
              <div title={`ganancias ${money(s.earnings)}`} style={{ width: `${(s.earnings / max) * 100}%`, background: 'var(--ws-success)', minWidth: s.earnings ? 4 : 0, borderRadius: 2 }} />
              <div title={`gastos ${money(s.expenses)}`} style={{ width: `${(s.expenses / max) * 100}%`, background: 'var(--ws-danger)', minWidth: s.expenses ? 4 : 0, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginTop: 'var(--ws-space-4)', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
        <input className="input" style={{ flex: 1 }} placeholder="Descripción del gasto" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className="input" type="number" placeholder="Monto ($)" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 140 }} />
        <input className="input" placeholder="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 140 }} />
        <Button onClick={() => add.mutate()} disabled={!description || !amount}>
          Agregar gasto
        </Button>
      </div>

      <div className="stack" style={{ marginTop: 'var(--ws-space-3)' }}>
        {(expenses ?? []).map((e) => (
          <div key={e.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
            <span>
              {e.description} {e.category && <span className="muted">· {e.category}</span>}
            </span>
            <div className="row">
              <span>{money(e.amount)}</span>
              <Button variant="ghost" onClick={() => remove.mutate(e.id)}>✕</Button>
            </div>
          </div>
        ))}
        {(expenses ?? []).length === 0 && <p className="muted">Sin gastos registrados.</p>}
      </div>
    </Card>
  );
}
