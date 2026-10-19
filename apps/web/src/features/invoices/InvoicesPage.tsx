import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const INV_BASE = '/api/v1/blocks/facturacion';

interface Invoice {
  id: string;
  number: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  customerName: string | null;
  customerTaxId: string | null;
  vatCondition: string | null;
  cae: string | null;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--ws-surface-2)',
  pending: 'var(--ws-warning)',
  issued: 'var(--ws-primary)',
  paid: 'var(--ws-success)',
  cancelled: 'var(--ws-danger)',
};

export function InvoicesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter],
    queryFn: () =>
      api.get<Invoice[]>(`${INV_BASE}/invoices${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''}`),
  });

  const [customerName, setCustomerName] = useState('');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [vatCondition, setVatCondition] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('');
  const [confirmInvoice, setConfirmInvoice] = useState<Invoice | null>(null);

  const createInvoice = useMutation({
    mutationFn: () =>
      api.post<Invoice>(`${INV_BASE}/invoices`, {
        customerName: customerName.trim() || undefined,
        customerTaxId: customerTaxId.trim() || undefined,
        vatCondition: vatCondition.trim() || undefined,
        amount: Number(amount),
        type: type.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setCustomerName('');
      setCustomerTaxId('');
      setVatCondition('');
      setAmount('');
      setType('');
    },
  });

  const issueInvoice = useMutation({
    mutationFn: (id: string) => api.post<Invoice>(`${INV_BASE}/invoices/${id}/issue`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const deleteInvoice = useMutation({
    mutationFn: (id: string) => api.del(`${INV_BASE}/invoices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  return (
    <div className="stack">
      <h1>{t('admin.invoices.title')}</h1>
      <p className="muted">{t('admin.invoices.subtitle')}</p>

      <Card>
        <h3 style={{ marginTop: 0 }}>{t('admin.invoices.newInvoice')}</h3>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            createInvoice.mutate();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField label={t('admin.invoices.customerOptional')} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            <TextField label={t('admin.invoices.taxIdOptional')} value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} />
            <TextField label={t('admin.invoices.vatConditionOptional')} value={vatCondition} onChange={(e) => setVatCondition(e.target.value)} placeholder="responsable inscripto…" />
            <TextField label={t('admin.invoices.amount')} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <TextField label={t('admin.invoices.typeOptional')} value={type} onChange={(e) => setType(e.target.value)} placeholder="A, B, C…" />
          </div>
          <div className="row">
            <Button type="submit" disabled={createInvoice.isPending || !amount}>
              {t('admin.invoices.createInvoice')}
            </Button>
            {createInvoice.error && <span style={{ color: 'var(--ws-danger)' }}>{createInvoice.error.message}</span>}
          </div>
        </form>
      </Card>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h3 style={{ margin: 0 }}>{t('admin.invoices.invoices')}</h3>
          <TextField label={t('admin.invoices.filterByStatus')} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} placeholder="issued, paid…" />
        </div>
        {isLoading ? (
          <Spinner />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.invoices.number')}</th>
                <th>{t('admin.invoices.customer')}</th>
                <th>{t('admin.invoices.amount')}</th>
                <th>{t('common.status')}</th>
                <th>{t('admin.invoices.cae')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(invoices ?? []).map((inv) => {
                const color = STATUS_COLOR[inv.status] ?? 'var(--ws-surface-2)';
                const isMuted = color === 'var(--ws-surface-2)';
                return (
                  <tr key={inv.id}>
                    <td>
                      <code>{inv.number}</code>
                    </td>
                    <td>{inv.customerName ?? '—'}</td>
                    <td>
                      {inv.amount} {inv.currency}
                    </td>
                    <td>
                      <span className="badge" style={{ background: color, color: isMuted ? 'var(--ws-text-muted)' : '#fff' }}>
                        {inv.status}
                      </span>
                    </td>
                    <td>{inv.cae ? <code>{inv.cae}</code> : '—'}</td>
                    <td>
                      <div className="row">
                        {!inv.cae && (
                          <Button variant="secondary" onClick={() => issueInvoice.mutate(inv.id)} disabled={issueInvoice.isPending}>
                            {t('admin.invoices.issue')}
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => setConfirmInvoice(inv)}>
                          {t('common.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(invoices ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <p className="muted">{t('admin.invoices.noInvoices')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={confirmInvoice !== null}
        title={t('admin.invoices.deleteInvoice')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (confirmInvoice) deleteInvoice.mutate(confirmInvoice.id);
          setConfirmInvoice(null);
        }}
        onCancel={() => setConfirmInvoice(null)}
      >
        {t('admin.invoices.deleteConfirm', { number: confirmInvoice?.number })}
      </ConfirmDialog>
    </div>
  );
}
