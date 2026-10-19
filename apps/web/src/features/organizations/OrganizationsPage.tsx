import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { QrCode } from '../../components/ui/QrCode';

const BASE = '/api/v1/blocks/organizaciones';

interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  active: boolean;
  shareInventory: boolean;
  logoUrl: string | null;
  memberCount: number;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  durationDays: number;
  features: string[];
  active: boolean;
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
  membership?: Membership;
  organization?: { name?: string };
  record?: AttendanceRecord;
  error?: string;
}

interface AttendanceStats {
  total: number;
  byDay: Record<string, number>;
}

type View = 'organizations' | 'plans' | 'memberships' | 'attendance';

function statusColor(status: string): string {
  if (status === 'active') return 'var(--ws-success)';
  if (status === 'paused') return 'var(--ws-warning)';
  if (status === 'expired') return 'var(--ws-danger)';
  return 'var(--ws-text-muted)';
}

const yesNo = (v: boolean) => (v ? 'Sí' : 'No');
const formatDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es') : '—');

export function OrganizationsPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('organizations');

  const { data: organizations, isLoading: orgLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<Organization[]>(`${BASE}/organizations`),
  });

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>(`${BASE}/plans`),
  });

  const { data: memberships, isLoading: membershipsLoading } = useQuery({
    queryKey: ['memberships'],
    queryFn: () => api.get<Membership[]>(`${BASE}/memberships`),
  });

  const { data: attendance, isLoading: attendanceLoading } = useQuery({
    queryKey: ['attendance'],
    queryFn: () => api.get<AttendanceRecord[]>(`${BASE}/attendance`),
  });

  const [statsDays, setStatsDays] = useState(7);
  const { data: stats } = useQuery({
    queryKey: ['attendance-stats', statsDays],
    queryFn: () => api.get<AttendanceStats>(`${BASE}/attendance/stats?days=${statsDays}`),
  });

  if (orgLoading || plansLoading) return <Spinner />;

  const orgs = organizations ?? [];
  const planList = plans ?? [];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>Organizaciones</h1>
        <button className={`nav-link ${view === 'organizations' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('organizations')}>Organizaciones</button>
        <button className={`nav-link ${view === 'plans' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('plans')}>Planes</button>
        <button className={`nav-link ${view === 'memberships' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('memberships')}>Membresías</button>
        <button className={`nav-link ${view === 'attendance' ? 'active' : ''}`} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setView('attendance')}>Asistencia</button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'organizations' && <OrganizationsView organizations={orgs} />}
        {view === 'plans' && <PlansView plans={planList} />}
        {view === 'memberships' && (
          <MembershipsView organizations={orgs} plans={planList} memberships={memberships ?? []} loading={membershipsLoading} />
        )}
        {view === 'attendance' && (
          <AttendanceView attendance={attendance ?? []} stats={stats} statsDays={statsDays} setStatsDays={setStatsDays} loading={attendanceLoading} />
        )}
      </div>
    </div>
  );
}

function OrganizationsView({ organizations }: { organizations: Organization[] }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [plan, setPlan] = useState('');
  const [active, setActive] = useState(true);
  const [shareInventory, setShareInventory] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Organization | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`${BASE}/organizations`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      reset();
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api.patch(`${BASE}/organizations/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`${BASE}/organizations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });

  const reset = () => {
    setFormOpen(false);
    setEditing(null);
    setName('');
    setSlug('');
    setPlan('');
    setActive(true);
    setShareInventory(false);
    setLogoUrl('');
  };

  const startCreate = () => {
    setEditing(null);
    reset();
    setFormOpen(true);
  };

  const startEdit = (o: Organization) => {
    setEditing(o);
    setName(o.name);
    setSlug(o.slug);
    setPlan(o.plan ?? '');
    setActive(o.active);
    setShareInventory(o.shareInventory);
    setLogoUrl(o.logoUrl ?? '');
    setFormOpen(true);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name,
      slug: slug.trim() || undefined,
      plan: plan.trim() || undefined,
      active,
      shareInventory,
      logoUrl: logoUrl.trim() || undefined,
    };
    if (editing) update.mutate({ id: editing.id, body });
    else create.mutate(body);
  };

  const busy = create.isPending || update.isPending;

  return (
    <>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Organizaciones</h3>
          <Button onClick={startCreate}>Nueva organización</Button>
        </div>

        {formOpen && (
          <Card style={{ marginTop: 'var(--ws-space-4)' }}>
            <h3>{editing ? 'Editar organización' : 'Nueva organización'}</h3>
            <form className="stack" onSubmit={onSubmit}>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
                <TextField label="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mi-org" />
                <TextField label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Opcional" />
                <TextField label="Logo URL" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa
                </label>
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={shareInventory} onChange={(e) => setShareInventory(e.target.checked)} /> Compartir inventario
                </label>
              </div>
              <div className="row">
                <Button type="submit" disabled={busy}>{editing ? 'Guardar' : 'Crear'}</Button>
                <Button variant="ghost" onClick={reset}>Cancelar</Button>
                {(create.isSuccess || update.isSuccess) && <span style={{ color: 'var(--ws-success)' }}>Guardado ✓</span>}
              </div>
              {create.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{create.error.message}</p>}
              {update.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{update.error.message}</p>}
            </form>
          </Card>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Slug</th>
              <th>Plan</th>
              <th>Compartir inventario</th>
              <th>Activa</th>
              <th>Miembros</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((o) => (
              <tr key={o.id}>
                <td>{o.name}</td>
                <td><code>{o.slug}</code></td>
                <td>{o.plan ?? '—'}</td>
                <td>{yesNo(o.shareInventory)}</td>
                <td>{yesNo(o.active)}</td>
                <td>{o.memberCount}</td>
                <td>
                  <div className="row">
                    <Button variant="secondary" onClick={() => startEdit(o)}>Editar</Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(o)}>Eliminar</Button>
                  </div>
                </td>
              </tr>
            ))}
            {organizations.length === 0 && (
              <tr><td colSpan={7}><p className="muted">No hay organizaciones.</p></td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar organización"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      >
        ¿Eliminar la organización <strong>{confirmDelete?.name}</strong>? Esta acción es irreversible.
      </ConfirmDialog>
    </>
  );
}

function PlansView({ plans }: { plans: Plan[] }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [features, setFeatures] = useState('');
  const [active, setActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<Plan | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`${BASE}/plans`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      reset();
    },
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api.patch(`${BASE}/plans/${vars.id}`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      reset();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`${BASE}/plans/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plans'] }),
  });

  const reset = () => {
    setFormOpen(false);
    setEditing(null);
    setName('');
    setPrice('');
    setDurationDays('');
    setFeatures('');
    setActive(true);
  };

  const startCreate = () => {
    setEditing(null);
    reset();
    setFormOpen(true);
  };

  const startEdit = (p: Plan) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.price));
    setDurationDays(String(p.durationDays));
    setFeatures((p.features ?? []).join(', '));
    setActive(p.active);
    setFormOpen(true);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name,
      price: Number(price),
      durationDays: Number(durationDays),
      features: features.split(',').map((s) => s.trim()).filter(Boolean),
      active,
    };
    if (editing) update.mutate({ id: editing.id, body });
    else create.mutate(body);
  };

  const busy = create.isPending || update.isPending;

  return (
    <>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Planes</h3>
          <Button onClick={startCreate}>Nuevo plan</Button>
        </div>

        {formOpen && (
          <Card style={{ marginTop: 'var(--ws-space-4)' }}>
            <h3>{editing ? 'Editar plan' : 'Nuevo plan'}</h3>
            <form className="stack" onSubmit={onSubmit}>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
                <TextField label="Precio" type="number" value={price} onChange={(e) => setPrice(e.target.value)} required />
                <TextField label="Duración (días)" type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} required />
                <TextField label="Características (separadas por coma)" value={features} onChange={(e) => setFeatures(e.target.value)} />
                <label className="row" style={{ gap: 6 }}>
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo
                </label>
              </div>
              <div className="row">
                <Button type="submit" disabled={busy}>{editing ? 'Guardar' : 'Crear'}</Button>
                <Button variant="ghost" onClick={reset}>Cancelar</Button>
                {(create.isSuccess || update.isSuccess) && <span style={{ color: 'var(--ws-success)' }}>Guardado ✓</span>}
              </div>
              {create.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{create.error.message}</p>}
              {update.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{update.error.message}</p>}
            </form>
          </Card>
        )}

        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Duración (días)</th>
              <th>Activo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.price}</td>
                <td>{p.durationDays}</td>
                <td>{yesNo(p.active)}</td>
                <td>
                  <div className="row">
                    <Button variant="secondary" onClick={() => startEdit(p)}>Editar</Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(p)}>Eliminar</Button>
                  </div>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr><td colSpan={5}><p className="muted">No hay planes.</p></td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar plan"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      >
        ¿Eliminar el plan <strong>{confirmDelete?.name}</strong>? Esta acción es irreversible.
      </ConfirmDialog>
    </>
  );
}

function MembershipsView({
  organizations,
  plans,
  memberships,
  loading,
}: {
  organizations: Organization[];
  plans: Plan[];
  memberships: Membership[];
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [filterOrg, setFilterOrg] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('member');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('active');
  const [endDate, setEndDate] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Membership | null>(null);
  const [qrMembership, setQrMembership] = useState<Membership | null>(null);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`${BASE}/memberships`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memberships'] });
      setFormOpen(false);
      setOrganizationId('');
      setUserId('');
      setRole('member');
      setPlan('');
      setStatus('active');
      setEndDate('');
    },
  });

  const renew = useMutation({
    mutationFn: (id: string) => api.patch(`${BASE}/memberships/${id}`, { renew: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`${BASE}/memberships/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['memberships'] }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      organizationId,
      userId: userId.trim(),
      role: role.trim() || undefined,
      plan: plan || undefined,
      status: status || undefined,
      endDate: endDate || undefined,
    };
    create.mutate(body);
  };

  const filtered = filterOrg ? memberships.filter((m) => m.organizationId === filterOrg) : memberships;

  return (
    <>
      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h3 style={{ margin: 0 }}>Membresías</h3>
          <Button onClick={() => setFormOpen((v) => !v)}>Crear membresía</Button>
        </div>

        <div className="row" style={{ alignItems: 'flex-end', marginTop: 'var(--ws-space-3)' }}>
          <div className="field">
            <label>Filtrar por organización</label>
            <select className="input" style={{ width: 'auto' }} value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)}>
              <option value="">Todas</option>
              {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        </div>

        {formOpen && (
          <Card style={{ marginTop: 'var(--ws-space-4)' }}>
            <h3>Crear membresía</h3>
            <form className="stack" onSubmit={onSubmit}>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="field">
                  <label>Organización</label>
                  <select className="input" style={{ width: 'auto' }} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} required>
                    <option value="">Seleccionar…</option>
                    {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <TextField label="Usuario (userId)" value={userId} onChange={(e) => setUserId(e.target.value)} required />
                <div className="field">
                  <label>Plan</label>
                  <select className="input" style={{ width: 'auto' }} value={plan} onChange={(e) => setPlan(e.target.value)}>
                    <option value="">Sin plan</option>
                    {plans.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Rol</label>
                  <select className="input" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="member">Miembro</option>
                    <option value="admin">Administrador</option>
                    <option value="owner">Dueño</option>
                  </select>
                </div>
                <div className="field">
                  <label>Estado</label>
                  <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="active">Activa</option>
                    <option value="paused">Pausada</option>
                    <option value="expired">Vencida</option>
                  </select>
                </div>
                <TextField label="Vencimiento (YYYY-MM-DD)" value={endDate} onChange={(e) => setEndDate(e.target.value)} placeholder="Opcional" />
              </div>
              <div className="row">
                <Button type="submit" disabled={create.isPending}>Crear</Button>
                <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
              </div>
              {create.error && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{create.error.message}</p>}
            </form>
          </Card>
        )}

        {loading ? (
          <Spinner />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Organización</th>
                <th>Plan</th>
                <th>Estado</th>
                <th>Vencimiento</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td>{m.userName || m.userId}</td>
                  <td>{m.organizationName}</td>
                  <td>{m.plan ?? '—'}</td>
                  <td>
                    <span className="badge" style={{ background: statusColor(m.status), color: '#fff' }}>{m.status}</span>
                  </td>
                  <td>{formatDate(m.endDate)}</td>
                  <td>
                    <div className="row">
                      <Button variant="secondary" onClick={() => setQrMembership(m)}>QR</Button>
                      <Button variant="secondary" onClick={() => renew.mutate(m.id)} disabled={renew.isPending}>Renovar</Button>
                      <Button variant="ghost" onClick={() => setConfirmDelete(m)}>Eliminar</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6}><p className="muted">No hay membresías.</p></td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {qrMembership && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setQrMembership(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <Card style={{ minWidth: 280, textAlign: 'center' }}>
              <h3 style={{ marginTop: 0 }}>QR · {qrMembership.userName || qrMembership.userId}</h3>
              <QrCode value={qrMembership.qrcode} />
              <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--ws-space-3)' }}>
                <Button variant="ghost" onClick={() => setQrMembership(null)}>Cerrar</Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar membresía"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      >
        ¿Eliminar la membresía de <strong>{confirmDelete?.userName ?? confirmDelete?.userId}</strong>? Esta acción es irreversible.
      </ConfirmDialog>
    </>
  );
}

function AttendanceView({
  attendance,
  stats,
  statsDays,
  setStatsDays,
  loading,
}: {
  attendance: AttendanceRecord[];
  stats: AttendanceStats | undefined;
  statsDays: number;
  setStatsDays: (n: number) => void;
  loading: boolean;
}) {
  const qc = useQueryClient();
  const [qrcode, setQrcode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  const scan = useMutation({
    mutationFn: (code: string) => api.post<ScanResult>(`${BASE}/attendance/scan`, { qrcode: code }),
    onSuccess: (r) => {
      setResult(r);
      if (r.ok) {
        setQrcode('');
        qc.invalidateQueries({ queryKey: ['attendance'] });
        qc.invalidateQueries({ queryKey: ['attendance-stats'] });
      }
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!qrcode.trim()) return;
    setResult(null);
    scan.mutate(qrcode.trim());
  };

  const orgName = result?.ok
    ? (result.membership?.organizationName ?? result.organization?.name ?? '')
    : '';
  const userName = result?.ok ? (result.membership?.userName ?? result.membership?.userId ?? '') : '';

  return (
    <>
      <Card>
        <h3>Registrar asistencia</h3>
        <form className="row" onSubmit={onSubmit} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label="Código QR" value={qrcode} onChange={(e) => setQrcode(e.target.value)} placeholder="UUID del QR" style={{ flex: 1, minWidth: 240 }} />
          <Button type="submit" disabled={scan.isPending}>Registrar</Button>
        </form>
        {result?.ok && <p style={{ color: 'var(--ws-success)' }}>✓ {orgName} - {userName}</p>}
        {result && !result.ok && <p style={{ color: 'var(--ws-danger)' }}>{result.error ?? 'No se pudo registrar la asistencia.'}</p>}
        {scan.error && <p style={{ color: 'var(--ws-danger)' }}>{scan.error.message}</p>}
      </Card>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h3 style={{ margin: 0 }}>Resumen</h3>
          <div className="field">
            <label>Últimos N días</label>
            <select className="input" style={{ width: 'auto' }} value={statsDays} onChange={(e) => setStatsDays(Number(e.target.value))}>
              <option value={7}>7</option>
              <option value={30}>30</option>
              <option value={90}>90</option>
            </select>
          </div>
        </div>
        <p style={{ fontSize: 'var(--ws-font-size-lg)', margin: 'var(--ws-space-2) 0 0' }}>
          <strong>{stats?.total ?? 0}</strong> <span className="muted">asistencias en {statsDays} días</span>
        </p>
      </Card>

      <Card>
        <h3>Últimos registros</h3>
        {loading ? (
          <Spinner />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha / hora</th>
                <th>Usuario</th>
                <th>Método</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.timestamp).toLocaleString('es')}</td>
                  <td>{a.userId}</td>
                  <td>{a.method}</td>
                </tr>
              ))}
              {attendance.length === 0 && (
                <tr><td colSpan={3}><p className="muted">No hay registros de asistencia.</p></td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
