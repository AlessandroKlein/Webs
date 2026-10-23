import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { getAccessToken } from '../../lib/token';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const INV_BASE = '/api/v1/plugins/facturacion';

interface Invoice {
  id: string;
  number: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  customerName: string | null;
  cae: string | null;
  createdAt: string;
}

function htmlUrl(id: string, download = false): string {
  return `${API_BASE}${INV_BASE}/invoices/${id}/html${download ? '?download=1' : ''}`;
}

async function fetchEscpos(id: string): Promise<string> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${INV_BASE}/invoices/${id}/escpos`, {
    credentials: 'include',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function money(inv: Invoice): string {
  return `${(inv.amount / 100).toFixed(2)} ${inv.currency}`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function MyInvoices({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [thermal, setThermal] = useState<{ id: string; text: string } | null>(null);
  const [thermalError, setThermalError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['my-invoices', userId, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ userId });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<Invoice[]>(`${INV_BASE}/invoices?${params.toString()}`);
    },
    enabled: !!userId,
  });

  const onThermal = async (inv: Invoice) => {
    setThermalError('');
    try {
      const text = await fetchEscpos(inv.id);
      setThermal({ id: inv.id, text });
    } catch (err) {
      setThermalError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{t('admin.account.myInvoices')}</h3>
        <div className="row" style={{ gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
          <TextField label={t('admin.invoices.from')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label={t('admin.invoices.to')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
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
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((inv) => (
              <tr key={inv.id}>
                <td>
                  <code>{inv.number}</code>
                  <div className="muted" style={{ fontSize: 'var(--ws-font-size-xs)' }}>
                    {dateLabel(inv.createdAt)}
                  </div>
                </td>
                <td>{inv.customerName ?? '—'}</td>
                <td>{money(inv)}</td>
                <td>{inv.status}</td>
                <td>
                  <div className="row" style={{ gap: 'var(--ws-space-1)', flexWrap: 'wrap' }}>
                    <Button variant="secondary" onClick={() => setPreviewId(inv.id)}>
                      {t('admin.invoices.preview')}
                    </Button>
                    <a
                      href={htmlUrl(inv.id, true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--ws-space-1)',
                        padding: 'var(--ws-space-2) var(--ws-space-3)',
                        borderRadius: 'var(--ws-radius-md)',
                        border: '1px solid var(--ws-border)',
                        color: 'var(--ws-text)',
                        textDecoration: 'none',
                        fontSize: 'var(--ws-font-size-sm)',
                      }}
                    >
                      <i className="bi bi-download" /> {t('admin.invoices.download')}
                    </a>
                    <Button variant="ghost" onClick={() => onThermal(inv)}>
                      <i className="bi bi-printer" /> {t('admin.invoices.thermal')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={5}>
                  <p className="muted">{t('admin.invoices.noInvoices')}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {thermalError && <p style={{ color: 'var(--ws-danger)' }}>{thermalError}</p>}

      {/* Vista previa HTML (iframe) */}
      {previewId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--ws-space-4)',
            zIndex: 1000,
          }}
          onClick={() => setPreviewId(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 'var(--ws-radius-lg)',
              overflow: 'hidden',
              width: '100%',
              maxWidth: 720,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: 'var(--ws-space-3)' }}>
              <strong>{t('admin.invoices.preview')}</strong>
              <Button variant="ghost" onClick={() => setPreviewId(null)}>
                ✕
              </Button>
            </div>
            <iframe title={t('admin.invoices.preview')} src={htmlUrl(previewId)} style={{ width: '100%', height: 600, border: 'none' }} />
          </div>
        </div>
      )}

      {/* Vista previa térmica (ESC/POS) */}
      {thermal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--ws-space-4)',
            zIndex: 1000,
          }}
          onClick={() => setThermal(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 'var(--ws-radius-lg)',
              overflow: 'hidden',
              width: '100%',
              maxWidth: 520,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: 'var(--ws-space-3)' }}>
              <strong>{t('admin.invoices.thermal')}</strong>
              <div className="row" style={{ gap: 'var(--ws-space-1)' }}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard?.writeText(thermal.text);
                  }}
                >
                  <i className="bi bi-clipboard" /> {t('common.copy')}
                </Button>
                <Button variant="ghost" onClick={() => setThermal(null)}>
                  ✕
                </Button>
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                padding: 'var(--ws-space-4)',
                overflow: 'auto',
                fontFamily: 'ui-monospace, "Courier New", monospace',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
              }}
            >
              {thermal.text}
            </pre>
          </div>
        </div>
      )}
    </Card>
  );
}
