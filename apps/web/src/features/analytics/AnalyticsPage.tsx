import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

interface Routine {
  id: string;
  trainerId: string;
  memberId: string;
  name: string;
  description: string | null;
  exercises: unknown[] | null;
  status: string;
  createdAt: string;
}

type View = 'resumen' | 'ingresos' | 'busqueda' | 'afiliados' | 'academia';

const REFERRAL_STATUSES = ['pending', 'accepted', 'converted', 'rejected'];

const fmt = (n: number) => n.toLocaleString('es-AR');

export function AnalyticsPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('resumen');

  const views: Array<{ id: View; label: string }> = [
    { id: 'resumen', label: t('admin.analytics.summary') },
    { id: 'ingresos', label: t('admin.analytics.revenue') },
    { id: 'busqueda', label: t('admin.analytics.search') },
    { id: 'afiliados', label: t('admin.analytics.affiliates') },
    { id: 'academia', label: t('admin.analytics.academy') },
  ];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)' }}>{t('admin.analytics.title')}</h1>
        {views.map((v) => (
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
  const { t } = useTranslation();
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
      <h2>{t('admin.analytics.summary')}</h2>

      <div className="grid-3">
        <Card>
          <strong>{t('admin.analytics.approvedRevenue')}</strong>
          <p>{fmt(summary?.approvedRevenue ?? 0)}</p>
        </Card>
        <Card>
          <strong>{t('admin.analytics.payments')}</strong>
          <p>{fmt(summary?.totalPayments ?? 0)}</p>
        </Card>
        <Card>
          <strong>{t('admin.analytics.users')}</strong>
          <p>{fmt(summary?.totalUsers ?? 0)}</p>
        </Card>
        <Card>
          <strong>{t('admin.analytics.orders')}</strong>
          <p>{fmt(summary?.totalOrders ?? 0)}</p>
        </Card>
        <Card>
          <strong>{t('admin.analytics.revenue30')}</strong>
          <p>{fmt(revenueTotal)}</p>
        </Card>
      </div>

      <Card>
        <h3>{t('admin.analytics.topProducts')}</h3>
        <div className="stack">
          {(topProducts ?? []).map((p, i) => (
            <div
              key={p.id ?? i}
              className="row"
              style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}
            >
              <span>{p.name ?? p.title ?? `${t('admin.analytics.product')} ${i + 1}`}</span>
              <span className="muted">{typeof p.sales === 'number' ? `${fmt(p.sales)} ${t('admin.analytics.sales')}` : ''}</span>
            </div>
          ))}
          {(topProducts ?? []).length === 0 && <p className="muted">{t('admin.analytics.noData')}</p>}
        </div>
      </Card>
    </div>
  );
}

function IngresosView() {
  const { t } = useTranslation();
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
      <h2>{t('admin.analytics.revenue')}</h2>

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <TextField label={t('admin.analytics.days')} type="number" value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 140 }} />
      </div>

      <Card>
        <strong>{t('admin.analytics.total')}</strong>
        <p>{fmt(total)}</p>
      </Card>

      {rows.length > 0 && (
        <Card>
          <table className="table">
            <thead>
              <tr>
                <th>{t('admin.analytics.day')}</th>
                <th>{t('admin.analytics.value')}</th>
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
  const { t } = useTranslation();
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
      <h2>{t('admin.analytics.search')}</h2>

      <form className="row" onSubmit={onSubmit} style={{ alignItems: 'flex-end', gap: 'var(--ws-space-2)' }}>
        <div style={{ flex: 1 }}>
          <TextField label={t('admin.analytics.query')} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.analytics.searchPlaceholder')} />
        </div>
        <Button type="submit" disabled={!q.trim()}>
          {t('admin.analytics.searchBtn')}
        </Button>
      </form>

      {isFetching && <Spinner />}

      {query.trim().length > 0 && !isFetching && (
        <div className="stack">
          <ResultList title={t('admin.analytics.content')} items={results.content} />
          <ResultList title={t('admin.analytics.posts')} items={results.posts} />
          <ResultList title={t('admin.analytics.products')} items={results.products} />
        </div>
      )}
    </div>
  );
}

function ResultList({ title, items }: { title: string; items: SearchItem[] }) {
  const { t } = useTranslation();
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
            <span>{it.title ?? it.name ?? `${t('admin.analytics.result')} ${i + 1}`}</span>
          </div>
        ))}
        {items.length === 0 && <p className="muted">{t('common.noResults')}</p>}
      </div>
    </Card>
  );
}

function AfiliadosView() {
  const { t } = useTranslation();
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
      <h2>{t('admin.analytics.affiliates')}</h2>

      <Card>
        <h3>{t('admin.analytics.createAffiliate')}</h3>
        <form className="row" onSubmit={submitAffiliate} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label={t('admin.analytics.userId')} value={userId} onChange={(e) => setUserId(e.target.value)} required />
          <TextField label={t('admin.analytics.codeOptional')} value={code} onChange={(e) => setCode(e.target.value)} />
          <TextField label={t('admin.analytics.commissionOptional')} type="number" value={commission} onChange={(e) => setCommission(e.target.value)} />
          <Button type="submit" disabled={createAffiliate.isPending || !userId}>
            {t('common.create')}
          </Button>
        </form>
      </Card>

      <Card>
        <h3>{t('admin.analytics.affiliateList')}</h3>
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.analytics.user')}</th>
              <th>{t('admin.analytics.code')}</th>
              <th>{t('admin.analytics.commission')}</th>
              <th>{t('admin.analytics.created')}</th>
              <th>{t('common.actions')}</th>
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
                    {t('common.delete')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(affiliates ?? []).length === 0 && <p className="muted">{t('admin.analytics.noAffiliates')}</p>}
      </Card>

      <Card>
        <h3>{t('admin.analytics.referrals')}</h3>
        <form className="row" onSubmit={submitReferral} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label={t('admin.analytics.affiliateId')} value={referralAffiliateId} onChange={(e) => setReferralAffiliateId(e.target.value)} required />
          <TextField label={t('common.email')} type="email" value={referralEmail} onChange={(e) => setReferralEmail(e.target.value)} required />
          <Button type="submit" disabled={createReferral.isPending || !referralAffiliateId || !referralEmail}>
            {t('common.add')}
          </Button>
        </form>

        <table className="table" style={{ marginTop: 'var(--ws-space-3)' }}>
          <thead>
            <tr>
              <th>{t('common.email')}</th>
              <th>{t('admin.analytics.affiliate')}</th>
              <th>{t('common.status')}</th>
              <th>{t('admin.analytics.created')}</th>
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
        {(referrals ?? []).length === 0 && <p className="muted">{t('admin.analytics.noReferrals')}</p>}
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('admin.analytics.deleteAffiliate')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (confirmDelete) removeAffiliate.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        {t('admin.analytics.deleteAffiliateConfirm', { code: confirmDelete?.code })}
      </ConfirmDialog>
    </div>
  );
}

function AcademiaView() {
  const { t } = useTranslation();
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

  const { data: routines } = useQuery({
    queryKey: ['academia-routines'],
    queryFn: () => api.get<Routine[]>(`${ACADEMIA}/routines`),
  });
  const [rtTrainerId, setRtTrainerId] = useState('');
  const [rtMemberId, setRtMemberId] = useState('');
  const [rtName, setRtName] = useState('');
  const [rtExercises, setRtExercises] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['academia-courses'] });
    qc.invalidateQueries({ queryKey: ['academia-enrollments'] });
    qc.invalidateQueries({ queryKey: ['academia-routines'] });
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

  const createRoutine = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = { trainerId: rtTrainerId, memberId: rtMemberId, name: rtName || 'Rutina' };
      const exercises = parseLessons(rtExercises);
      if (exercises) body.exercises = exercises;
      return api.post<Routine>(`${ACADEMIA}/routines`, body);
    },
    onSuccess: () => {
      invalidate();
      setRtTrainerId('');
      setRtMemberId('');
      setRtName('');
      setRtExercises('');
    },
  });

  const removeRoutine = useMutation({
    mutationFn: (id: string) => api.del(`${ACADEMIA}/routines/${id}`),
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
      <h2>{t('admin.analytics.academy')}</h2>

      <Card>
        <h3>{editingCourse ? t('admin.analytics.editCourse') : t('admin.analytics.createCourse')}</h3>
        <form className="stack" onSubmit={submitCourse}>
          <TextField label={t('common.title')} value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <TextField label={t('admin.analytics.level')} value={level} onChange={(e) => setLevel(e.target.value)} />
            <TextField label={t('admin.analytics.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <TextField
            label={t('admin.analytics.lessonsJson')}
            value={lessonsRaw}
            onChange={(e) => setLessonsRaw(e.target.value)}
            placeholder='[{"title":"Introducción"}]'
          />
          <div className="row">
            <Button type="submit" disabled={createCourse.isPending || updateCourse.isPending || !title}>
              {editingCourse ? t('common.save') : t('common.create')}
            </Button>
            {editingCourse && (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingCourse(null);
                  resetCourseForm();
                }}
              >
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card>
        <h3>{t('admin.analytics.courses')}</h3>
        <table className="table">
          <thead>
            <tr>
              <th>{t('common.title')}</th>
              <th>{t('admin.analytics.level')}</th>
              <th>{t('admin.analytics.lessons')}</th>
              <th>{t('admin.analytics.description')}</th>
              <th>{t('common.actions')}</th>
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
                      {t('common.edit')}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmCourse(c)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(courses ?? []).length === 0 && <p className="muted">{t('admin.analytics.noCourses')}</p>}
      </Card>

      <Card>
        <h3>{t('admin.analytics.enrollStudent')}</h3>
        <form className="row" onSubmit={submitEnrollment} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField label={t('admin.analytics.courseId')} value={enrollCourseId} onChange={(e) => setEnrollCourseId(e.target.value)} required />
          <TextField label={t('admin.analytics.student')} value={enrollStudent} onChange={(e) => setEnrollStudent(e.target.value)} required />
          <Button type="submit" disabled={createEnrollment.isPending || !enrollCourseId || !enrollStudent}>
            {t('admin.analytics.enroll')}
          </Button>
        </form>
      </Card>

      <Card>
        <h3>{t('admin.analytics.enrollments')}</h3>
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.analytics.student')}</th>
              <th>{t('admin.analytics.course')}</th>
              <th>{t('admin.analytics.progress')}</th>
              <th>{t('admin.analytics.completed')}</th>
              <th>{t('admin.analytics.created')}</th>
              <th>{t('common.actions')}</th>
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
        {(enrollments ?? []).length === 0 && <p className="muted">{t('admin.analytics.noEnrollments')}</p>}
      </Card>

      <Card>
        <h3>{t('admin.analytics.routines')}</h3>
        <form
          className="row"
          onSubmit={(e) => { e.preventDefault(); createRoutine.mutate(); }}
          style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <TextField label={t('admin.analytics.trainerId')} value={rtTrainerId} onChange={(e) => setRtTrainerId(e.target.value)} required />
          <TextField label={t('admin.analytics.memberId')} value={rtMemberId} onChange={(e) => setRtMemberId(e.target.value)} required />
          <TextField label={t('common.name')} value={rtName} onChange={(e) => setRtName(e.target.value)} placeholder="Rutina" />
          <TextField label={t('admin.analytics.exercisesJson')} value={rtExercises} onChange={(e) => setRtExercises(e.target.value)} placeholder='[{"name":"Press banca","sets":3}]' />
          <Button type="submit" disabled={createRoutine.isPending || !rtTrainerId || !rtMemberId}>
            {t('admin.analytics.createRoutine')}
          </Button>
        </form>
        <table className="table" style={{ marginTop: 'var(--ws-space-3)' }}>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('admin.analytics.trainer')}</th>
              <th>{t('admin.analytics.client')}</th>
              <th>{t('admin.analytics.exercises')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {(routines ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td><code>{r.trainerId}</code></td>
                <td><code>{r.memberId}</code></td>
                <td>{Array.isArray(r.exercises) ? r.exercises.length : '—'}</td>
                <td><span className="badge">{r.status}</span></td>
                <td>
                  <Button variant="ghost" onClick={() => removeRoutine.mutate(r.id)}>
                    {t('common.delete')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(routines ?? []).length === 0 && <p className="muted">{t('admin.analytics.noRoutines')}</p>}
      </Card>

      <ConfirmDialog
        open={confirmCourse !== null}
        title={t('admin.analytics.deleteCourse')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (confirmCourse) removeCourse.mutate(confirmCourse.id);
          setConfirmCourse(null);
        }}
        onCancel={() => setConfirmCourse(null)}
      >
        {t('admin.analytics.deleteCourseConfirm', { title: confirmCourse?.title })}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmEnrollment !== null}
        title={t('admin.analytics.deleteEnrollment')}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (confirmEnrollment) removeEnrollment.mutate(confirmEnrollment.id);
          setConfirmEnrollment(null);
        }}
        onCancel={() => setConfirmEnrollment(null)}
      >
        {t('admin.analytics.deleteEnrollmentConfirm', { student: confirmEnrollment?.student })}
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
  const { t } = useTranslation();
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
            {t('common.save')}
          </Button>
        </div>
      </td>
      <td>{enrollment.completedAt ? new Date(enrollment.completedAt).toLocaleDateString() : '—'}</td>
      <td>{new Date(enrollment.createdAt).toLocaleDateString()}</td>
      <td>
        <Button variant="ghost" onClick={() => onDelete(enrollment)}>
          {t('common.delete')}
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
