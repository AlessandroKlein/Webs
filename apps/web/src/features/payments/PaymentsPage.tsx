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
                      <Button variant="ghost" onClick={() => markPaid.mutate(p.id)}>Marcar pagado</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(data ?? []).length === 0 && <p className="muted">No hay transacciones.</p>}
      </Card>
    </div>
  );
}
