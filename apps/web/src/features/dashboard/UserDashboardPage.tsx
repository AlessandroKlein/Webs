import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import i18next from '../../lib/i18n';
import { useAuthStore } from '../../lib/auth-store';
import type { AuthUser } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { QrCode } from '../../components/ui/QrCode';

// ── Tipos de datos de los plugins/endpoints ─────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  type: string | null;
  createdAt?: string;
}

interface Booking {
  id: string;
  serviceId: string;
  name: string;
  date: string;
  status: string;
  createdAt?: string;
}

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

interface InvoiceRow {
  id: string;
  number: string;
  paymentId: string | null;
}

interface Membership {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  plan: string | null;
  status: string;
  startDate: string;
  endDate: string | null;
  qrcode: string;
  organizationName: string;
  userName: string;
}

interface Order {
  id: string;
  status: string;
  total: number;
  items: unknown[];
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  features: unknown;
  active: boolean;
  createdAt?: string;
}

interface Subscription {
  id: string;
  userId: string;
  planId: string;
  planName: string;
  status: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

interface SubscribeResult {
  ok: boolean;
  subscription?: Subscription;
  requirePayment?: boolean;
  currency?: string;
}

interface PlanMembership {
  id: string;
  plan: string | null;
  status: string;
  startDate: string;
  endDate: string | null;
}

// ── Estado local de navegación del panel ────────────────────────────────

type View =
  | 'summary'
  | 'routine'
  | 'calendar'
  | 'bookings'
  | 'pendingPayments'
  | 'payments'
  | 'memberships'
  | 'plans'
  | 'orders';

const SECTIONS: Array<{ key: View; label: string; icon: string }> = [
  { key: 'summary', label: 'dashboard.summary', icon: 'bi-house' },
  { key: 'routine', label: 'dashboard.myRoutine', icon: 'bi-clipboard2-pulse' },
  { key: 'calendar', label: 'dashboard.calendar', icon: 'bi-calendar3' },
  { key: 'bookings', label: 'dashboard.bookings', icon: 'bi-calendar-check' },
  { key: 'pendingPayments', label: 'dashboard.pendingPayments', icon: 'bi-hourglass-split' },
  { key: 'payments', label: 'dashboard.paymentHistory', icon: 'bi-credit-card' },
  { key: 'memberships', label: 'dashboard.subscriptions', icon: 'bi-award' },
  { key: 'plans', label: 'dashboard.plans', icon: 'bi-gem' },
  { key: 'orders', label: 'dashboard.myPurchases', icon: 'bi-bag' },
];

// ── Utilidades de formato ───────────────────────────────────────────────

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;

const formatDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-AR') : '—');

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
}

function groupEventsByDate(events: CalendarEvent[]): Array<{ date: string; items: CalendarEvent[] }> {
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of sorted) {
    const key = new Date(ev.start).toLocaleDateString('es-AR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const arr = map.get(key) ?? [];
    arr.push(ev);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

/** Decodifica el `type` de una clase (JSON con cupos/recurrencia) a una etiqueta legible. */
function eventTypeLabel(type: string | null): string {
  if (!type) return '';
  if (type.startsWith('{')) {
    try {
      const meta = JSON.parse(type) as { kind?: string; slots?: number; occurrence?: number; total?: number };
      const label = meta.kind ?? i18next.t('dashboard.clase');
      const parts = [label];
      if (meta.slots !== undefined) parts.push(i18next.t('dashboard.slots', { n: meta.slots }));
      if (meta.total !== undefined && meta.total > 1 && meta.occurrence !== undefined) {
        parts.push(`${meta.occurrence}/${meta.total}`);
      }
      return parts.join(' · ');
    } catch {
      return type;
    }
  }
  return type;
}

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Comprobante simple generado en el cliente (cuando no existe factura): abre una
 * pestaña imprimible para que el usuario lo guarde como PDF.
 */
function openSimpleReceipt(p: PaymentRow) {
  const date = new Date(p.createdAt).toLocaleString('es-AR');
  const amount = (p.amount / 100).toFixed(2);
  const html = `<!doctype html>
<html lang="${i18next.language.split('-')[0]}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${i18next.t('dashboard.receiptTitle2')} ${escHtml(p.transactionId || p.id)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; margin: 0; background: #f6f7f9; }
  .doc { max-width: 640px; margin: 24px auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(0,0,0,0.08); }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .meta { color: #6b7280; font-size: 14px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 8px 4px; border-bottom: 1px solid #e5e7eb; }
  td:last-child { text-align: right; }
  .amount { font-size: 28px; font-weight: 700; margin: 16px 0; }
  .note { color: #6b7280; font-size: 12px; margin-top: 20px; }
  @media print { body { background: #fff; } .doc { box-shadow: none; margin: 0; } }
</style>
</head>
<body>
<div class="doc">
  <h1>${i18next.t('dashboard.receiptHeading')}</h1>
  <div class="meta">${date}</div>
  <table>
    <tr><td>${i18next.t('dashboard.receiptReference')}</td><td>${escHtml(p.transactionId || p.id)}</td></tr>
    <tr><td>${i18next.t('dashboard.receiptProvider')}</td><td>${escHtml(p.provider)}</td></tr>
    <tr><td>${i18next.t('dashboard.receiptStatus')}</td><td>${escHtml(p.status)}</td></tr>
  </table>
  <div class="amount">${escHtml(p.currency)} ${amount}</div>
  <div class="note">${i18next.t('dashboard.receiptNote')}</div>
</div>
</body>
</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ── Etiquetas/colores de estado ─────────────────────────────────────────

const PAYMENT_STATUS_KEY: Record<string, string> = {
  pending: 'status.pending',
  approved: 'status.approved',
  rejected: 'status.rejected',
  refunded: 'status.refunded',
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--ws-warning)',
  approved: 'var(--ws-success)',
  rejected: 'var(--ws-danger)',
  refunded: 'var(--ws-text-muted)',
};

const ORDER_STATUS_KEY: Record<string, string> = {
  pending: 'status.pending',
  paid: 'status.paid',
  preparing: 'status.preparing',
  processing: 'status.processing',
  shipped: 'status.shipped',
  delivered: 'status.delivered',
  cancelled: 'status.cancelled',
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--ws-warning)',
  paid: 'var(--ws-success)',
  preparing: 'var(--ws-primary)',
  processing: 'var(--ws-primary)',
  shipped: 'var(--ws-primary)',
  delivered: 'var(--ws-success)',
  cancelled: 'var(--ws-danger)',
};

const BOOKING_STATUS_KEY: Record<string, string> = {
  confirmed: 'status.confirmed',
  cancelled: 'status.cancelled',
  pending: 'status.pending',
};

const BOOKING_STATUS_COLOR: Record<string, string> = {
  confirmed: 'var(--ws-success)',
  cancelled: 'var(--ws-danger)',
  pending: 'var(--ws-warning)',
};

function membershipStatusColor(status: string): string {
  if (status === 'active') return 'var(--ws-success)';
  if (status === 'paused') return 'var(--ws-warning)';
  if (status === 'expired') return 'var(--ws-danger)';
  return 'var(--ws-text-muted)';
}

function StatusBadge({ label, color }: { label: string; color?: string }) {
  const bg = color ?? 'var(--ws-surface-2)';
  const isMuted = bg === 'var(--ws-surface-2)';
  return (
    <span className="badge" style={{ background: bg, color: isMuted ? 'var(--ws-text-muted)' : '#fff' }}>
      {label}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </Card>
  );
}

// ── Página principal ────────────────────────────────────────────────────

export function UserDashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<View>('summary');

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--ws-space-6)', width: '100%' }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
        <aside
          className="stack"
          style={{
            width: 240,
            flexShrink: 0,
            background: 'var(--ws-surface)',
            border: '1px solid var(--ws-border)',
            borderRadius: 'var(--ws-radius-lg)',
            padding: 'var(--ws-space-4)',
          }}
        >
          <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('dashboard.title')}</h1>
          {user?.email ? (
            <p className="muted" style={{ margin: 0, wordBreak: 'break-all' }}>
              <i className="bi bi-envelope" /> {user.email}
            </p>
          ) : null}
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`nav-link ${view === s.key ? 'active' : ''}`}
              style={{
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--ws-space-2)',
              }}
              onClick={() => setView(s.key)}
            >
              <i className={`bi ${s.icon}`} /> {s.label}
            </button>
          ))}
        </aside>

        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
          {view === 'summary' && <SummaryView user={user} onNavigate={setView} />}
          {view === 'routine' && <RoutineSection user={user} />}
          {view === 'calendar' && <CalendarSection user={user} />}
          {view === 'bookings' && <BookingsSection />}
          {view === 'pendingPayments' && <PendingPaymentsSection />}
          {view === 'payments' && <PaymentsHistorySection />}
          {view === 'memberships' && <MembershipsSection user={user} />}
          {view === 'plans' && <PlansSection user={user} />}
          {view === 'orders' && <OrdersSection />}
        </div>
      </div>
    </div>
  );
}

// ── Resumen ─────────────────────────────────────────────────────────────

function SummaryView({ user, onNavigate }: { user: AuthUser | null; onNavigate: (v: View) => void }) {
  const { t } = useTranslation();
  const name = user?.displayName ?? user?.email ?? t('common.user');

  return (
    <>
      <Card>
        <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-4)' }}>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt="Avatar"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--ws-border)' }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'var(--ws-primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                fontWeight: 700,
              }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="stack" style={{ gap: 2 }}>
            <h2 style={{ margin: 0 }}>{t('dashboard.hello', { name })}</h2>
            {user?.email ? (
              <p className="muted" style={{ margin: 0 }}>
                <i className="bi bi-envelope" /> {user.email}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>{t('dashboard.quickAccess')}</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
          {SECTIONS.filter((s) => s.key !== 'summary').map((s) => (
            <Button key={s.key} variant="secondary" onClick={() => onNavigate(s.key)}>
              <i className={`bi ${s.icon}`} /> {t(s.label)}
            </Button>
          ))}
        </div>
      </Card>
    </>
  );
}

// ── Calendario ──────────────────────────────────────────────────────────

function CalendarSection({ user }: { user: AuthUser | null }) {
  const { t } = useTranslation();
  const userId = user?.id ?? '';
  const { data: events, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-calendar'],
    queryFn: () => api.get<CalendarEvent[]>('/api/v1/blocks/calendario/events'),
    retry: 0,
  });

  const { data: plan } = useQuery({
    queryKey: ['user-dashboard-plan', userId],
    queryFn: () => api.get<PlanMembership | null>(`/api/v1/blocks/suscripciones/my?userId=${userId}`),
    enabled: !!userId,
    retry: 0,
  });

  const groups = groupEventsByDate(events ?? []);

  return (
    <SectionCard title={t('dashboard.calendar')}>
      {/* Vencimiento del plan */}
      <div
        style={{
          padding: 'var(--ws-space-3)',
          background: 'var(--ws-primary-soft, rgba(37, 99, 235, 0.08))',
          border: '1px solid var(--ws-border)',
          borderRadius: 'var(--ws-radius-md)',
          marginBottom: 'var(--ws-space-4)',
        }}
      >
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
          <span>
            <strong>
              <i className="bi bi-calendar3" /> {t('dashboard.plan')} {plan?.plan ?? '—'}
            </strong>
            {plan?.status ? <span className="muted"> · {plan.status}</span> : null}
          </span>
          <span style={{ fontWeight: 600 }}>
            {t('dashboard.expires')} {plan?.endDate ? formatDate(plan.endDate) : '—'}
          </span>
        </div>
      </div>

      {isLoading ? (
        <Spinner label={t('dashboard.loadingCalendar')} />
      ) : isError ? (
        <p className="muted">{t('dashboard.noCalendar')}</p>
      ) : groups.length === 0 ? (
        <p className="muted">{t('dashboard.noEvents')}</p>
      ) : (
        <div className="stack">
          {groups.map((g) => (
            <div key={g.date}>
              <h3 style={{ fontSize: 'var(--ws-font-size-md)', margin: 'var(--ws-space-3) 0 var(--ws-space-2)' }}>{g.date}</h3>
              <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
                {g.items.map((ev) => (
                  <div key={ev.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                      <strong>{ev.title}</strong>
                      {ev.type ? <span className="badge">{eventTypeLabel(ev.type)}</span> : null}
                    </div>
                    <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
                      <i className="bi bi-clock" /> {formatDateTime(ev.start)}
                      {ev.end ? ` → ${formatDateTime(ev.end)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Reservas ────────────────────────────────────────────────────────────

function BookingsSection() {
  const { t } = useTranslation();
  const { data: bookings, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-bookings'],
    queryFn: () => api.get<Booking[]>('/api/v1/blocks/reservas/bookings'),
    retry: 0,
  });

  return (
    <SectionCard title={t('dashboard.bookings')}>
      {isLoading ? (
        <Spinner label={t('dashboard.loadingBookings')} />
      ) : isError ? (
        <p className="muted">{t('dashboard.noBookings')}</p>
      ) : (bookings ?? []).length === 0 ? (
        <p className="muted">{t('dashboard.noBookingsData')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('common.name')}</th>
              <th>{t('dashboard.service')}</th>
              <th>{t('common.status')}</th>
            </tr>
          </thead>
          <tbody>
            {(bookings ?? []).map((b) => (
              <tr key={b.id}>
                <td>{new Date(b.date).toLocaleString('es-AR')}</td>
                <td>{b.name}</td>
                <td>
                  <code>{b.serviceId}</code>
                </td>
                <td>
                  <StatusBadge
                    label={t(BOOKING_STATUS_KEY[b.status] ?? b.status)}
                    color={BOOKING_STATUS_COLOR[b.status]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

// ── Pagos pendientes ────────────────────────────────────────────────────

function ContinuePaymentDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<PaymentProvider[] | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(payment.provider || null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [paying, setPaying] = useState(false);

  const loadProviders = async () => {
    setLoadingProviders(true);
    setError(null);
    try {
      const list = await api.get<PaymentProvider[]>('/api/v1/payments/providers');
      if (!list || list.length === 0) {
        setProviders(null);
        setError(t('dashboard.noPaymentMethods'));
        return;
      }
      setProviders(list);
      setSelectedProvider((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id ?? null));
    } catch {
      setProviders(null);
      setError(t('dashboard.noPaymentMethods'));
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    void loadProviders();
  }, []);

  const pay = async () => {
    if (!selectedProvider) return;
    setPaying(true);
    setError(null);
    try {
      const res = await api.post<CheckoutResult>('/api/v1/payments/checkout', {
        provider: selectedProvider,
        amount: payment.amount,
        currency: payment.currency,
        description: t('dashboard.retryPayment', { id: payment.transactionId || payment.id }),
        externalReference: payment.externalReference ?? `retomar-${payment.id}`,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dashboard.paymentError'));
    } finally {
      setPaying(false);
    }
  };

  const hasReference = Boolean(payment.externalReference || payment.transactionId);

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--ws-surface)',
          border: '1px solid var(--ws-border)',
          borderRadius: 'var(--ws-radius-lg)',
          boxShadow: 'var(--ws-shadow-lg)',
          maxWidth: 480,
          width: '100%',
          maxHeight: '88vh',
          overflow: 'auto',
          padding: 'var(--ws-space-5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
          <h3 style={{ margin: 0 }}>{hasReference ? t('dashboard.resumePayment') : t('dashboard.continuePayment')}</h3>

          <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
            <p style={{ margin: 0 }}>
              <strong>{t('dashboard.id')}</strong> <code>{payment.id}</code>
            </p>
            {payment.transactionId && (
              <p style={{ margin: 0 }}>
                <strong>{t('dashboard.transaction')}</strong> <code>{payment.transactionId}</code>
              </p>
            )}
            <p style={{ margin: 0 }}>
              <strong>{t('dashboard.amount')}</strong> {money(payment.amount, payment.currency)}
            </p>
          </div>

          {error && (
            <div
              style={{
                padding: 'var(--ws-space-2) var(--ws-space-3)',
                background: 'rgba(220, 38, 38, 0.12)',
                color: 'var(--ws-danger)',
                borderRadius: 'var(--ws-radius-md)',
                fontSize: 'var(--ws-font-size-sm)',
              }}
            >
              {error}
            </div>
          )}

          {result ? (
            <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
              {result.paymentUrl ? (
                <a
                  href={result.paymentUrl}
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
                  <i className="bi bi-box-arrow-up-right" /> {t('dashboard.payNow')}
                </a>
              ) : result.qr ? (
                <div className="stack" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                    {t('dashboard.scanQr')}
                  </span>
                  <QrCode value={result.qr} />
                </div>
              ) : (
                <div style={{ padding: 'var(--ws-space-3)', background: 'var(--ws-primary-soft)', borderRadius: 'var(--ws-radius-md)' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                    <i className="bi bi-hourglass-split" /> {t('dashboard.paymentPending')}
                  </strong>
                  <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
                    {t('dashboard.transactionCode')} <code>{result.transactionId}</code>
                  </p>
                </div>
              )}

              <Button variant="secondary" style={{ width: '100%' }} onClick={onClose}>
                {t('dashboard.understood')}
              </Button>
            </div>
          ) : loadingProviders ? (
            <Spinner label={t('dashboard.searchingMethods')} />
          ) : providers ? (
            <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{t('dashboard.chooseMethod')}</span>
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
              <div className="row" style={{ gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-2)' }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button style={{ flex: 1 }} onClick={pay} disabled={paying || !selectedProvider}>
                  {paying ? t('dashboard.startingPayment') : t('dashboard.pay')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{t('dashboard.noPaymentMethodsDot')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingPaymentsSection() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-pending-payments'],
    queryFn: () => api.get<PaymentRow[]>('/api/v1/payments?status=pending'),
    retry: 0,
  });

  return (
    <SectionCard title={t('dashboard.pendingPayments')}>
      {isLoading ? (
        <Spinner label={t('dashboard.loadingPending')} />
      ) : isError ? (
        <p className="muted">{t('dashboard.noPending')}</p>
      ) : (payments ?? []).length === 0 ? (
        <p className="muted">{t('dashboard.noPendingData')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('dashboard.reference')}</th>
              <th>{t('dashboard.amountHeader')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => {
              const hasReference = Boolean(p.externalReference || p.transactionId);
              return (
                <tr key={p.id}>
                  <td>
                    <code style={{ fontSize: '0.85em' }}>{p.transactionId || p.id}</code>
                  </td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>
                    <Button variant="secondary" onClick={() => setSelected(p)}>
                      {hasReference ? t('dashboard.resumePayment') : t('dashboard.continuePayment')}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selected && <ContinuePaymentDialog payment={selected} onClose={() => setSelected(null)} />}
    </SectionCard>
  );
}

// ── Historial de pagos ──────────────────────────────────────────────────

function PaymentsHistorySection() {
  const { t } = useTranslation();
  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-payments'],
    queryFn: () => api.get<PaymentRow[]>('/api/v1/payments'),
    retry: 0,
  });

  // Vincula cada pago con su factura (si existe) para ofrecer el comprobante.
  const { data: invoices } = useQuery({
    queryKey: ['user-dashboard-invoices'],
    queryFn: () => api.get<InvoiceRow[]>('/api/v1/blocks/facturacion/invoices'),
    retry: 0,
  });

  const invoiceByPayment = new Map<string, InvoiceRow>();
  for (const inv of invoices ?? []) {
    if (inv.paymentId) invoiceByPayment.set(inv.paymentId, inv);
  }

  return (
    <SectionCard title={t('dashboard.paymentHistory')}>
      {isLoading ? (
        <Spinner label={t('dashboard.loadingHistory')} />
      ) : isError ? (
        <p className="muted">{t('dashboard.noHistory')}</p>
      ) : (payments ?? []).length === 0 ? (
        <p className="muted">{t('dashboard.noHistoryData')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('dashboard.amountHeader')}</th>
              <th>{t('common.status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => {
              const invoice = invoiceByPayment.get(p.id);
              return (
                <tr key={p.id}>
                  <td>{new Date(p.createdAt).toLocaleString('es-AR')}</td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>
                    <StatusBadge
                      label={t(PAYMENT_STATUS_KEY[p.status] ?? p.status)}
                      color={PAYMENT_STATUS_COLOR[p.status]}
                    />
                  </td>
                  <td>
                    {invoice ? (
                      <a
                        href={`/api/v1/blocks/facturacion/invoices/${invoice.id}/html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('dashboard.receiptTitle')}
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
                          cursor: 'pointer',
                        }}
                      >
                        <i className="bi bi-download" /> {t('dashboard.downloadReceipt')}
                      </a>
                    ) : (
                      <Button variant="secondary" onClick={() => openSimpleReceipt(p)}>
                        <i className="bi bi-download" /> {t('dashboard.downloadReceipt')}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

// ── Suscripciones ───────────────────────────────────────────────────────

function MembershipsSection({ user }: { user: AuthUser | null }) {
  const { t } = useTranslation();
  const { data: memberships, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-memberships'],
    queryFn: () => api.get<Membership[]>('/api/v1/blocks/organizaciones/memberships'),
    retry: 0,
  });

  const mine = (memberships ?? []).filter((m) => {
    if (!user) return false;
    return m.userId === user.id || m.userName === user.email || m.userName === (user.displayName ?? '');
  });

  return (
    <SectionCard title={t('dashboard.subscriptions')}>
      {isLoading ? (
        <Spinner label={t('dashboard.loadingSubscriptions')} />
      ) : isError ? (
        <p className="muted">{t('dashboard.noSubscriptions')}</p>
      ) : mine.length === 0 ? (
        <p className="muted">{t('dashboard.noSubscriptionsData')}</p>
      ) : (
        <div className="stack">
          {mine.map((m) => (
            <div key={m.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                <strong>{m.organizationName}</strong>
                <StatusBadge label={m.status} color={membershipStatusColor(m.status)} />
              </div>
              <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
                {t('dashboard.membershipLine', { plan: m.plan ?? '—', role: m.role, start: formatDate(m.startDate) })}
                {m.endDate ? ` ${t('dashboard.until', { date: formatDate(m.endDate) })}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Planes / Suscripción ────────────────────────────────────────────────

const SUBSCRIPTION_STATUS_KEY: Record<string, string> = {
  active: 'status.active',
  cancelled: 'status.cancelled',
  expired: 'status.expired',
};

const SUBSCRIPTION_STATUS_COLOR: Record<string, string> = {
  active: 'var(--ws-success)',
  cancelled: 'var(--ws-danger)',
  expired: 'var(--ws-warning)',
};

function asPlanFeatures(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function PlansSection({ user }: { user: AuthUser | null }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = user?.id ?? '';

  const { data: plans, isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ['user-suscripciones-plans'],
    queryFn: () => api.get<Plan[]>('/api/v1/blocks/suscripciones/plans'),
    retry: 0,
  });

  const { data: my, isLoading: myLoading } = useQuery({
    queryKey: ['user-suscripciones-my', userId],
    queryFn: () => api.get<Subscription | null>(`/api/v1/blocks/suscripciones/my?userId=${userId}`),
    enabled: !!userId,
    retry: 0,
  });

  const subscribe = useMutation({
    mutationFn: (planId: string) =>
      api.post<SubscribeResult>('/api/v1/blocks/suscripciones/subscribe', { userId, planId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['user-suscripciones-my'] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/api/v1/blocks/suscripciones/subscriptions/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['user-suscripciones-my'] });
    },
  });

  return (
    <SectionCard title={t('dashboard.plansTitle')}>
      {/* Suscripción actual */}
      {myLoading ? (
        <Spinner label={t('dashboard.loadingSubscription')} />
      ) : my ? (
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--ws-space-3)',
            flexWrap: 'wrap',
            marginBottom: 'var(--ws-space-4)',
          }}
        >
          <div className="stack" style={{ gap: 2 }}>
            <strong>{my.planName}</strong>
            <p className="muted" style={{ margin: 0 }}>
              <StatusBadge
                label={t(SUBSCRIPTION_STATUS_KEY[my.status] ?? my.status)}
                color={SUBSCRIPTION_STATUS_COLOR[my.status]}
              />{' '}
              {t('dashboard.since', { date: formatDate(my.startDate) })}
              {my.endDate ? ` · ${t('dashboard.expiresOn', { date: formatDate(my.endDate) })}` : ''}
            </p>
          </div>
          {my.status === 'active' && (
            <Button variant="secondary" onClick={() => cancel.mutate(my.id)} disabled={cancel.isPending}>
              {t('dashboard.cancelSubscription')}
            </Button>
          )}
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 'var(--ws-space-4)' }}>
          {t('dashboard.noActiveSubscription')}
        </p>
      )}

      {/* Planes disponibles */}
      {plansLoading ? (
        <Spinner label={t('dashboard.loadingPlans')} />
      ) : plansError ? (
        <p className="muted">{t('dashboard.noPlans')}</p>
      ) : (plans ?? []).length === 0 ? (
        <p className="muted">{t('dashboard.noPlansData')}</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 'var(--ws-space-4)',
          }}
        >
          {(plans ?? []).map((p) => (
            <div
              key={p.id}
              style={{
                border: '1px solid var(--ws-border)',
                borderRadius: 'var(--ws-radius-lg)',
                padding: 'var(--ws-space-4)',
                background: 'var(--ws-surface-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--ws-space-2)',
              }}
            >
              <strong style={{ fontSize: 'var(--ws-font-size-lg)' }}>{p.name}</strong>
              <span style={{ fontWeight: 700 }}>{money(p.price, 'ARS')}</span>
              <span className="muted">{t('dashboard.days', { count: p.durationDays })}</span>
              {asPlanFeatures(p.features).length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 'var(--ws-space-4)' }}>
                  {asPlanFeatures(p.features).map((f) => (
                    <li key={f} className="muted">
                      {f}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                style={{ marginTop: 'auto' }}
                onClick={() => navigate(`/checkout?kind=subscription&planId=${p.id}`)}
                disabled={subscribe.isPending || !!my}
              >
                {t('dashboard.subscribe')}
              </Button>
            </div>
          ))}
        </div>
      )}
      {subscribe.isError && (
        <p className="muted" style={{ color: 'var(--ws-danger)', marginTop: 'var(--ws-space-3)' }}>
          {t('dashboard.subscribeError')}
        </p>
      )}
      {subscribe.data?.requirePayment && (
        <p className="muted" style={{ color: 'var(--ws-primary)', marginTop: 'var(--ws-space-3)' }}>
          <i className="bi bi-credit-card" /> {t('dashboard.requiresPayment')}
        </p>
      )}
    </SectionCard>
  );
}

// ── Mi rutina ───────────────────────────────────────────────────────────

interface RoutineRow {
  id: string;
  name: string;
  description: string | null;
  exercises: unknown;
  status: string;
  createdAt: string;
}

function routineExercises(v: unknown): Array<{ name: string; detail: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ name: string; detail: string }> = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const ex = raw as Record<string, unknown>;
    const name = typeof ex.name === 'string' && ex.name.trim() ? ex.name.trim() : i18next.t('dashboard.exercise');
    const parts: string[] = [];
    if (ex.sets !== undefined && ex.sets !== null && ex.sets !== '') parts.push(i18next.t('dashboard.sets', { n: String(ex.sets) }));
    if (ex.reps !== undefined && ex.reps !== null && ex.reps !== '') parts.push(i18next.t('dashboard.reps', { n: String(ex.reps) }));
    out.push({ name, detail: parts.length ? parts.join(' · ') : '—' });
  }
  return out;
}

function RoutineSection({ user }: { user: AuthUser | null }) {
  const { t } = useTranslation();
  const userId = user?.id ?? '';
  const { data: routines, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-routines', userId],
    queryFn: () => api.get<RoutineRow[]>(`/api/v1/blocks/academia/routines?memberId=${encodeURIComponent(userId)}`),
    enabled: !!userId,
    retry: 0,
  });

  return (
    <SectionCard title={t('dashboard.myRoutine')}>
      {isLoading ? (
        <Spinner label={t('dashboard.loadingRoutines')} />
      ) : isError ? (
        <p className="muted">{t('dashboard.noRoutines')}</p>
      ) : (routines ?? []).length === 0 ? (
        <p className="muted">{t('dashboard.noRoutinesData')}</p>
      ) : (
        <div className="stack">
          {(routines ?? []).map((r) => (
            <div key={r.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                <strong>{r.name}</strong>
                {r.status ? <StatusBadge label={r.status} /> : null}
              </div>
              {r.description ? (
                <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>{r.description}</p>
              ) : null}
              <div className="stack" style={{ gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-2)' }}>
                {routineExercises(r.exercises).map((ex, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'var(--ws-surface-2)',
                      border: '1px solid var(--ws-border)',
                      borderRadius: 'var(--ws-radius-md)',
                      padding: 'var(--ws-space-3)',
                    }}
                  >
                    <strong>{ex.name}</strong>
                    <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>{ex.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Mis compras ─────────────────────────────────────────────────────────

function OrdersSection() {
  const { t } = useTranslation();
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-orders'],
    queryFn: () => api.get<Order[]>('/api/v1/blocks/ecommerce/orders'),
    retry: 0,
  });

  return (
    <SectionCard title={t('dashboard.myPurchases')}>
      {isLoading ? (
        <Spinner label={t('dashboard.loadingOrders')} />
      ) : isError ? (
        <p className="muted">{t('dashboard.noOrders')}</p>
      ) : (orders ?? []).length === 0 ? (
        <p className="muted">{t('dashboard.noOrdersData')}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.date')}</th>
              <th>{t('common.status')}</th>
              <th>{t('dashboard.total')}</th>
              <th>{t('dashboard.items')}</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td>{new Date(o.createdAt).toLocaleDateString('es-AR')}</td>
                <td>
                  <StatusBadge
                    label={t(ORDER_STATUS_KEY[o.status] ?? o.status)}
                    color={ORDER_STATUS_COLOR[o.status]}
                  />
                </td>
                <td>${o.total}</td>
                <td>{o.items?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
