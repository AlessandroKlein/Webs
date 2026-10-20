import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import type { AuthUser } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { QrCode } from '../../components/ui/QrCode';

// ── Tipos de datos de los bloques/endpoints ─────────────────────────────

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
  { key: 'summary', label: 'Resumen', icon: 'bi-house' },
  { key: 'routine', label: 'Mi rutina', icon: 'bi-clipboard2-pulse' },
  { key: 'calendar', label: 'Calendario', icon: 'bi-calendar3' },
  { key: 'bookings', label: 'Reservas', icon: 'bi-calendar-check' },
  { key: 'pendingPayments', label: 'Pagos pendientes', icon: 'bi-hourglass-split' },
  { key: 'payments', label: 'Historial de pagos', icon: 'bi-credit-card' },
  { key: 'memberships', label: 'Suscripciones', icon: 'bi-award' },
  { key: 'plans', label: 'Planes', icon: 'bi-gem' },
  { key: 'orders', label: 'Mis compras', icon: 'bi-bag' },
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

// ── Etiquetas/colores de estado ─────────────────────────────────────────

const PAYMENT_STATUS_ES: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  refunded: 'Reembolsado',
};

const PAYMENT_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--ws-warning)',
  approved: 'var(--ws-success)',
  rejected: 'var(--ws-danger)',
  refunded: 'var(--ws-text-muted)',
};

const ORDER_STATUS_ES: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  preparing: 'En preparación',
  processing: 'En proceso',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
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

const BOOKING_STATUS_ES: Record<string, string> = {
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  pending: 'Pendiente',
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
          <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Mi panel</h1>
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
          {view === 'calendar' && <CalendarSection />}
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
  const name = user?.displayName ?? user?.email ?? 'Usuario';

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
            <h2 style={{ margin: 0 }}>¡Hola, {name}!</h2>
            {user?.email ? (
              <p className="muted" style={{ margin: 0 }}>
                <i className="bi bi-envelope" /> {user.email}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Accesos rápidos</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
          {SECTIONS.filter((s) => s.key !== 'summary').map((s) => (
            <Button key={s.key} variant="secondary" onClick={() => onNavigate(s.key)}>
              <i className={`bi ${s.icon}`} /> {s.label}
            </Button>
          ))}
        </div>
      </Card>
    </>
  );
}

// ── Calendario ──────────────────────────────────────────────────────────

function CalendarSection() {
  const { data: events, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-calendar'],
    queryFn: () => api.get<CalendarEvent[]>('/api/v1/blocks/calendario/events'),
    retry: 0,
  });

  const groups = groupEventsByDate(events ?? []);

  return (
    <SectionCard title="Calendario">
      {isLoading ? (
        <Spinner label="Cargando calendario…" />
      ) : isError ? (
        <p className="muted">No disponible: el bloque de calendario no está instalado.</p>
      ) : groups.length === 0 ? (
        <p className="muted">Sin datos: todavía no hay eventos programados.</p>
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
                      {ev.type ? <span className="badge">{ev.type}</span> : null}
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
  const { data: bookings, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-bookings'],
    queryFn: () => api.get<Booking[]>('/api/v1/blocks/reservas/bookings'),
    retry: 0,
  });

  return (
    <SectionCard title="Reservas">
      {isLoading ? (
        <Spinner label="Cargando reservas…" />
      ) : isError ? (
        <p className="muted">No disponible: el bloque de reservas no está instalado.</p>
      ) : (bookings ?? []).length === 0 ? (
        <p className="muted">Sin datos: no tenés reservas.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Nombre</th>
              <th>Servicio</th>
              <th>Estado</th>
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
                    label={BOOKING_STATUS_ES[b.status] ?? b.status}
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
        setError('No hay métodos de pago configurados');
        return;
      }
      setProviders(list);
      setSelectedProvider((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id ?? null));
    } catch {
      setProviders(null);
      setError('No hay métodos de pago configurados');
    } finally {
      setLoadingProviders(false);
    }
  };

  useEffect(() => {
    void loadProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        description: `Retomar pago · ${payment.transactionId || payment.id}`,
        externalReference: payment.externalReference ?? `retomar-${payment.id}`,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar el pago');
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
          <h3 style={{ margin: 0 }}>{hasReference ? 'Retomar pago' : 'Continuar pago'}</h3>

          <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
            <p style={{ margin: 0 }}>
              <strong>ID:</strong> <code>{payment.id}</code>
            </p>
            {payment.transactionId && (
              <p style={{ margin: 0 }}>
                <strong>Transacción:</strong> <code>{payment.transactionId}</code>
              </p>
            )}
            <p style={{ margin: 0 }}>
              <strong>Monto:</strong> {money(payment.amount, payment.currency)}
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
                  <i className="bi bi-box-arrow-up-right" /> Pagar ahora
                </a>
              ) : result.qr ? (
                <div className="stack" style={{ gap: 'var(--ws-space-2)', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                    Escaneá el código QR para completar el pago:
                  </span>
                  <QrCode value={result.qr} />
                </div>
              ) : (
                <div style={{ padding: 'var(--ws-space-3)', background: 'var(--ws-primary-soft)', borderRadius: 'var(--ws-radius-md)' }}>
                  <strong style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                    <i className="bi bi-hourglass-split" /> Pago pendiente
                  </strong>
                  <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
                    Código de transacción: <code>{result.transactionId}</code>
                  </p>
                </div>
              )}

              <Button variant="secondary" style={{ width: '100%' }} onClick={onClose}>
                Entendido
              </Button>
            </div>
          ) : loadingProviders ? (
            <Spinner label="Buscando métodos de pago…" />
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
              <div className="row" style={{ gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-2)' }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={onClose}>
                  Cancelar
                </Button>
                <Button style={{ flex: 1 }} onClick={pay} disabled={paying || !selectedProvider}>
                  {paying ? 'Iniciando pago…' : 'Pagar'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No hay métodos de pago configurados.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingPaymentsSection() {
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-pending-payments'],
    queryFn: () => api.get<PaymentRow[]>('/api/v1/payments?status=pending'),
    retry: 0,
  });

  return (
    <SectionCard title="Pagos pendientes">
      {isLoading ? (
        <Spinner label="Cargando pagos pendientes…" />
      ) : isError ? (
        <p className="muted">No disponible: no se pudieron cargar los pagos pendientes.</p>
      ) : (payments ?? []).length === 0 ? (
        <p className="muted">Sin datos: no tenés pagos pendientes.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Referencia</th>
              <th>Monto</th>
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
                      {hasReference ? 'Retomar pago' : 'Continuar pago'}
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
    <SectionCard title="Historial de pagos">
      {isLoading ? (
        <Spinner label="Cargando historial…" />
      ) : isError ? (
        <p className="muted">No disponible: no se pudo cargar el historial de pagos.</p>
      ) : (payments ?? []).length === 0 ? (
        <p className="muted">Sin datos: no tenés pagos registrados.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Monto</th>
              <th>Estado</th>
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
                      label={PAYMENT_STATUS_ES[p.status] ?? p.status}
                      color={PAYMENT_STATUS_COLOR[p.status]}
                    />
                  </td>
                  <td>
                    {invoice && (
                      <a
                        href={`/api/v1/blocks/facturacion/invoices/${invoice.id}/html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abre el comprobante en una pestaña nueva para imprimirlo a PDF"
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
                        <i className="bi bi-download" /> Descargar
                      </a>
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
    <SectionCard title="Suscripciones">
      {isLoading ? (
        <Spinner label="Cargando suscripciones…" />
      ) : isError ? (
        <p className="muted">No disponible: el bloque de organizaciones no está instalado.</p>
      ) : mine.length === 0 ? (
        <p className="muted">Sin suscripciones.</p>
      ) : (
        <div className="stack">
          {mine.map((m) => (
            <div key={m.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                <strong>{m.organizationName}</strong>
                <StatusBadge label={m.status} color={membershipStatusColor(m.status)} />
              </div>
              <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
                Plan: {m.plan ?? '—'} · Rol: {m.role} · Desde {formatDate(m.startDate)}
                {m.endDate ? ` hasta ${formatDate(m.endDate)}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// ── Planes / Suscripción ────────────────────────────────────────────────

const SUBSCRIPTION_STATUS_ES: Record<string, string> = {
  active: 'Activa',
  cancelled: 'Cancelada',
  expired: 'Vencida',
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
  const qc = useQueryClient();
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
    <SectionCard title="Planes / Suscripción">
      {/* Suscripción actual */}
      {myLoading ? (
        <Spinner label="Cargando tu suscripción…" />
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
                label={SUBSCRIPTION_STATUS_ES[my.status] ?? my.status}
                color={SUBSCRIPTION_STATUS_COLOR[my.status]}
              />{' '}
              Desde {formatDate(my.startDate)}
              {my.endDate ? ` · Vence ${formatDate(my.endDate)}` : ''}
            </p>
          </div>
          {my.status === 'active' && (
            <Button variant="secondary" onClick={() => cancel.mutate(my.id)} disabled={cancel.isPending}>
              Cancelar suscripción
            </Button>
          )}
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 'var(--ws-space-4)' }}>
          No tenés una suscripción activa.
        </p>
      )}

      {/* Planes disponibles */}
      {plansLoading ? (
        <Spinner label="Cargando planes…" />
      ) : plansError ? (
        <p className="muted">No disponible: el bloque de suscripciones no está instalado.</p>
      ) : (plans ?? []).length === 0 ? (
        <p className="muted">Sin datos: no hay planes disponibles.</p>
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
              <span className="muted">{p.durationDays} días</span>
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
                onClick={() => subscribe.mutate(p.id)}
                disabled={subscribe.isPending || !!my}
              >
                {subscribe.isPending ? 'Contratando…' : 'Contratar'}
              </Button>
            </div>
          ))}
        </div>
      )}
      {subscribe.isError && (
        <p className="muted" style={{ color: 'var(--ws-danger)', marginTop: 'var(--ws-space-3)' }}>
          No se pudo contratar el plan.
        </p>
      )}
      {subscribe.data?.requirePayment && (
        <p className="muted" style={{ color: 'var(--ws-primary)', marginTop: 'var(--ws-space-3)' }}>
          <i className="bi bi-credit-card" /> Este plan requiere pago. Completalo desde “Pagos pendientes”.
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
    const name = typeof ex.name === 'string' && ex.name.trim() ? ex.name.trim() : 'Ejercicio';
    const parts: string[] = [];
    if (ex.sets !== undefined && ex.sets !== null && ex.sets !== '') parts.push(`Series: ${String(ex.sets)}`);
    if (ex.reps !== undefined && ex.reps !== null && ex.reps !== '') parts.push(`Reps: ${String(ex.reps)}`);
    out.push({ name, detail: parts.length ? parts.join(' · ') : '—' });
  }
  return out;
}

function RoutineSection({ user }: { user: AuthUser | null }) {
  const userId = user?.id ?? '';
  const { data: routines, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-routines', userId],
    queryFn: () => api.get<RoutineRow[]>(`/api/v1/blocks/academia/routines?memberId=${encodeURIComponent(userId)}`),
    enabled: !!userId,
    retry: 0,
  });

  return (
    <SectionCard title="Mi rutina">
      {isLoading ? (
        <Spinner label="Cargando rutinas…" />
      ) : isError ? (
        <p className="muted">No disponible: el bloque de academia no está instalado.</p>
      ) : (routines ?? []).length === 0 ? (
        <p className="muted">Sin datos: todavía no tenés una rutina asignada por tu entrenador.</p>
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
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: ['user-dashboard-orders'],
    queryFn: () => api.get<Order[]>('/api/v1/blocks/ecommerce/orders'),
    retry: 0,
  });

  return (
    <SectionCard title="Mis compras">
      {isLoading ? (
        <Spinner label="Cargando compras…" />
      ) : isError ? (
        <p className="muted">No disponible: el bloque de e-commerce no está instalado.</p>
      ) : (orders ?? []).length === 0 ? (
        <p className="muted">Sin datos: todavía no tenés pedidos.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Ítems</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td>{new Date(o.createdAt).toLocaleDateString('es-AR')}</td>
                <td>
                  <StatusBadge
                    label={ORDER_STATUS_ES[o.status] ?? o.status}
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
