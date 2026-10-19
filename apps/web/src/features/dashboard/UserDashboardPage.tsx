import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import type { AuthUser } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

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
  createdAt: string;
  paidAt: string | null;
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

// ── Estado local de navegación del panel ────────────────────────────────

type View =
  | 'summary'
  | 'calendar'
  | 'bookings'
  | 'pendingPayments'
  | 'payments'
  | 'memberships'
  | 'orders';

const SECTIONS: Array<{ key: View; label: string; icon: string }> = [
  { key: 'summary', label: 'Resumen', icon: 'bi-house' },
  { key: 'calendar', label: 'Calendario', icon: 'bi-calendar3' },
  { key: 'bookings', label: 'Reservas', icon: 'bi-calendar-check' },
  { key: 'pendingPayments', label: 'Pagos pendientes', icon: 'bi-hourglass-split' },
  { key: 'payments', label: 'Historial de pagos', icon: 'bi-credit-card' },
  { key: 'memberships', label: 'Suscripciones', icon: 'bi-award' },
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
          {view === 'calendar' && <CalendarSection />}
          {view === 'bookings' && <BookingsSection />}
          {view === 'pendingPayments' && <PendingPaymentsSection />}
          {view === 'payments' && <PaymentsHistorySection />}
          {view === 'memberships' && <MembershipsSection user={user} />}
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
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Monto</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <code style={{ fontSize: '0.85em' }}>{p.id}</code>
                  </td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td>
                    <Button variant="secondary" onClick={() => setSelected(p)}>
                      Continuar pago
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ marginTop: 'var(--ws-space-3)' }}>
            El cobro se completa a través de la pasarela de pagos (Mercado Pago u otro proveedor). Esta vista solo muestra la referencia.
          </p>
        </>
      )}

      <ConfirmDialog
        open={selected !== null}
        title="Continuar pago"
        confirmLabel="Entendido"
        onConfirm={() => setSelected(null)}
        onCancel={() => setSelected(null)}
      >
        <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
          <p style={{ margin: 0 }}>
            <strong>ID:</strong> <code>{selected?.id}</code>
          </p>
          <p style={{ margin: 0 }}>
            <strong>Monto:</strong> {selected ? money(selected.amount, selected.currency) : ''}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            El flujo de pago se realiza por la pasarela (redirección externa). Esta vista solo muestra la referencia del pago pendiente.
          </p>
        </div>
      </ConfirmDialog>
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
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).map((p) => (
              <tr key={p.id}>
                <td>{new Date(p.createdAt).toLocaleString('es-AR')}</td>
                <td>{money(p.amount, p.currency)}</td>
                <td>
                  <StatusBadge
                    label={PAYMENT_STATUS_ES[p.status] ?? p.status}
                    color={PAYMENT_STATUS_COLOR[p.status]}
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
