import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

// ── Tipos de datos de los bloques/endpoints ─────────────────────────────

interface MembershipRow {
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
  createdAt?: string;
}

interface AttendanceRecord {
  id: string;
  organizationId: string;
  membershipId: string;
  userId: string;
  method: string;
  timestamp: string;
}

interface ScanResult {
  ok: boolean;
  membership?: Record<string, unknown>;
  organization?: string | null;
  record?: Record<string, unknown>;
  error?: string;
}

interface RoutineRow {
  id: string;
  trainerId: string;
  memberId: string;
  name: string;
  description: string | null;
  exercises: unknown;
  status: string;
  createdAt: string;
}

interface Booking {
  id: string;
  serviceId: string;
  name: string;
  date: string;
  status: string;
  createdAt?: string;
}

interface ServiceItem {
  id?: string;
  name?: string;
  duration?: number;
  price?: number;
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

interface PaymentSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  refunded: number;
  collectedAmount: number;
}

interface SaleRow {
  id: string;
  status: string;
  total: number;
  items: unknown[];
  createdAt: string;
}

interface ProductRow {
  id: string;
  title: string;
  price: number;
  stock?: number;
}

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  minQuantity: number;
  unitPrice: number;
  category: string | null;
  organizationId: string | null;
  productId: string | null;
}

interface TicketRow {
  id: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
}

interface CheckoutResult {
  ok: boolean;
  error?: string;
  order?: { id: string; total: number } | null;
  payment?: unknown;
}

interface CartLine {
  id: string;
  title: string;
  price: number;
  qty: number;
}

// ── Utilidades ──────────────────────────────────────────────────────────

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;
const formatDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-AR') : '—');
const formatDateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('es-AR') : '—');

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  refunded: 'Reembolsado',
};

const membershipStatusColor = (status: string): string => {
  if (status === 'active') return 'var(--ws-success)';
  if (status === 'paused') return 'var(--ws-warning)';
  if (status === 'expired') return 'var(--ws-danger)';
  return 'var(--ws-text-muted)';
};

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

const fieldLabelStyle = {
  display: 'block',
  marginBottom: 'var(--ws-space-1)',
  fontSize: 'var(--ws-font-size-sm)',
  color: 'var(--ws-text-muted)',
} as const;

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        flex: '1 1 160px',
        minWidth: 140,
        border: '1px solid var(--ws-border)',
        borderRadius: 'var(--ws-radius-md)',
        padding: 'var(--ws-space-3)',
        background: 'var(--ws-surface)',
      }}
    >
      <div className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: accent }}>{value}</div>
    </div>
  );
}

// ── Asistencia (entrenador) ─────────────────────────────────────────────

function AttendanceSection() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  const { data: records, isLoading, isError } = useQuery({
    queryKey: ['staff-attendance'],
    queryFn: () => api.get<AttendanceRecord[]>('/api/v1/blocks/organizaciones/attendance'),
    retry: 0,
  });

  const scan = useMutation({
    mutationFn: (qrcode: string) => api.post<ScanResult>('/api/v1/blocks/organizaciones/attendance/scan', { qrcode }),
    onSuccess: (r) => {
      setResult(r);
      if (r.ok) {
        setCode('');
        void qc.invalidateQueries({ queryKey: ['staff-attendance'] });
      }
    },
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Asistencia</h2>

      <Card>
        <h3 style={{ marginTop: 0 }}>Registrar asistencia</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!code.trim()) return;
            setResult(null);
            scan.mutate(code.trim());
          }}
          style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={fieldLabelStyle}>Código QR del miembro</label>
            <input
              className="input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Escanear o pegar el código QR"
            />
          </div>
          <Button type="submit" disabled={scan.isPending || !code.trim()}>
            Registrar
          </Button>
        </form>
        {scan.isPending && <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>Registrando asistencia…</p>}
        {result && (
          <p style={{ margin: 'var(--ws-space-2) 0 0', color: result.ok ? 'var(--ws-success)' : 'var(--ws-danger)' }}>
            {result.ok ? '✓ Asistencia registrada' : `✗ ${result.error ?? 'No se pudo registrar'}`}
          </p>
        )}
        {scan.error && <p style={{ margin: 'var(--ws-space-2) 0 0', color: 'var(--ws-danger)' }}>{scan.error.message}</p>}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Registros recientes</h3>
        {isLoading && <Spinner label="Cargando registros…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de organizaciones no está instalado.</p>}
        {!isLoading && !isError && (records ?? []).length === 0 && <p className="muted">Todavía no hay registros.</p>}
        {!isLoading && !isError && (records ?? []).length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Método</th>
                <th>Membresía</th>
              </tr>
            </thead>
            <tbody>
              {(records ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.timestamp)}</td>
                  <td>{r.method}</td>
                  <td><code>{r.membershipId}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Rutinas (entrenador) ────────────────────────────────────────────────

function RoutinesSection() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exercisesText, setExercisesText] = useState('');
  const [created, setCreated] = useState(false);

  const { data: routines, isLoading, isError } = useQuery({
    queryKey: ['staff-routines'],
    queryFn: () => api.get<RoutineRow[]>('/api/v1/blocks/academia/routines'),
    retry: 0,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/blocks/academia/routines', {
        trainerId: user?.id ?? '',
        memberId: memberId.trim(),
        name: name.trim() || 'Rutina',
        description: description.trim() || null,
        exercises: exercisesText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((n) => ({ name: n })),
        status: 'active',
      }),
    onSuccess: () => {
      setName('');
      setMemberId('');
      setDescription('');
      setExercisesText('');
      setCreated(true);
      void qc.invalidateQueries({ queryKey: ['staff-routines'] });
    },
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Rutinas</h2>

      <Card>
        <h3 style={{ marginTop: 0 }}>Nueva rutina</h3>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!memberId.trim()) return;
            setCreated(false);
            create.mutate();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={fieldLabelStyle}>Miembro (ID de usuario)</label>
              <input className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="ID del miembro" />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={fieldLabelStyle}>Nombre de la rutina</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tren superior" />
            </div>
          </div>
          <div>
            <label style={fieldLabelStyle}>Descripción (opcional)</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas para el miembro" />
          </div>
          <div>
            <label style={fieldLabelStyle}>Ejercicios (uno por línea)</label>
            <textarea
              className="input"
              rows={4}
              value={exercisesText}
              onChange={(e) => setExercisesText(e.target.value)}
              placeholder={'Sentadillas\nPress de banca'}
              style={{ width: '100%' }}
            />
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
            <Button type="submit" disabled={create.isPending || !memberId.trim()}>Crear rutina</Button>
            {created && <span style={{ color: 'var(--ws-success)' }}>Rutina creada.</span>}
          </div>
          {create.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{create.error.message}</p>}
        </form>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Rutinas existentes</h3>
        {isLoading && <Spinner label="Cargando rutinas…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de academia no está instalado.</p>}
        {!isLoading && !isError && (routines ?? []).length === 0 && <p className="muted">Todavía no hay rutinas.</p>}
        {!isLoading && !isError && (routines ?? []).map((r) => (
          <div key={r.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)', marginTop: 'var(--ws-space-3)' }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--ws-space-1)' }}>
              <strong>{r.name}</strong>
              <span className="badge">{r.status}</span>
            </div>
            {r.description && <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>{r.description}</p>}
            <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
              Miembro: <code>{r.memberId}</code>
            </p>
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
      </Card>
    </div>
  );
}

// ── Reservas (entrenador) ───────────────────────────────────────────────

function BookingsSection() {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [created, setCreated] = useState(false);

  const { data: services } = useQuery({
    queryKey: ['staff-reservas-services'],
    queryFn: () => api.get<ServiceItem[]>('/api/v1/blocks/reservas/services'),
    retry: 0,
  });
  const { data: bookings, isLoading, isError } = useQuery({
    queryKey: ['staff-bookings'],
    queryFn: () => api.get<Booking[]>('/api/v1/blocks/reservas/bookings'),
    retry: 0,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/blocks/reservas/bookings', {
        serviceId: serviceId || '',
        name: name.trim(),
        date: date ? new Date(date).toISOString() : new Date().toISOString(),
        status: 'confirmed',
      }),
    onSuccess: () => {
      setName('');
      setServiceId('');
      setDate('');
      setCreated(true);
      void qc.invalidateQueries({ queryKey: ['staff-bookings'] });
    },
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Reservas</h2>

      <Card>
        <h3 style={{ marginTop: 0 }}>Nueva reserva</h3>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setCreated(false);
            create.mutate();
          }}
        >
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={fieldLabelStyle}>Servicio</label>
              <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                <option value="">Sin servicio asignado</option>
                {(services ?? []).map((s) => (
                  <option key={s.id ?? s.name ?? ''} value={s.id ?? ''}>{s.name ?? s.id}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={fieldLabelStyle}>Nombre / cliente</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la reserva" />
            </div>
            <div style={{ minWidth: 200 }}>
              <label style={fieldLabelStyle}>Fecha y hora</label>
              <input className="input" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
            <Button type="submit" disabled={create.isPending || !name.trim()}>Crear reserva</Button>
            {created && <span style={{ color: 'var(--ws-success)' }}>Reserva creada.</span>}
          </div>
          {create.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{create.error.message}</p>}
        </form>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Reservas existentes</h3>
        {isLoading && <Spinner label="Cargando reservas…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de reservas no está instalado.</p>}
        {!isLoading && !isError && (bookings ?? []).length === 0 && <p className="muted">Todavía no hay reservas.</p>}
        {!isLoading && !isError && (bookings ?? []).length > 0 && (
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
                  <td>{formatDateTime(b.date)}</td>
                  <td>{b.name}</td>
                  <td><code>{b.serviceId || '—'}</code></td>
                  <td><span className="badge">{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Miembros (entrenador) ───────────────────────────────────────────────

function MembersSection() {
  const { data: memberships, isLoading, isError } = useQuery({
    queryKey: ['staff-memberships'],
    queryFn: () => api.get<MembershipRow[]>('/api/v1/blocks/organizaciones/memberships'),
    retry: 0,
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Miembros</h2>
      <Card>
        {isLoading && <Spinner label="Cargando miembros…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de organizaciones no está instalado.</p>}
        {!isLoading && !isError && (memberships ?? []).length === 0 && <p className="muted">Todavía no hay miembros.</p>}
        {!isLoading && !isError && (memberships ?? []).length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Organización</th>
                <th>Plan</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Vence</th>
              </tr>
            </thead>
            <tbody>
              {(memberships ?? []).map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.userName}</strong></td>
                  <td>{m.organizationName}</td>
                  <td>{m.plan ?? '—'}</td>
                  <td>{m.role}</td>
                  <td>
                    <span className="badge" style={{ color: membershipStatusColor(m.status) }}>{m.status}</span>
                  </td>
                  <td>{formatDate(m.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Pagos (finanzas) ────────────────────────────────────────────────────

function PaymentsSection() {
  const { data: summary } = useQuery({
    queryKey: ['staff-payments-summary'],
    queryFn: () => api.get<PaymentSummary>('/api/v1/payments/summary'),
    retry: 0,
  });
  const { data: payments, isLoading, isError } = useQuery({
    queryKey: ['staff-payments'],
    queryFn: () => api.get<PaymentRow[]>('/api/v1/payments'),
    retry: 0,
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Pagos</h2>

      {summary && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
          <StatCard label="Total" value={String(summary.total)} />
          <StatCard label="Recaudado" value={money(summary.collectedAmount, 'ARS')} accent="var(--ws-success)" />
          <StatCard label="Aprobados" value={String(summary.approved)} />
          <StatCard label="Pendientes" value={String(summary.pending)} />
          <StatCard label="Rechazados" value={String(summary.rejected)} />
          <StatCard label="Reembolsados" value={String(summary.refunded)} />
        </div>
      )}

      <Card>
        <h3 style={{ marginTop: 0 }}>Transacciones</h3>
        {isLoading && <Spinner label="Cargando pagos…" />}
        {isError && !isLoading && <p className="muted">No se pudieron cargar los pagos.</p>}
        {!isLoading && !isError && (payments ?? []).length === 0 && <p className="muted">No hay transacciones.</p>}
        {!isLoading && !isError && (payments ?? []).length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{formatDateTime(p.createdAt)}</td>
                  <td><code>{p.provider}</code></td>
                  <td>{money(p.amount, p.currency)}</td>
                  <td><span className="badge">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Recaudación (finanzas) ──────────────────────────────────────────────

function CollectionSection() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['staff-payments-summary'],
    queryFn: () => api.get<PaymentSummary>('/api/v1/payments/summary'),
    retry: 0,
  });

  const total = summary?.total ?? 0;
  const approved = summary?.approved ?? 0;
  const pending = summary?.pending ?? 0;
  const rejected = summary?.rejected ?? 0;
  const refunded = summary?.refunded ?? 0;
  const collected = summary?.collectedAmount ?? 0;
  const denom = Math.max(1, total);

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Recaudación</h2>

      {isLoading && <Spinner label="Cargando resumen…" />}
      {!isLoading && !summary && <p className="muted">No se pudo cargar el resumen de recaudación.</p>}

      {summary && (
        <>
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
            <StatCard label="Recaudado" value={money(collected, 'ARS')} accent="var(--ws-success)" />
            <StatCard label="Aprobados" value={String(approved)} />
            <StatCard label="Pendientes" value={String(pending)} />
            <StatCard label="Rechazados" value={String(rejected)} />
            <StatCard label="Reembolsados" value={String(refunded)} />
          </div>

          <Card>
            <h3 style={{ marginTop: 0 }}>Distribución de estados</h3>
            <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', marginTop: 'var(--ws-space-2)' }}>
              <div title={`Aprobados: ${approved}`} style={{ width: `${(approved / denom) * 100}%`, background: 'var(--ws-success)', minWidth: approved ? 4 : 0 }} />
              <div title={`Pendientes: ${pending}`} style={{ width: `${(pending / denom) * 100}%`, background: 'var(--ws-warning)', minWidth: pending ? 4 : 0 }} />
              <div title={`Rechazados: ${rejected}`} style={{ width: `${(rejected / denom) * 100}%`, background: 'var(--ws-danger)', minWidth: rejected ? 4 : 0 }} />
              <div title={`Reembolsados: ${refunded}`} style={{ width: `${(refunded / denom) * 100}%`, background: 'var(--ws-text-muted)', minWidth: refunded ? 4 : 0 }} />
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-3)', marginTop: 'var(--ws-space-2)' }}>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--ws-success)', marginRight: 4 }} />
                Aprobados ({approved})
              </span>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--ws-warning)', marginRight: 4 }} />
                Pendientes ({pending})
              </span>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--ws-danger)', marginRight: 4 }} />
                Rechazados ({rejected})
              </span>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'var(--ws-text-muted)', marginRight: 4 }} />
                Reembolsados ({refunded})
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Ventas (cajero / vendedor) ──────────────────────────────────────────

function SalesSection() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [saleMsg, setSaleMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: products } = useQuery({
    queryKey: ['staff-pos-products'],
    queryFn: () => api.get<ProductRow[]>('/api/v1/blocks/pos/products'),
    retry: 0,
  });
  const { data: sales, isLoading, isError } = useQuery({
    queryKey: ['staff-sales'],
    queryFn: () => api.get<SaleRow[]>('/api/v1/blocks/pos/sales'),
    retry: 0,
  });

  const checkout = useMutation({
    mutationFn: () =>
      api.post<CheckoutResult>('/api/v1/blocks/pos/checkout', {
        items: cart.map((l) => ({ id: l.id, qty: l.qty })),
      }),
    onSuccess: (r) => {
      if (r.ok) {
        setCart([]);
        setSaleMsg({ ok: true, text: `Venta cobrada · $${(r.order?.total ?? 0).toFixed(2)}` });
        void qc.invalidateQueries({ queryKey: ['staff-sales'] });
        void qc.invalidateQueries({ queryKey: ['staff-inventory'] });
      } else {
        setSaleMsg({ ok: false, text: r.error ?? 'No se pudo cobrar' });
      }
    },
  });

  const addToCart = () => {
    const product = (products ?? []).find((p) => p.id === productId);
    if (!product) return;
    const q = Math.max(1, Math.floor(Number(qty) || 1));
    setCart((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) return prev.map((l) => (l.id === product.id ? { ...l, qty: l.qty + q } : l));
      return [...prev, { id: product.id, title: product.title, price: product.price, qty: q }];
    });
    setProductId('');
    setQty('1');
  };

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Ventas</h2>

      <Card>
        <h3 style={{ marginTop: 0 }}>Cobrar (POS)</h3>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={fieldLabelStyle}>Producto</label>
            <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Seleccionar producto…</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.title} — ${p.price.toFixed(2)}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 90 }}>
            <label style={fieldLabelStyle}>Cantidad</label>
            <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <Button onClick={addToCart} disabled={!productId}>Agregar</Button>
        </div>

        {cart.length > 0 && (
          <div className="stack" style={{ marginTop: 'var(--ws-space-3)' }}>
            {cart.map((l) => (
              <div key={l.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                <span>{l.title} <span className="muted">× {l.qty}</span></span>
                <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                  <span>${(l.price * l.qty).toFixed(2)}</span>
                  <Button variant="ghost" onClick={() => setCart((prev) => prev.filter((x) => x.id !== l.id))}>✕</Button>
                </div>
              </div>
            ))}
            <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
              <strong>Total</strong>
              <strong>${cartTotal.toFixed(2)}</strong>
            </div>
            <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
              <Button onClick={() => checkout.mutate()} disabled={checkout.isPending || cart.length === 0}>
                {checkout.isPending ? 'Cobrando…' : 'Cobrar'}
              </Button>
              {saleMsg && <span style={{ color: saleMsg.ok ? 'var(--ws-success)' : 'var(--ws-danger)' }}>{saleMsg.text}</span>}
            </div>
            {checkout.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{checkout.error.message}</p>}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Órdenes pagadas</h3>
        {isLoading && <Spinner label="Cargando ventas…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de POS no está instalado.</p>}
        {!isLoading && !isError && (sales ?? []).length === 0 && <p className="muted">Todavía no hay ventas.</p>}
        {!isLoading && !isError && (sales ?? []).length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Total</th>
                <th>Ítems</th>
              </tr>
            </thead>
            <tbody>
              {(sales ?? []).map((s) => (
                <tr key={s.id}>
                  <td>{formatDateTime(s.createdAt)}</td>
                  <td>${s.total.toFixed(2)}</td>
                  <td>{s.items?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Stock (cajero / vendedor) ───────────────────────────────────────────

function StockSection() {
  const { data: items, isLoading, isError } = useQuery({
    queryKey: ['staff-inventory'],
    queryFn: () => api.get<InventoryItem[]>('/api/v1/blocks/inventario/inventory'),
    retry: 0,
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Stock</h2>
      <Card>
        {isLoading && <Spinner label="Cargando inventario…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de inventario no está instalado.</p>}
        {!isLoading && !isError && (items ?? []).length === 0 && <p className="muted">No hay ítems en el inventario.</p>}
        {!isLoading && !isError && (items ?? []).length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Cantidad</th>
                <th>Mínimo</th>
                <th>Precio</th>
                <th>Categoría</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it) => (
                <tr key={it.id} style={it.quantity <= it.minQuantity ? { background: 'var(--ws-warning-soft, var(--ws-surface-2))' } : undefined}>
                  <td><code>{it.sku}</code></td>
                  <td>{it.name}</td>
                  <td style={it.quantity <= it.minQuantity ? { color: 'var(--ws-danger)', fontWeight: 600 } : undefined}>{it.quantity}</td>
                  <td>{it.minQuantity}</td>
                  <td>${it.unitPrice.toFixed(2)}</td>
                  <td>{it.category ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Tickets (soporte) ───────────────────────────────────────────────────

const ticketStatusLabel = (s: string): string => (s === 'closed' ? 'Cerrado' : 'Abierto');

function TicketsSection() {
  const qc = useQueryClient();
  const { data: tickets, isLoading, isError } = useQuery({
    queryKey: ['staff-tickets'],
    queryFn: () => api.get<TicketRow[]>('/api/v1/blocks/support/tickets'),
    retry: 0,
  });

  const patch = useMutation({
    mutationFn: (vars: { id: string; status: string }) =>
      api.patch(`/api/v1/blocks/support/tickets/${vars.id}`, { status: vars.status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff-tickets'] }),
  });

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Tickets</h2>
      <Card>
        {isLoading && <Spinner label="Cargando tickets…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de soporte no está instalado.</p>}
        {!isLoading && !isError && (tickets ?? []).length === 0 && <p className="muted">Todavía no hay tickets.</p>}
        {!isLoading && !isError && (tickets ?? []).length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Asunto</th>
                <th>Mensaje</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(tickets ?? []).map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.subject}</strong></td>
                  <td><span className="muted">{t.message}</span></td>
                  <td>
                    <select
                      className="input"
                      value={t.status}
                      aria-label={`Estado de ${t.subject}`}
                      onChange={(e) => patch.mutate({ id: t.id, status: e.target.value })}
                      style={{ width: 'auto' }}
                    >
                      <option value="open">Abierto</option>
                      <option value="closed">Cerrado</option>
                    </select>{' '}
                    <span className="badge">{ticketStatusLabel(t.status)}</span>
                  </td>
                  <td>{formatDateTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ── Navegación y contenedor principal ───────────────────────────────────

type SectionKey =
  | 'asistencia'
  | 'rutinas'
  | 'reservas'
  | 'miembros'
  | 'pagos'
  | 'recaudacion'
  | 'ventas'
  | 'stock'
  | 'tickets';

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: string;
}

function renderSection(key: SectionKey) {
  switch (key) {
    case 'asistencia':
      return <AttendanceSection />;
    case 'rutinas':
      return <RoutinesSection />;
    case 'reservas':
      return <BookingsSection />;
    case 'miembros':
      return <MembersSection />;
    case 'pagos':
      return <PaymentsSection />;
    case 'recaudacion':
      return <CollectionSection />;
    case 'ventas':
      return <SalesSection />;
    case 'stock':
      return <StockSection />;
    case 'tickets':
      return <TicketsSection />;
  }
}

export function StaffDashboard() {
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [active, setActive] = useState<SectionKey | null>(null);

  const canTrainer =
    hasPermission('course.manage') || hasPermission('attendance.manage') || hasPermission('membership.manage');
  const canBilling = hasPermission('billing.read') || hasPermission('billing.write');
  const canSales = hasPermission('sales.manage');
  const canInventory = hasPermission('inventory.read');
  const canSupport = hasPermission('support.manage');
  const isAdmin = hasPermission('user.read');

  const sections: SectionDef[] = [];
  if (canTrainer) {
    sections.push({ key: 'asistencia', label: 'Asistencia', icon: 'bi-qr-code-scan' });
    sections.push({ key: 'rutinas', label: 'Rutinas', icon: 'bi-clipboard2-pulse' });
    sections.push({ key: 'reservas', label: 'Reservas', icon: 'bi-calendar3' });
    sections.push({ key: 'miembros', label: 'Miembros', icon: 'bi-people' });
  }
  if (canBilling) {
    sections.push({ key: 'pagos', label: 'Pagos', icon: 'bi-credit-card' });
    sections.push({ key: 'recaudacion', label: 'Recaudación', icon: 'bi-cash-stack' });
  }
  if (canSales) {
    sections.push({ key: 'ventas', label: 'Ventas', icon: 'bi-cart3' });
    if (canInventory) sections.push({ key: 'stock', label: 'Stock', icon: 'bi-box-seam' });
  }
  if (canSupport) {
    sections.push({ key: 'tickets', label: 'Tickets', icon: 'bi-headset' });
  }

  const current = sections.find((s) => s.key === active) ?? sections[0] ?? null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--ws-space-6)',
        maxWidth: 1180,
        margin: '0 auto',
        padding: 'var(--ws-space-6) var(--ws-space-4)',
        flexWrap: 'wrap',
      }}
    >
      <aside style={{ width: 240, maxWidth: '100%' }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Panel de trabajo</h1>
        <p className="muted" style={{ margin: 'var(--ws-space-1) 0 var(--ws-space-4)' }}>
          {user?.displayName ?? user?.email}
        </p>

        {sections.length === 0 ? (
          <p className="muted">No tenés secciones habilitadas para tu rol.</p>
        ) : (
          <nav className="stack" style={{ gap: 'var(--ws-space-1)' }}>
            {sections.map((s) => {
              const isActive = current?.key === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--ws-space-2)',
                    padding: 'var(--ws-space-2) var(--ws-space-3)',
                    borderRadius: 'var(--ws-radius-md)',
                    border: 'none',
                    background: isActive ? 'var(--ws-primary-soft)' : 'transparent',
                    color: isActive ? 'var(--ws-primary)' : 'var(--ws-text)',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    fontSize: 'var(--ws-font-size-md)',
                  }}
                >
                  <i className={`bi ${s.icon}`} /> {s.label}
                </button>
              );
            })}
          </nav>
        )}

        {isAdmin && (
          <Link
            to="/admin"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--ws-space-2)',
              marginTop: 'var(--ws-space-4)',
              padding: 'var(--ws-space-3) var(--ws-space-3) var(--ws-space-1)',
              color: 'var(--ws-text)',
              textDecoration: 'none',
              borderTop: '1px solid var(--ws-border)',
              fontSize: 'var(--ws-font-size-sm)',
            }}
          >
            <i className="bi bi-speedometer2" /> Administración
          </Link>
        )}
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        {current ? (
          renderSection(current.key)
        ) : (
          <Card>
            <h2 style={{ marginTop: 0 }}>Sin acceso</h2>
            <p className="muted">No tenés permisos para usar el panel de trabajo.</p>
          </Card>
        )}
      </main>
    </div>
  );
}
