import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const ANALYTICS = '/api/v1/blocks/analytics';
const SEARCH = '/api/v1/blocks/search';
const AFILIADOS = '/api/v1/blocks/afiliados';
const ACADEMIA = '/api/v1/blocks/academia';

interface AnalyticsSummary {
  approvedRevenue: number;
  totalPayments: number;
  totalUsers: number;
  totalOrders: number;
}

interface RevenueData {
  total?: number;
  revenue?: number;
  days?: RevenueDay[];
  series?: RevenueDay[];
}

interface RevenueDay {
  label?: string;
  date?: string;
  value?: number;
  total?: number;
  revenue?: number;
}

interface TopProduct {
  id?: string;
  name?: string;
  title?: string;
  sales?: number;
  revenue?: number;
}

interface SearchItem {
  id?: string;
  title?: string;
  name?: string;
}

interface SearchResults {
  results: {
    content: SearchItem[];
    posts: SearchItem[];
    products: SearchItem[];
  };
}

interface Affiliate {
  id: string;
  userId: string;
  code: string;
  commission: number;
  createdAt: string;
}

interface Referral {
  id: string;
  affiliateId: string;
  email: string;
  status: string;
  createdAt: string;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  level: string | null;
  lessons: unknown[] | null;
}

interface Enrollment {
  id: string;
  courseId: string;
  student: string;
  progress: number;
  completedAt: string | null;
  createdAt: string;
}

type View = 'resumen' | 'ingresos' | 'busqueda' | 'afiliados' | 'academia';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'busqueda', label: 'Búsqueda' },
  { id: 'afiliados', label: 'Afiliados' },
  { id: 'academia', label: 'Academia' },
];

const REFERRAL_STATUSES = ['pending', 'accepted', 'converted', 'rejected'];

const fmt = (n: number) => n.toLocaleString('es-AR');

export function AnalyticsPage() {
  const [view, setView] = useState<View>('resumen');

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)' }}>Analítica</h1>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`nav-link ${v.id === view ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'resumen' && <ResumenView />}
        {view === 'ingresos' && <IngresosView />}
        {view === 'busqueda' && <BusquedaView />}
        {view === 'afiliados' && <AfiliadosView />}
        {view === 'academia' && <AcademiaView />}
      </div>
    </div>
  );
}

function ResumenView() {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => api.get<AnalyticsSummary>(`${ANALYTICS}/summary`),
  });
  const { data: revenue } = useQuery({
    queryKey: ['analytics-revenue', 30],
    queryFn: () => api.get<RevenueData>(`${ANALYTICS}/revenue?days=30`),
  });
  const { data: topProducts } = useQuery({
    queryKey: ['analytics-top-products'],
    queryFn: () => api.get<TopProduct[]>(`${ANALYTICS}/top-products`),
  });

  if (isLoading) return <Spinner />;

  const revenueTotal = revenue?.total ?? revenue?.revenue ?? 0;

  return (
    <div className="stack">
      <h2>Resumen</h2>

      <div className="grid-3">
        <Card>
          <strong>Ingresos aprobados</strong>
          <p>{fmt(summary?.approvedRevenue ?? 0)}</p>
        </Card>
        <Card>
          <strong>Pagos</strong>
          <p>{fmt(summary?.totalPayments ?? 0)}</p>
        </Card>
        <Card>
          <strong>Usuarios</strong>
          <p>{fmt(summary?.totalUsers ?? 0)}</p>
        </Card>
        <Card>
          <strong>Órdenes</strong>
          <p>{fmt(summary?.totalOrders ?? 0)}</p>
        </Card>
        <Card>
          <strong>Ingresos (30 días)</strong>
          <p>{fmt(revenueTotal)}</p>
        </Card>
      </div>

      <Card>
        <h3>Productos más vendidos</h3>
        <div className="stack">
          {(topProducts ?? []).map((p, i) => (
            <div
              key={p.id ?? i}
              className="row"
              style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}
            >
              <span>{p.name ?? p.title ?? `Producto ${i + 1}`}</span>
              <span className="muted">{typeof p.sales === 'number' ? `${fmt(p.sales)} ventas` : ''}</span>
            </div>
          ))}
          {(topProducts ?? []).length === 0 && <p className="muted">Sin datos.</p>}
        </div>
      </Card>
    </div>
  );
}

function IngresosView() {
  const [days, setDays] = useState('30');
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-revenue', days],
    queryFn: () => api.get<RevenueData>(`${ANALYTICS}/revenue?days=${encodeURIComponent(days)}`),
  });

  if (isLoading) return <Spinner />;

  const total = data?.total ?? data?.revenue ?? 0;
  const rows = data?.days ?? data?.series ?? [];

  return (
    <div className="stack">
      <h2>Ingresos</h2>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <TextField label="Días" type="number" value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 140 }} />
      </div>

      <Card>
        <strong>Total</strong>
        <p>{fmt(total)}</p>
      </Card>

      {rows.length > 0 && (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>Día</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={i}>
                  <td>{d.label ?? d.date ?? `#${i + 1}`}</td>
                  <td>{fmt(d.value ?? d.total ?? d.revenue ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function BusquedaView() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.get<SearchResults>(`${SEARCH}/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(q.trim());
  };

  const results = data?.results ?? { content: [], posts: [], products: [] };

  return (
    <div className="stack">
      <h2>Búsqueda</h2>

      <form className="row" onSubmit={onSubmit} style={{ alignItems: 'flex-end', gap: 'var(--ws-space-2)' }}>
        <div style={{ flex: 1 }}>
          <TextField label="Consulta" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" />
        </div>
        <Button type="submit" disabled={!q.trim()}>
          Buscar
        </Button>
      </form>

      {isFetching && <Spinner />}

      {query.trim().length > 0 && !isFetching && (
        <div className="stack">
          <ResultList title="Contenido" items={results.content} />
          <ResultList title="Posts" items={results.posts} />
          <ResultList title="Productos" items={results.products} />
        </div>
      )}
    </div>
  );
}

function ResultList({ title, items }: { title: string; items: SearchItem[] }) {
  return (
    <Card>
      <h3>{title}</h3>
      <div className="stack">
        {items.map((it, i) => (
          <div
            key={it.id ?? i}
            className="row"
            style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}
          >
            <span>{it.title ?? it.name ?? `Resultado ${i + 1}`}</span>
          </div>
        ))}
        {items.length === 0 && <p className="muted">Sin resultados.</p>}
      </div>
    </Card>
  );
}

function AfiliadosView() {
  const qc = useQueryClient();

  const { data: affiliates, isLoading } = useQuery({
    queryKey: ['afiliados-affiliates'],
    queryFn: () => api.get<Affiliate[]>(`${AFILIADOS}/affiliates`),
  });
  const { data: referrals } = useQuery({
    queryKey: ['afiliados-referrals'],
    queryFn: () => api.get<Referral[]>(`${AFILIADOS}/referrals`),
  });

  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [commission, setCommission] = useState('');

  const [referralAffiliateId, setReferralAffiliateId] = useState('');
  const [referralEmail, setReferralEmail] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<Affiliate | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['afiliados-affiliates'] });
    qc.invalidateQueries({ queryKey: ['afiliados-referrals'] });
  };

  const createAffiliate = useMutation({
    mutationFn: () =>
      api.post<Affiliate>(`${AFILIADOS}/affiliates`, {
        userId,
        ...(code ? { code } : {}),
        ...(commission ? { commission: Number(commission) } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setUserId('');
      setCode('');
      setCommission('');
    },
  });

  const removeAffiliate = useMutation({
    mutationFn: (id: string) => api.del(`${AFILIADOS}/affiliates/${id}`),
    onSuccess: invalidate,
  });

  const createReferral = useMutation({
    mutationFn: () => api.post<Referral>(`${AFILIADOS}/referrals`, { affiliateId: referralAffiliateId, email: referralEmail }),
    onSuccess: () => {
      invalidate();
      setReferralAffiliateId('');
      setReferralEmail('');
    },
  });

  const patchReferral = useMutation({
    mutationFn: (vars: { id: string; status: string }) => api.patch(`${AFILIADOS}/referrals/${vars.id}`, { status: vars.status }),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  const submitAffiliate = (e: FormEvent) => {
    e.preventDefault();
    createAffiliate.mutate();
  };

  const submitReferral = (e: FormEvent) => {
    e.preventDefault();
    createReferral.mutate();
  };

  return (
    <div className="stack">
      <h2>Afiliados</h2>

      <Card>
        <h3>Crear afiliado</h3>
        <form className="row" onSubmit={submitAffiliate} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label="ID de usuario" value={userId} onChange={(e) => setUserId(e.target.value)} required />
          <TextField label="Código (opcional)" value={code} onChange={(e) => setCode(e.target.value)} />
          <TextField label="Comisión (opcional)" type="number" value={commission} onChange={(e) => setCommission(e.target.value)} />
          <Button type="submit" disabled={createAffiliate.isPending || !userId}>
            Crear
          </Button>
        </form>
      </Card>

      <Card>
        <h3>Lista de afiliados</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Código</th>
              <th>Comisión</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(affiliates ?? []).map((a) => (
              <tr key={a.id}>
                <td>
                  <code>{a.userId}</code>
                </td>
                <td>
                  <code>{a.code}</code>
                </td>
                <td>{a.commission}</td>
                <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                <td>
                  <Button variant="ghost" onClick={() => setConfirmDelete(a)}>
                    Eliminar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(affiliates ?? []).length === 0 && <p className="muted">Sin afiliados.</p>}
      </Card>

      <Card>
        <h3>Referidos</h3>
        <form className="row" onSubmit={submitReferral} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label="ID de afiliado" value={referralAffiliateId} onChange={(e) => setReferralAffiliateId(e.target.value)} required />
          <TextField label="Email" type="email" value={referralEmail} onChange={(e) => setReferralEmail(e.target.value)} required />
          <Button type="submit" disabled={createReferral.isPending || !referralAffiliateId || !referralEmail}>
            Agregar
          </Button>
        </form>

        <table className="table" style={{ marginTop: 'var(--ws-space-3)' }}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Afiliado</th>
              <th>Estado</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {(referrals ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.email}</td>
                <td>
                  <code>{r.affiliateId}</code>
                </td>
                <td>
                  <select
                    className="input"
                    value={r.status}
                    onChange={(e) => patchReferral.mutate({ id: r.id, status: e.target.value })}
                  >
                    {Array.from(new Set([...REFERRAL_STATUSES, r.status])).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(referrals ?? []).length === 0 && <p className="muted">Sin referidos.</p>}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Eliminar afiliado"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmDelete) removeAffiliate.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        ¿Eliminar el afiliado <strong>{confirmDelete?.code}</strong>? Esta acción es irreversible.
      </ConfirmDialog>
    </div>
  );
}

function AcademiaView() {
  const qc = useQueryClient();

  const { data: courses, isLoading } = useQuery({
    queryKey: ['academia-courses'],
    queryFn: () => api.get<Course[]>(`${ACADEMIA}/courses`),
  });
  const { data: enrollments } = useQuery({
    queryKey: ['academia-enrollments'],
    queryFn: () => api.get<Enrollment[]>(`${ACADEMIA}/enrollments`),
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('');
  const [lessonsRaw, setLessonsRaw] = useState('');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const [enrollCourseId, setEnrollCourseId] = useState('');
  const [enrollStudent, setEnrollStudent] = useState('');

  const [confirmCourse, setConfirmCourse] = useState<Course | null>(null);
  const [confirmEnrollment, setConfirmEnrollment] = useState<Enrollment | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['academia-courses'] });
    qc.invalidateQueries({ queryKey: ['academia-enrollments'] });
  };

  const resetCourseForm = () => {
    setTitle('');
    setDescription('');
    setLevel('');
    setLessonsRaw('');
  };

  const startEdit = (c: Course) => {
    setEditingCourse(c);
    setTitle(c.title);
    setDescription(c.description ?? '');
    setLevel(c.level ?? '');
    setLessonsRaw(c.lessons ? JSON.stringify(c.lessons) : '');
  };

  const createCourse = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Course>(`${ACADEMIA}/courses`, body),
    onSuccess: () => {
      invalidate();
      resetCourseForm();
    },
  });

  const updateCourse = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) => api.patch<Course>(`${ACADEMIA}/courses/${vars.id}`, vars.body),
    onSuccess: () => {
      invalidate();
      setEditingCourse(null);
      resetCourseForm();
    },
  });

  const removeCourse = useMutation({
    mutationFn: (id: string) => api.del(`${ACADEMIA}/courses/${id}`),
    onSuccess: invalidate,
  });

  const createEnrollment = useMutation({
    mutationFn: () => api.post<Enrollment>(`${ACADEMIA}/enrollments`, { courseId: enrollCourseId, student: enrollStudent }),
    onSuccess: () => {
      invalidate();
      setEnrollCourseId('');
      setEnrollStudent('');
    },
  });

  const patchEnrollment = useMutation({
    mutationFn: (vars: { id: string; progress: number }) => api.patch(`${ACADEMIA}/enrollments/${vars.id}`, { progress: vars.progress }),
    onSuccess: invalidate,
  });

  const removeEnrollment = useMutation({
    mutationFn: (id: string) => api.del(`${ACADEMIA}/enrollments/${id}`),
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner />;

  const submitCourse = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = { title };
    if (description) body.description = description;
    if (level) body.level = level;
    const lessons = parseLessons(lessonsRaw);
    if (lessons) body.lessons = lessons;
    if (editingCourse) updateCourse.mutate({ id: editingCourse.id, body });
    else createCourse.mutate(body);
  };

  const submitEnrollment = (e: FormEvent) => {
    e.preventDefault();
    createEnrollment.mutate();
  };

  return (
    <div className="stack">
      <h2>Academia</h2>

      <Card>
        <h3>{editingCourse ? 'Editar curso' : 'Crear curso'}</h3>
        <form className="stack" onSubmit={submitCourse}>
          <TextField label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField label="Nivel" value={level} onChange={(e) => setLevel(e.target.value)} />
            <TextField label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <TextField
            label="Lecciones (JSON opcional)"
            value={lessonsRaw}
            onChange={(e) => setLessonsRaw(e.target.value)}
            placeholder='[{"title":"Introducción"}]'
          />
          <div className="row">
            <Button type="submit" disabled={createCourse.isPending || updateCourse.isPending || !title}>
              {editingCourse ? 'Guardar' : 'Crear'}
            </Button>
            {editingCourse && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingCourse(null);
                  resetCourseForm();
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <h3>Cursos</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Título</th>
              <th>Nivel</th>
              <th>Lecciones</th>
              <th>Descripción</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(courses ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.title}</td>
                <td>{c.level ?? '—'}</td>
                <td>{Array.isArray(c.lessons) ? c.lessons.length : '—'}</td>
                <td>
                  <span className="muted">{c.description ?? '—'}</span>
                </td>
                <td>
                  <div className="row">
                    <Button variant="secondary" onClick={() => startEdit(c)}>
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmCourse(c)}>
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(courses ?? []).length === 0 && <p className="muted">Sin cursos.</p>}
      </Card>

      <Card>
        <h3>Matricular estudiante</h3>
        <form className="row" onSubmit={submitEnrollment} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label="ID de curso" value={enrollCourseId} onChange={(e) => setEnrollCourseId(e.target.value)} required />
          <TextField label="Estudiante" value={enrollStudent} onChange={(e) => setEnrollStudent(e.target.value)} required />
          <Button type="submit" disabled={createEnrollment.isPending || !enrollCourseId || !enrollStudent}>
            Matricular
          </Button>
        </form>
      </Card>

      <Card>
        <h3>Matrículas</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>Curso</th>
              <th>Progreso</th>
              <th>Completado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(enrollments ?? []).map((e) => (
              <EnrollmentRow
                key={e.id}
                enrollment={e}
                onPatch={(id, progress) => patchEnrollment.mutate({ id, progress })}
                onDelete={(enrollment) => setConfirmEnrollment(enrollment)}
              />
            ))}
          </tbody>
        </table>
        {(enrollments ?? []).length === 0 && <p className="muted">Sin matrículas.</p>}
      </Card>

      <ConfirmDialog
        open={confirmCourse !== null}
        title="Eliminar curso"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmCourse) removeCourse.mutate(confirmCourse.id);
          setConfirmCourse(null);
        }}
        onCancel={() => setConfirmCourse(null)}
      >
        ¿Eliminar el curso <strong>{confirmCourse?.title}</strong>? Esta acción es irreversible.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmEnrollment !== null}
        title="Eliminar matrícula"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          if (confirmEnrollment) removeEnrollment.mutate(confirmEnrollment.id);
          setConfirmEnrollment(null);
        }}
        onCancel={() => setConfirmEnrollment(null)}
      >
        ¿Eliminar la matrícula de <strong>{confirmEnrollment?.student}</strong>? Esta acción es irreversible.
      </ConfirmDialog>
    </div>
  );
}

function EnrollmentRow({
  enrollment,
  onPatch,
  onDelete,
}: {
  enrollment: Enrollment;
  onPatch: (id: string, progress: number) => void;
  onDelete: (enrollment: Enrollment) => void;
}) {
  const [progress, setProgress] = useState(String(enrollment.progress));

  return (
    <tr>
      <td>{enrollment.student}</td>
      <td>
        <code>{enrollment.courseId}</code>
      </td>
      <td>
        <div className="row">
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
            style={{ width: 80 }}
          />
          <Button variant="secondary" onClick={() => onPatch(enrollment.id, Number(progress))}>
            Guardar
          </Button>
        </div>
      </td>
      <td>{enrollment.completedAt ? new Date(enrollment.completedAt).toLocaleDateString() : '—'}</td>
      <td>{new Date(enrollment.createdAt).toLocaleDateString()}</td>
      <td>
        <Button variant="ghost" onClick={() => onDelete(enrollment)}>
          Eliminar
        </Button>
      </td>
    </tr>
  );
}

function parseLessons(raw: string): unknown[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
