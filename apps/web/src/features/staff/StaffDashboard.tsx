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
  imageUrl?: string | null;
  barcode?: string | null;
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

interface RoutineExercise {
  name: string;
  sets?: string;
  reps?: string;
  day?: string;
  notes?: string;
  machineUrl?: string;
  machineImage?: string;
}

const exerciseField = (x: unknown): string =>
  typeof x === 'string' ? x.trim() : x !== undefined && x !== null && x !== '' ? String(x).trim() : '';

/** Normaliza el Json de ejercicios a una lista enriquecida para mostrar. */
function routineExerciseList(v: unknown): RoutineExercise[] {
  if (!Array.isArray(v)) return [];
  const out: RoutineExercise[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const ex = raw as Record<string, unknown>;
    out.push({
      name: exerciseField(ex.name) || 'Ejercicio',
      day: exerciseField(ex.day),
      sets: exerciseField(ex.sets),
      reps: exerciseField(ex.reps),
      notes: exerciseField(ex.notes),
      machineUrl: exerciseField(ex.machineUrl),
      machineImage: exerciseField(ex.machineImage),
    });
  }
  return out;
}

/** Parse del textarea: `nombre | día | series | reps | notas | url de máquina | foto(opcional)`. */
function parseExercisesText(text: string): RoutineExercise[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, day, sets, reps, notes, machineUrl, machineImage] = line.split('|').map((p) => p.trim());
      const ex: RoutineExercise = { name: name || 'Ejercicio' };
      if (day) ex.day = day;
      if (sets) ex.sets = sets;
      if (reps) ex.reps = reps;
      if (notes) ex.notes = notes;
      if (machineUrl) ex.machineUrl = machineUrl;
      if (machineImage) ex.machineImage = machineImage;
      return ex;
    });
}

/** Serializa los ejercicios enriquecidos de vuelta al formato del textarea. */
function serializeExercises(v: unknown): string {
  if (!Array.isArray(v)) return '';
  return v
    .map((raw) => {
      if (typeof raw !== 'object' || raw === null) return '';
      const ex = raw as Record<string, unknown>;
      return [
        exerciseField(ex.name),
        exerciseField(ex.day),
        exerciseField(ex.sets),
        exerciseField(ex.reps),
        exerciseField(ex.notes),
        exerciseField(ex.machineUrl),
        exerciseField(ex.machineImage),
      ].join(' | ');
    })
    .filter(Boolean)
    .join('\n');
}

function RoutineExerciseItem({ ex }: { ex: RoutineExercise }) {
  return (
    <div
      style={{
        background: 'var(--ws-surface-2)',
        border: '1px solid var(--ws-border)',
        borderRadius: 'var(--ws-radius-md)',
        padding: 'var(--ws-space-3)',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
        <strong>{ex.name}</strong>
        {ex.day && <span className="badge">{ex.day}</span>}
      </div>
      {(ex.sets || ex.reps) && (
        <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>
          {ex.sets ? `Series: ${ex.sets}` : ''}
          {ex.sets && ex.reps ? ' · ' : ''}
          {ex.reps ? `Reps: ${ex.reps}` : ''}
        </p>
      )}
      {ex.notes && (
        <p style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
          <i className="bi bi-chat-left-text" /> {ex.notes}
        </p>
      )}
      {ex.machineUrl && (
        <p style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
          <a href={ex.machineUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--ws-primary)' }}>
            <i className="bi bi-box-arrow-up-right" /> Ver máquina
          </a>
        </p>
      )}
      {ex.machineImage && (
        <img
          src={ex.machineImage}
          alt={ex.name}
          style={{ display: 'block', maxWidth: 240, maxHeight: 180, marginTop: 'var(--ws-space-2)', borderRadius: 'var(--ws-radius-md)' }}
        />
      )}
    </div>
  );
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

interface MemberUser {
  id: string;
  displayName: string | null;
  username: string | null;
  email: string;
}

function memberLabel(u: MemberUser) {
  return u.displayName ?? u.username ?? u.email;
}

/** Autocompletado de miembros (predicción por nombre/email/username). */
function MemberAutocomplete({
  value,
  onSelect,
  onPick,
  placeholder = 'Buscar miembro…',
}: {
  value: string;
  onSelect: (id: string) => void;
  onPick?: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: users } = useQuery({
    queryKey: ['staff-members-users'],
    queryFn: () => api.get<MemberUser[]>('/api/v1/blocks/academia/users'),
    retry: 0,
  });

  const selected = (users ?? []).find((u) => u.id === value);
  const q = value.trim().toLowerCase();
  const matches = (users ?? [])
    .filter((u) => {
      if (!q) return true;
      return (
        (u.displayName ?? '').toLowerCase().includes(q) ||
        (u.username ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
      <label style={fieldLabelStyle}>Miembro</label>
      <input
        className="input"
        value={selected ? memberLabel(selected) : value}
        onChange={(e) => {
          onSelect(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        style={{ width: '100%' }}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--ws-surface)',
            border: '1px solid var(--ws-border)',
            borderRadius: 'var(--ws-radius-md)',
            boxShadow: 'var(--ws-shadow-lg)',
            zIndex: 30,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(u.id);
                onPick?.(u.id);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: 'var(--ws-space-2) var(--ws-space-3)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ws-text)',
              }}
            >
              <strong>{memberLabel(u)}</strong>
              <span className="muted" style={{ marginLeft: 6, fontSize: 'var(--ws-font-size-sm)' }}>
                {u.username ? `@${u.username} · ` : ''}{u.email}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RoutinesSection() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  // Formulario crear/editar plantilla.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exercisesText, setExercisesText] = useState('');
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Asignar plantilla a un miembro.
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignMemberId, setAssignMemberId] = useState('');

  // Buscar rutinas de un usuario.
  const [lookupDraft, setLookupDraft] = useState('');
  const [lookupMemberId, setLookupMemberId] = useState('');

  const { data: routines, isLoading, isError } = useQuery({
    queryKey: ['staff-routines'],
    queryFn: () => api.get<RoutineRow[]>('/api/v1/blocks/academia/routines'),
    retry: 0,
  });

  // Solo plantillas (memberId vacío).
  const templates = (routines ?? []).filter((r) => !r.memberId);

  const { data: memberRoutines, isLoading: memberLoading, isError: memberError } = useQuery({
    queryKey: ['staff-routines-member', lookupMemberId],
    queryFn: () => api.get<RoutineRow[]>(`/api/v1/blocks/academia/routines?memberId=${encodeURIComponent(lookupMemberId)}`),
    enabled: !!lookupMemberId,
    retry: 0,
  });

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setExercisesText('');
    setFormMsg(null);
  };

  const startEdit = (r: RoutineRow) => {
    setEditingId(r.id);
    setName(r.name);
    setDescription(r.description ?? '');
    setExercisesText(serializeExercises(r.exercises));
    setFormMsg(null);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/blocks/academia/routines', {
        trainerId: user?.id ?? '',
        memberId: '',
        name: name.trim() || 'Rutina',
        description: description.trim() || null,
        exercises: parseExercisesText(exercisesText),
        status: 'active',
      }),
    onSuccess: () => {
      resetForm();
      setFormMsg({ ok: true, text: 'Rutina creada.' });
      void qc.invalidateQueries({ queryKey: ['staff-routines'] });
    },
  });

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/blocks/academia/routines/${editingId}`, {
        name: name.trim() || 'Rutina',
        description: description.trim() || null,
        exercises: parseExercisesText(exercisesText),
      }),
    onSuccess: () => {
      resetForm();
      setFormMsg({ ok: true, text: 'Rutina guardada.' });
      void qc.invalidateQueries({ queryKey: ['staff-routines'] });
      void qc.invalidateQueries({ queryKey: ['staff-routines-member'] });
    },
  });

  const assign = useMutation({
    mutationFn: (routineId: string) =>
      api.post(`/api/v1/blocks/academia/routines/${routineId}/assign`, { memberId: assignMemberId.trim() }),
    onSuccess: () => {
      setAssigningId(null);
      setAssignMemberId('');
      void qc.invalidateQueries({ queryKey: ['staff-routines'] });
      void qc.invalidateQueries({ queryKey: ['staff-routines-member'] });
    },
  });

  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Rutinas</h2>

      <Card>
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Editar rutina' : 'Nueva rutina (plantilla)'}</h3>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setFormMsg(null);
            if (editingId) update.mutate();
            else create.mutate();
          }}
        >
          <div>
            <label style={fieldLabelStyle}>Nombre de la rutina</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tren superior" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Descripción (opcional)</label>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Notas para la rutina" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={fieldLabelStyle}>Ejercicios (uno por línea)</label>
            <textarea
              className="input"
              rows={6}
              value={exercisesText}
              onChange={(e) => setExercisesText(e.target.value)}
              placeholder={'Formato por ejercicio (separado por |):\nnombre | día | series | reps | notas | url de máquina\n\nEjemplos:\nPress de banca | Lunes | 4 | 10 | Controlar la bajada | https://…\nSentadilla | Martes | 3 | 12 | |'}
              style={{ width: '100%' }}
            />
            <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
              Una línea por ejercicio: <code>nombre | día | series | reps | notas | url de máquina</code>. El día puede ser un número o texto libre (Lunes, Martes…). La URL es el link de la máquina; podés agregar una 7ª columna opcional con la URL de una foto.
            </p>
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)' }}>
            <Button type="submit" disabled={saving}>
              {editingId ? (update.isPending ? 'Guardando…' : 'Guardar cambios') : (create.isPending ? 'Creando…' : 'Crear rutina')}
            </Button>
            {editingId && <Button variant="ghost" type="button" onClick={resetForm}>Cancelar</Button>}
            {formMsg && <span style={{ color: formMsg.ok ? 'var(--ws-success)' : 'var(--ws-danger)' }}>{formMsg.text}</span>}
          </div>
          {saveError && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{saveError.message}</p>}
        </form>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Rutinas existentes (plantillas)</h3>
        {isLoading && <Spinner label="Cargando rutinas…" />}
        {isError && !isLoading && <p className="muted">No disponible: el bloque de academia no está instalado.</p>}
        {!isLoading && !isError && templates.length === 0 && <p className="muted">Todavía no hay plantillas.</p>}
        {!isLoading && !isError && templates.map((r) => (
          <div key={r.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)', marginTop: 'var(--ws-space-3)' }}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--ws-space-1)' }}>
              <strong>{r.name}</strong>
              <span className="badge">{r.status}</span>
            </div>
            {r.description && <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>{r.description}</p>}
            <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0', fontSize: 'var(--ws-font-size-sm)' }}>
              Tipo: Plantilla
            </p>
            <div className="stack" style={{ gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-2)' }}>
              {routineExerciseList(r.exercises).map((ex, i) => (
                <RoutineExerciseItem key={i} ex={ex} />
              ))}
            </div>
            <div className="row" style={{ marginTop: 'var(--ws-space-2)', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
              <Button variant="ghost" onClick={() => startEdit(r)}>
                <i className="bi bi-pencil" /> Editar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setAssigningId(assigningId === r.id ? null : r.id);
                  setAssignMemberId('');
                }}
              >
                <i className="bi bi-person-plus" /> Asignar a miembro
              </Button>
            </div>
            {assigningId === r.id && (
              <div className="row" style={{ marginTop: 'var(--ws-space-2)', alignItems: 'flex-end', gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
                <MemberAutocomplete value={assignMemberId} onSelect={setAssignMemberId} placeholder="Buscar miembro…" />
                <Button disabled={assign.isPending || !assignMemberId.trim()} onClick={() => assign.mutate(r.id)}>
                  {assign.isPending ? 'Asignando…' : 'Asignar'}
                </Button>
                <Button variant="ghost" onClick={() => setAssigningId(null)}>Cancelar</Button>
              </div>
            )}
          </div>
        ))}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Rutinas de un usuario</h3>
        <p className="muted" style={{ margin: '0 0 var(--ws-space-2)' }}>Buscá por nombre o email para ver qué rutinas tiene asignadas.</p>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
          <MemberAutocomplete
            value={lookupDraft}
            onSelect={setLookupDraft}
            onPick={(id) => {
              setLookupDraft(id);
              setLookupMemberId(id);
            }}
            placeholder="Buscar por nombre/email…"
          />
          {lookupMemberId && (
            <Button
              variant="ghost"
              onClick={() => {
                setLookupDraft('');
                setLookupMemberId('');
              }}
            >
              Limpiar
            </Button>
          )}
        </div>
        {lookupMemberId && (
          <div style={{ marginTop: 'var(--ws-space-3)' }}>
            {memberLoading && <Spinner label="Buscando rutinas…" />}
            {memberError && !memberLoading && <p className="muted">No se pudieron cargar las rutinas del miembro.</p>}
            {!memberLoading && !memberError && (memberRoutines ?? []).length === 0 && (
              <p className="muted">Este usuario no tiene rutinas asignadas.</p>
            )}
            {!memberLoading && !memberError && (memberRoutines ?? []).map((r) => (
              <div key={r.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)', marginTop: 'var(--ws-space-3)' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--ws-space-1)' }}>
                  <strong>{r.name}</strong>
                  <span className="badge">{r.status}</span>
                </div>
                {r.description && <p className="muted" style={{ margin: 'var(--ws-space-1) 0 0' }}>{r.description}</p>}
                <div className="stack" style={{ gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-2)' }}>
                  {routineExerciseList(r.exercises).map((ex, i) => (
                    <RoutineExerciseItem key={i} ex={ex} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [qty, setQty] = useState('1');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [saleMsg, setSaleMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [barcodeMsg, setBarcodeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['staff-pos-products', search.trim()],
    queryFn: () =>
      api.get<ProductRow[]>(
        `/api/v1/blocks/pos/products${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`,
      ),
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

  const addToCart = (product: ProductRow) => {
    const q = Math.max(1, Math.floor(Number(qty) || 1));
    setCart((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) return prev.map((l) => (l.id === product.id ? { ...l, qty: l.qty + q } : l));
      return [...prev, { id: product.id, title: product.title, price: product.price, qty: q }];
    });
    setQty('1');
  };

  // Al pegar/escanear un código de barras y presionar Enter, se busca el
  // producto por `barcode` (o por título como respaldo) y se agrega al carrito.
  const barcodeLookup = useMutation({
    mutationFn: (code: string) => api.get<ProductRow[]>(`/api/v1/blocks/pos/products?q=${encodeURIComponent(code)}`),
    onSuccess: (list, code) => {
      const match =
        (list ?? []).find((p) => (p.barcode ?? '').trim() === code.trim()) ?? (list ?? [])[0];
      if (!match) {
        setBarcodeMsg({ ok: false, text: 'No se encontró un producto con ese código' });
        return;
      }
      addToCart(match);
      setBarcode('');
      setBarcodeMsg({ ok: true, text: `${match.title} agregado al carrito` });
    },
    onError: () => setBarcodeMsg({ ok: false, text: 'No se pudo buscar el producto' }),
  });

  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);

  return (
    <div className="stack">
      <h2 style={{ marginTop: 0 }}>Ventas</h2>

      <Card>
        <h3 style={{ marginTop: 0 }}>Cobrar (POS)</h3>

        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!barcode.trim()) return;
            setBarcodeMsg(null);
            barcodeLookup.mutate(barcode.trim());
          }}
          style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={fieldLabelStyle}>Código de barras (escáner)</label>
            <input
              className="input"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Escanear o pegar el código de barras"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={barcodeLookup.isPending || !barcode.trim()}>
            {barcodeLookup.isPending ? 'Buscando…' : 'Agregar'}
          </Button>
        </form>
        {barcodeMsg && (
          <p style={{ margin: 'var(--ws-space-2) 0 0', color: barcodeMsg.ok ? 'var(--ws-success)' : 'var(--ws-danger)' }}>
            {barcodeMsg.ok ? '✓' : '✗'} {barcodeMsg.text}
          </p>
        )}

        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--ws-space-2)', marginTop: 'var(--ws-space-3)' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={fieldLabelStyle}>Buscar producto</label>
            <input
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o código de barras…"
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ width: 90 }}>
            <label style={fieldLabelStyle}>Cantidad</label>
            <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        </div>

        <div className="stack" style={{ marginTop: 'var(--ws-space-3)', gap: 'var(--ws-space-2)' }}>
          {productsLoading && <Spinner label="Cargando productos…" />}
          {!productsLoading && (products ?? []).length === 0 && (
            <p className="muted">No se encontraron productos.</p>
          )}
          {!productsLoading &&
            (products ?? []).map((p) => (
              <div
                key={p.id}
                className="row"
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--ws-space-2)',
                  border: '1px solid var(--ws-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  padding: 'var(--ws-space-2)',
                }}
              >
                <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-2)', minWidth: 0 }}>
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.title}
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 'var(--ws-radius-md)' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--ws-radius-md)',
                        background: 'var(--ws-surface-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--ws-text-muted)',
                      }}
                    >
                      <i className="bi bi-box-seam" />
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{p.title}</strong>
                    <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                      ${p.price.toFixed(2)} · Stock: {p.stock ?? 0}
                      {p.barcode ? ` · ${p.barcode}` : ''}
                    </span>
                  </div>
                </div>
                <Button variant="secondary" onClick={() => addToCart(p)} disabled={(p.stock ?? 0) <= 0}>
                  Agregar
                </Button>
              </div>
            ))}
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
