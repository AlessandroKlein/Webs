import { Link } from 'react-router-dom';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import { useTranslation } from 'react-i18next';
import { api, uploadFile } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { useLocaleStore } from '../../lib/locale-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { QrCode } from '../../components/ui/QrCode';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PromptDialog } from '../../components/ui/PromptDialog';
import { MyInvoices } from '../invoices/MyInvoices';

interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    birthDate: string | null;
    username: string | null;
    avatarUrl: string | null;
    locale: string;
    active: boolean;
    profile: Record<string, unknown> | null;
  } | null;
  permissions: string[];
  twoFactorEnabled: boolean;
}

interface ProfileField {
  key: string;
  label: string;
  type?: string;
  options?: string;
  required?: boolean;
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

interface Order {
  id: string;
  status: string;
  total: number;
  items: unknown[];
  createdAt: string;
}

interface Booking {
  id: string;
  serviceId: string;
  name: string;
  date: string;
  status: string;
}

const ACADEMIA = '/api/v1/blocks/academia';

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

type Tab = 'summary' | 'profile' | 'medical' | 'notifications' | 'security' | 'connections' | 'password' | 'danger' | 'invoices';

export function AccountPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const catalog = useLocaleStore((s) => s.catalog);
  const enabledLocales = useLocaleStore((s) => s.enabled);
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/api/v1/auth/me'),
  });
  const { data: blocksData } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.get<{ installed: Array<{ pluginId: string; enabled: boolean }> }>('/api/v1/blocks'),
  });

  const updateProfile = useMutation({
    mutationFn: (body: {
      displayName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      birthDate?: string | null;
      username?: string | null;
      avatarUrl?: string | null;
      locale?: string;
      profile?: Record<string, unknown>;
    }) => api.patch('/api/v1/auth/me', body),
    onSuccess: () => {
      setProfileSaved(true);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  const deleteAccount = useMutation({
    mutationFn: () => api.del('/api/v1/auth/me'),
    onSuccess: async () => {
      await logout();
      window.location.href = '/';
    },
  });

  const twilioInstalled = blocksData?.installed?.some((b) => b.pluginId === 'twilio' && b.enabled);
  const academiaInstalled = blocksData?.installed?.some((b) => b.pluginId === 'academia' && b.enabled);
  const socialLoginInstalled = blocksData?.installed?.some((b) => b.pluginId === 'social-login' && b.enabled);

  const { data: profileFieldsData } = useQuery({
    queryKey: ['profile-fields'],
    queryFn: () => api.get<{ fields: ProfileField[] }>('/api/v1/public/profile-fields'),
    retry: 0,
  });
  const customFields = profileFieldsData?.fields ?? [];

  const [tab, setTab] = useState<Tab>('summary');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>(data?.user?.avatarUrl ?? '');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  // Sincroniza avatar y campos personalizados cuando carga el perfil.
  useEffect(() => {
    setAvatarUrl(data?.user?.avatarUrl ?? '');
    const initial: Record<string, string> = {};
    const profile = data?.user?.profile ?? {};
    for (const [k, v] of Object.entries(profile)) {
      if (v !== null && v !== undefined) initial[k] = String(v);
    }
    setCustomValues(initial);
  }, [data?.user?.id]);

  if (isLoading) return <Spinner />;

  const onProfile = (e: FormEvent) => {
    e.preventDefault();
    setProfileSaved(false);
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const displayName = (fd.get('displayName') as string) || null;
    const firstName = (fd.get('firstName') as string) || null;
    const lastName = (fd.get('lastName') as string) || null;
    const birthDate = (fd.get('birthDate') as string) || null;
    const username = (fd.get('username') as string) || null;
    const locale = (fd.get('locale') as string) || 'es';
    const profile: Record<string, unknown> = {};
    for (const f of customFields) {
      const v = customValues[f.key];
      if (v !== undefined && v !== '') profile[f.key] = v;
    }
    updateProfile.mutate({ displayName, firstName, lastName, birthDate, username, avatarUrl: avatarUrl || null, locale, profile });
  };

  const onAvatarUpload = async (file: File) => {
    setAvatarUploading(true);
    try {
      const res = await uploadFile<{ url: string }>('/api/v1/media/upload', file);
      setAvatarUrl(res.url);
    } catch {
      /* si no tiene permiso media.write, se cae al input de URL manual */
    } finally {
      setAvatarUploading(false);
    }
  };

  const tabLabel = (tab: Tab): string =>
    tab === 'summary'
      ? t('admin.account.summary')
      : tab === 'profile'
        ? t('admin.account.profile')
        : tab === 'medical'
          ? 'Datos médicos'
          : tab === 'notifications'
          ? 'Notificaciones'
          : tab === 'security'
            ? t('admin.account.security')
          : tab === 'connections'
            ? 'Conexiones'
            : tab === 'password'
              ? t('admin.account.changePassword')
              : tab === 'invoices'
                ? t('admin.account.myInvoices')
                : t('admin.account.dangerZone');

  const tabs: Tab[] = socialLoginInstalled
    ? ['summary', 'profile', 'medical', 'notifications', 'security', 'connections', 'password', 'danger', 'invoices']
    : ['summary', 'profile', 'medical', 'notifications', 'security', 'password', 'danger', 'invoices'];

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
          <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.account')}</h1>
          {tabs.map((tabKey) => (
            <button
              key={tabKey}
              className={`nav-link ${tab === tabKey ? 'active' : ''}`}
              style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setTab(tabKey)}
            >
              {tabLabel(tabKey)}
            </button>
          ))}
        </aside>

        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {tab === 'summary' && (
          <SummaryView user={data?.user ?? null} academiaInstalled={!!academiaInstalled} onNavigate={setTab} />
        )}

        {tab === 'invoices' && <MyInvoices userId={data?.user?.id ?? ''} />}

        {tab === 'profile' && (
          <>
            <Card>
              <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-4)' }}>
                {data?.user?.avatarUrl ? (
                  <img
                    src={data.user.avatarUrl}
                    alt={t('admin.account.avatar')}
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
                    {(data?.user?.displayName ?? data?.user?.email ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="stack" style={{ gap: 2 }}>
                  <h2 style={{ margin: 0 }}>{data?.user?.displayName ?? data?.user?.email}</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    <i className="bi bi-envelope" /> {data?.user?.email}
                    {data?.user?.username ? <span> · @{data.user.username}</span> : ''}
                  </p>
                  <span
                    className="badge"
                    style={{ alignSelf: 'flex-start', background: data?.user?.active ? 'var(--ws-success, #16a34a)' : 'var(--ws-danger)', color: '#fff' }}
                  >
                    {data?.user?.active ? t('admin.account.active') : t('admin.account.inactive')}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <h3>{t('admin.account.profileData')}</h3>
              <form className="stack" onSubmit={onProfile}>
                <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-4)' }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--ws-border)' }} />
                  ) : (
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--ws-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.7rem', fontWeight: 700 }}>
                      {(data?.user?.displayName ?? data?.user?.email ?? '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="stack" style={{ gap: 'var(--ws-space-2)', flex: 1, minWidth: 220 }}>
                    <label className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>Avatar</label>
                    <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <label className="btn ghost" style={{ cursor: 'pointer', margin: 0 }}>
                        {avatarUploading ? 'Subiendo…' : 'Subir imagen'}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          disabled={avatarUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void onAvatarUpload(file);
                          }}
                        />
                      </label>
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 180 }}
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="https://… (o URL)"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid-2" style={{ gap: 'var(--ws-space-3)' }}>
                  <TextField label="Nombre" name="displayName" defaultValue={data?.user?.displayName ?? ''} placeholder="Nombre visible" />
                  <TextField label="Nombre (pila)" name="firstName" defaultValue={data?.user?.firstName ?? ''} placeholder="Juan" />
                  <TextField label="Apellido" name="lastName" defaultValue={data?.user?.lastName ?? ''} placeholder="Pérez" />
                  <TextField label="Nombre de usuario" name="username" defaultValue={data?.user?.username ?? ''} placeholder="usuario" />
                  <div className="field">
                    <label>Fecha de nacimiento</label>
                    <input className="input" type="date" name="birthDate" defaultValue={data?.user?.birthDate ? data.user.birthDate.slice(0, 10) : ''} />
                  </div>
                  <div className="field">
                    <label>{t('lang.label')}</label>
                    <select className="input" name="locale" defaultValue={data?.user?.locale ?? 'es'}>
                      {catalog
                        .filter((l) => enabledLocales.includes(l.code))
                        .map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.nativeLabel}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {customFields.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}>
                    <h4 style={{ marginTop: 0 }}>Datos adicionales</h4>
                    <div className="grid-2" style={{ gap: 'var(--ws-space-3)' }}>
                      {customFields.map((f) => (
                        <div className="field" key={f.key}>
                          <label>
                            {f.label}
                            {f.required && <span style={{ color: 'var(--ws-danger)' }}> *</span>}
                          </label>
                          {f.type === 'select' ? (
                            <select
                              className="input"
                              value={customValues[f.key] ?? ''}
                              required={f.required}
                              onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            >
                              <option value="">—</option>
                              {(f.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="input"
                              type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                              value={customValues[f.key] ?? ''}
                              required={f.required}
                              onChange={(e) => setCustomValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {profileSaved && (
                  <p className="muted" style={{ color: 'var(--ws-success, #16a34a)', margin: 0 }}>
                    <i className="bi bi-check-circle" /> {t('admin.account.profileSaved')}
                  </p>
                )}
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? t('admin.account.saving') : t('admin.account.saveProfile')}
                  </Button>
                </div>
              </form>
            </Card>
          </>
        )}

        {tab === 'medical' && <MedicalCard user={data?.user ?? null} />}

        {tab === 'notifications' && <NotificationPrefsCard user={data?.user ?? null} />}

        {tab === 'security' && (
          <>
            <TwoFactorCard enabled={data?.twoFactorEnabled ?? false} onChanged={() => qc.invalidateQueries({ queryKey: ['me'] })} />
            {twilioInstalled && <SmsTwoFactorCard />}
            <PasskeysCard />
          </>
        )}

        {tab === 'connections' && <ConnectionsCard userEmail={data?.user?.email ?? null} />}

        {tab === 'password' && <ChangePasswordCard />}

        {tab === 'danger' && (
          <Card>
            <h3>{t('admin.account.dangerZone')}</h3>
            <p className="muted">{t('admin.account.deleteIrreversible')}</p>
            <Button
              variant="ghost"
              style={{ color: 'var(--ws-danger)' }}
              disabled={deleteAccount.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              {t('admin.account.deleteAccount')}
            </Button>
            <ConfirmDialog
              open={confirmDelete}
              title={t('admin.account.deleteAccount')}
              confirmLabel={t('common.confirmDelete')}
              danger
              onConfirm={() => { setConfirmDelete(false); deleteAccount.mutate(); }}
              onCancel={() => setConfirmDelete(false)}
            >
              {t('admin.account.deleteConfirm')}
            </ConfirmDialog>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}

interface MedicalData {
  bloodType?: string;
  allergies?: string;
  conditions?: string;
  medication?: string;
  emergencyName?: string;
  emergencyPhone?: string;
}

function readMedical(user: MeResponse['user']): MedicalData {
  const profile = user?.profile ?? {};
  const raw = (profile as Record<string, unknown>).medical;
  const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    bloodType: String(m.bloodType ?? ''),
    allergies: String(m.allergies ?? ''),
    conditions: String(m.conditions ?? ''),
    medication: String(m.medication ?? ''),
    emergencyName: String(m.emergencyName ?? ''),
    emergencyPhone: String(m.emergencyPhone ?? ''),
  };
}

function MedicalCard({ user }: { user: MeResponse['user'] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<MedicalData>(() => readMedical(user));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(readMedical(user));
    setSaved(false);
  }, [user?.id]);

  const onField = (key: keyof MedicalData) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = useMutation({
    mutationFn: () =>
      api.patch('/api/v1/auth/me', {
        profile: { ...(user?.profile ?? {}), medical: form },
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  return (
    <Card>
      <h3>Datos médicos</h3>
      <p className="muted">
        Información médica para emergencias en el gimnasio. Solo vos y el personal
        autorizado pueden verla.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid-2" style={{ gap: 'var(--ws-space-3)' }}>
          <div className="field">
            <label>Grupo sanguíneo</label>
            <select
              className="input"
              value={form.bloodType ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, bloodType: e.target.value }))}
            >
              <option value="">—</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <TextField label="Contacto de emergencia (nombre)" value={form.emergencyName} onChange={onField('emergencyName')} />
          <TextField label="Contacto de emergencia (teléfono)" value={form.emergencyPhone} onChange={onField('emergencyPhone')} />
          <TextField label="Medicación" value={form.medication} onChange={onField('medication')} />
        </div>
        <TextField label="Alergias" value={form.allergies} onChange={onField('allergies')} />
        <TextField label="Condiciones médicas" value={form.conditions} onChange={onField('conditions')} />

        {save.error && (
          <p style={{ color: 'var(--ws-danger)' }}>
            {save.error instanceof Error ? save.error.message : 'Error al guardar'}
          </p>
        )}
        {saved && (
          <p style={{ color: 'var(--ws-success, #16a34a)', margin: 0 }}>
            <i className="bi bi-check-circle" /> Datos médicos guardados.
          </p>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SummaryView({
  user,
  academiaInstalled,
  onNavigate,
}: {
  user: MeResponse['user'];
  academiaInstalled: boolean;
  onNavigate: (tab: Tab) => void;
}) {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasAdmin = hasPermission('user.read');

  const { data: enrollments } = useQuery({
    queryKey: ['academia-enrollments'],
    queryFn: () => api.get<Enrollment[]>(`${ACADEMIA}/enrollments`),
    enabled: academiaInstalled,
  });
  const { data: courses, isLoading: coursesLoading, isError: coursesError } = useQuery({
    queryKey: ['academia-courses'],
    queryFn: () => api.get<Course[]>(`${ACADEMIA}/courses`),
    retry: 0,
  });
  const { data: orders, isLoading: ordersLoading, isError: ordersError } = useQuery({
    queryKey: ['ecommerce-orders'],
    queryFn: () => api.get<Order[]>('/api/v1/blocks/ecommerce/orders'),
    retry: 0,
  });
  const { data: bookings, isLoading: bookingsLoading, isError: bookingsError } = useQuery({
    queryKey: ['reservas-bookings'],
    queryFn: () => api.get<Booking[]>('/api/v1/blocks/reservas/bookings'),
    retry: 0,
  });

  const mine = (enrollments ?? []).filter((e) =>
    user ? e.student === user.email || (user.username ? e.student === user.username : false) : false,
  );
  const courseTitle = (id: string) => courses?.find((c) => c.id === id)?.title ?? id;

  if (!user) return <Spinner />;

  return (
    <>
      <Card>
        <div className="row" style={{ alignItems: 'center', gap: 'var(--ws-space-4)' }}>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={t('admin.account.avatar')}
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
              {(user.displayName ?? user.email ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="stack" style={{ gap: 2 }}>
            <h2 style={{ margin: 0 }}>{user.displayName ?? user.email}</h2>
            <p className="muted" style={{ margin: 0 }}>
              <i className="bi bi-envelope" /> {user.email}
              {user.username ? <span> · @{user.username}</span> : ''}
            </p>
          </div>
        </div>

        <h3 style={{ marginTop: 'var(--ws-space-4)', marginBottom: 'var(--ws-space-2)' }}>{t('admin.account.quickLinks')}</h3>
        <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
          <button className="btn" onClick={() => onNavigate('profile')}>
            <i className="bi bi-person" /> {t('admin.account.profile')}
          </button>
          <button className="btn secondary" onClick={() => onNavigate('security')}>
            <i className="bi bi-shield-check" /> {t('admin.account.security')}
          </button>
          <button className="btn secondary" onClick={() => onNavigate('password')}>
            <i className="bi bi-key" /> {t('admin.account.changePassword')}
          </button>
          <Link to="/store" className="btn secondary">
            <i className="bi bi-bag" /> Tienda
          </Link>
          {hasAdmin && (
            <Link to="/admin" className="btn secondary">
              <i className="bi bi-speedometer2" /> {t('site.header.adminPanel')}
            </Link>
          )}
        </div>
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Historial de compras</h3>
        {ordersLoading ? (
          <p className="muted">Cargando…</p>
        ) : ordersError ? (
          <p className="muted">No hay datos de compras disponibles.</p>
        ) : (orders ?? []).length === 0 ? (
          <p className="muted">Todavía no tenés pedidos.</p>
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
                    <span
                      className="badge"
                      style={{
                        background: ORDER_STATUS_COLOR[o.status] ?? 'var(--ws-surface-2)',
                        color: ORDER_STATUS_COLOR[o.status] ? '#fff' : 'var(--ws-text-muted)',
                      }}
                    >
                      {ORDER_STATUS_ES[o.status] ?? o.status}
                    </span>
                  </td>
                  <td>${o.total}</td>
                  <td>{o.items?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Mis reservas</h3>
        {bookingsLoading ? (
          <p className="muted">Cargando…</p>
        ) : bookingsError ? (
          <p className="muted">No hay datos de reservas disponibles.</p>
        ) : (bookings ?? []).length === 0 ? (
          <p className="muted">No tenés reservas.</p>
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
                    <span
                      className="badge"
                      style={
                        b.status === 'cancelled'
                          ? { background: 'var(--ws-danger)', color: '#fff' }
                          : { background: 'var(--ws-success)', color: '#fff' }
                      }
                    >
                      {b.status === 'cancelled' ? 'Cancelada' : 'Confirmada'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h3 style={{ marginTop: 0 }}>Mis cursos</h3>
        {coursesLoading ? (
          <p className="muted">Cargando…</p>
        ) : coursesError ? (
          <p className="muted">No hay datos de cursos disponibles.</p>
        ) : (courses ?? []).length === 0 ? (
          <p className="muted">Todavía no hay cursos.</p>
        ) : (
          <div className="stack">
            {(courses ?? []).map((c) => (
              <div key={c.id} style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-3)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
                  <strong>{c.title}</strong>
                  {c.level && <span className="badge">{c.level}</span>}
                </div>
                {c.description && (
                  <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>
                    {c.description}
                  </p>
                )}
                <span
                  className="muted"
                  style={{ fontSize: 'var(--ws-font-size-sm)', display: 'inline-block', marginTop: 'var(--ws-space-2)' }}
                >
                  {(Array.isArray(c.lessons) ? c.lessons : []).length} lecciones
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3>{t('admin.account.myEnrollments')}</h3>
        {!academiaInstalled ? (
          <p className="muted">{t('admin.account.academyUnavailable')}</p>
        ) : mine.length === 0 ? (
          <p className="muted">{t('admin.account.noEnrollments')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.title')}</th>
                <th>{t('admin.account.progressLabel')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((e) => (
                <tr key={e.id}>
                  <td>{courseTitle(e.courseId)}</td>
                  <td>{e.progress}%</td>
                  <td>
                    <span
                      className="badge"
                      style={e.completedAt ? { background: 'var(--ws-success, #16a34a)', color: '#fff' } : undefined}
                    >
                      {e.completedAt ? t('admin.account.completedLabel') : t('admin.account.inProgress')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

type NotificationChannel = 'email' | 'whatsapp' | 'sms' | 'push';
type NotificationCategory = 'pagos' | 'mensajes' | 'social' | 'recordatorios';
type NotificationPrefs = Record<NotificationChannel, Record<NotificationCategory, boolean>>;

const NOTIFICATION_CHANNELS: { key: NotificationChannel; label: string; icon: string }[] = [
  { key: 'email', label: 'Email', icon: 'bi-envelope' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'bi-whatsapp' },
  { key: 'sms', label: 'SMS', icon: 'bi-chat-dots' },
  { key: 'push', label: 'Push', icon: 'bi-bell' },
];

const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string }[] = [
  { key: 'pagos', label: 'Pagos' },
  { key: 'mensajes', label: 'Mensajes' },
  { key: 'social', label: 'Social' },
  { key: 'recordatorios', label: 'Recordatorios' },
];

function loadNotificationPrefs(profile: Record<string, unknown> | null | undefined): NotificationPrefs {
  const raw = profile?.notificationPrefs;
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const prefs = {} as NotificationPrefs;
  for (const ch of NOTIFICATION_CHANNELS) {
    const chRaw = source[ch.key];
    const chObj = (chRaw && typeof chRaw === 'object' ? chRaw : {}) as Record<string, unknown>;
    const row = {} as Record<NotificationCategory, boolean>;
    for (const cat of NOTIFICATION_CATEGORIES) {
      row[cat.key] = chObj[cat.key] === true;
    }
    prefs[ch.key] = row;
  }
  return prefs;
}

function NotificationPrefsCard({ user }: { user: MeResponse['user'] }) {
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs(user?.profile));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(loadNotificationPrefs(user?.profile));
    setSaved(false);
  }, [user?.id]);

  const save = useMutation({
    mutationFn: () =>
      api.patch('/api/v1/auth/me', {
        profile: { ...(user?.profile ?? {}), notificationPrefs: prefs },
      }),
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  const toggle = (channel: NotificationChannel, category: NotificationCategory) => {
    setPrefs((prev) => ({
      ...prev,
      [channel]: { ...prev[channel], [category]: !prev[channel][category] },
    }));
    setSaved(false);
  };

  return (
    <Card>
      <h3>Notificaciones</h3>
      <p className="muted">Elegí por qué canales querés recibir cada tipo de notificación.</p>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>Categoría</th>
              {NOTIFICATION_CHANNELS.map((ch) => (
                <th key={ch.key} style={{ textAlign: 'center' }}>
                  <i className={`bi ${ch.icon}`} /> {ch.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_CATEGORIES.map((cat) => (
              <tr key={cat.key}>
                <td>{cat.label}</td>
                {NOTIFICATION_CHANNELS.map((ch) => (
                  <td key={ch.key} style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={prefs[ch.key][cat.key]}
                      onChange={() => toggle(ch.key, cat.key)}
                      aria-label={`${ch.label} — ${cat.label}`}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {save.error && (
        <p style={{ color: 'var(--ws-danger)' }}>
          {save.error instanceof Error ? save.error.message : 'Error al guardar'}
        </p>
      )}
      {saved && (
        <p style={{ color: 'var(--ws-success, #16a34a)', margin: 0 }}>
          <i className="bi bi-check-circle" /> Preferencias guardadas.
        </p>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Card>
  );
}

function ChangePasswordCard() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: () => api.post('/api/v1/auth/change-password', { currentPassword, password }),
    onSuccess: () => {
      setMsg(t('admin.account.passwordUpdated'));
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('admin.account.passwordChangeError')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (password !== confirm) {
      setError(t('admin.account.passwordsDontMatch'));
      return;
    }
    change.mutate();
  };

  return (
    <Card>
      <h3>{t('admin.account.changePassword')}</h3>
      <form className="stack" onSubmit={submit}>
        <TextField label={t('admin.account.currentPassword')} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        <TextField label={t('admin.account.newPassword')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <TextField label={t('admin.account.confirmNewPassword')} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
        {msg && <p style={{ color: 'var(--ws-success, #16a34a)' }}>{msg}</p>}
        <div className="row">
          <Button type="submit" disabled={change.isPending}>{t('admin.account.savePassword')}</Button>
        </div>
      </form>
    </Card>
  );
}

function TwoFactorCard({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'idle' | 'confirm' | 'codes'>('idle');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setup = useMutation({
    mutationFn: () => api.post<{ secret: string; otpauthUrl: string }>('/api/v1/auth/2fa/setup'),
    onSuccess: (r) => {
      setSecret(r.secret);
      setOtpauthUrl(r.otpauthUrl);
      setCode('');
      setStep('confirm');
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const confirm = useMutation({
    mutationFn: () => api.post<{ backupCodes: string[] }>('/api/v1/auth/2fa/confirm', { code }),
    onSuccess: (r) => {
      setBackupCodes(r.backupCodes);
      setStep('codes');
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  const disable = useMutation({
    mutationFn: () => api.post('/api/v1/auth/2fa/disable', { code }),
    onSuccess: () => {
      setCode('');
      setStep('idle');
      setError(null);
      onChanged();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error'),
  });

  return (
    <Card>
      <h3>{t('admin.account.twoFactor')}</h3>
      <p className="muted">
        {enabled
          ? t('admin.account.twoFactorEnabled')
          : t('admin.account.twoFactorDisabled')}
      </p>

      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      {!enabled && step === 'idle' && (
        <Button onClick={() => setup.mutate()} disabled={setup.isPending}>
          {t('admin.account.enable2fa')}
        </Button>
      )}

      {step === 'confirm' && (
        <div className="stack">
          <p className="muted">{t('admin.account.scanCode')}</p>
          <QrCode value={otpauthUrl} />
          <p>
            <strong>{t('admin.account.secretKey')}</strong> <code>{secret}</code>
          </p>
          <p className="muted" style={{ wordBreak: 'break-all' }}>{otpauthUrl}</p>
          <TextField label={t('admin.account.code6')} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <div className="row">
            <Button onClick={() => confirm.mutate()} disabled={confirm.isPending || code.length < 6}>
              {t('common.confirm')}
            </Button>
            <Button variant="ghost" onClick={() => setStep('idle')}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {step === 'codes' && (
        <div className="stack">
          <h4>{t('admin.account.twoFactorActivated')}</h4>
          <p className="muted">{t('admin.account.backupCodes')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--ws-space-2)' }}>
            {backupCodes.map((c) => (
              <code key={c} style={{ background: 'var(--ws-surface-2)', padding: 'var(--ws-space-1)', borderRadius: 'var(--ws-radius-sm)' }}>
                {c}
              </code>
            ))}
          </div>
          <Button onClick={() => setStep('idle')}>{t('admin.account.done')}</Button>
        </div>
      )}

      {enabled && step === 'idle' && (
        <div className="stack">
          <TextField label={t('admin.account.currentCodeToDisable')} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <Button variant="ghost" onClick={() => disable.mutate()} disabled={disable.isPending || code.length < 6}>
            {t('admin.account.disable2fa')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function SmsTwoFactorCard() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const setup = async () => {
    setError(null);
    setMsg(null);
    try {
      await api.post('/api/v1/auth/2fa/sms/setup', { phone });
      setStep('code');
      setMsg(t('admin.account.smsCodeSent'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };
  const verify = async () => {
    setError(null);
    try {
      await api.post('/api/v1/auth/2fa/sms/verify', { phone, code });
      setStep('idle');
      setPhone('');
      setCode('');
      setMsg(t('admin.account.sms2faActivated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };
  const disable = async () => {
    setError(null);
    try {
      await api.post('/api/v1/auth/2fa/sms/disable');
      setMsg(t('admin.account.sms2faDeactivated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <Card>
      <h3>{t('admin.account.sms2fa')}</h3>
      <p className="muted">{t('admin.account.sms2faDesc')}</p>
      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
      {msg && <p className="muted">{msg}</p>}

      {step === 'idle' && (
        <div className="stack">
          <TextField label={t('admin.account.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="row">
            <Button onClick={setup} disabled={!phone}>
              {t('admin.account.sendCode')}
            </Button>
            <Button variant="ghost" onClick={disable}>
              {t('admin.account.disable')}
            </Button>
          </div>
        </div>
      )}

      {step === 'code' && (
        <div className="stack">
          <TextField label={t('admin.account.smsCode')} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
          <Button onClick={verify} disabled={code.length < 6}>
            {t('admin.account.activate')}
          </Button>
        </div>
      )}
    </Card>
  );
}

interface PasskeyRow {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}
function PasskeysCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => api.get<PasskeyRow[]>('/api/v1/auth/passkeys'),
  });
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [renaming, setRenaming] = useState<PasskeyRow | null>(null);

  const register = async () => {
    setRegistering(true);
    setError(null);
    try {
      const opts = await api.post<{ challengeId: string; options: Parameters<typeof startRegistration>[0] }>(
        '/api/v1/auth/passkey/register/options',
      );
      const credential = await startRegistration(opts.options);
      await api.post('/api/v1/auth/passkey/register/verify', { challengeId: opts.challengeId, credential });
      qc.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.account.passkeyRegisterError'));
    } finally {
      setRegistering(false);
    }
  };

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/auth/passkeys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  });
  const rename = useMutation({
    mutationFn: ({ id, deviceName }: { id: string; deviceName: string }) => api.patch(`/api/v1/auth/passkeys/${id}`, { deviceName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passkeys'] }),
  });

  return (
    <Card>
      <h3>{t('admin.account.passkeys')}</h3>
      <p className="muted">{t('admin.account.passkeysDesc')}</p>
      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

      <div className="stack">
        {(data ?? []).map((p) => (
          <div key={p.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
            <span>
              {p.deviceName ?? t('admin.account.passkey')} <span className="muted">· {t('admin.account.created')} {new Date(p.createdAt).toLocaleDateString()}</span>
            </span>
            <div className="row">
              <Button
                variant="ghost"
                onClick={() => setRenaming(p)}
              >
                {t('common.rename')}
              </Button>
              <Button variant="ghost" onClick={() => remove.mutate(p.id)}>
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="muted">{t('admin.account.noPasskeys')}</p>}
      </div>

      <Button onClick={register} disabled={registering} style={{ marginTop: 'var(--ws-space-3)' }}>
        {registering ? t('admin.account.registering') : t('admin.account.registerPasskey')}
      </Button>

      <PromptDialog
        open={renaming !== null}
        title={t('admin.account.renamePasskey')}
        label={t('admin.account.deviceName')}
        defaultValue={renaming?.deviceName ?? ''}
        confirmLabel={t('common.save')}
        onConfirm={(name) => {
          if (renaming && name.trim()) rename.mutate({ id: renaming.id, deviceName: name.trim() });
          setRenaming(null);
        }}
        onCancel={() => setRenaming(null)}
      />
    </Card>
  );
}

interface SocialProvider {
  id: string;
  name: string;
}

interface SocialVerifyResult {
  ok: boolean;
  linked: boolean;
  userId?: string;
  socialAccountId?: string;
  error?: string;
}

/**
 * Conexiones — proveedores de login social habilitados y vínculo de cuentas.
 *
 * Lista `GET /api/v1/plugins/social-login/providers` y permite "Conectar" con un
 * flujo SIMULADO (providerId/email por PromptDialog) que llama a
 * `POST /api/v1/plugins/social-login/verify`.
 */
function ConnectionsCard({ userEmail }: { userEmail: string | null }) {
  const { data: providers } = useQuery({
    queryKey: ['social-providers'],
    queryFn: () => api.get<SocialProvider[]>('/api/v1/plugins/social-login/providers'),
    retry: 0,
  });
  const [provider, setProvider] = useState<SocialProvider | null>(null);
  const [step, setStep] = useState<'providerId' | 'email' | null>(null);
  const [providerId, setProviderId] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openConnect = (p: SocialProvider) => {
    setProvider(p);
    setProviderId('');
    setStep('providerId');
    setResult(null);
    setError(null);
  };

  const verify = async (email: string) => {
    if (!provider) return;
    const pid = providerId.trim();
    const name = provider.name;
    if (!pid) {
      setError('El providerId es obligatorio');
      setStep(null);
      setProvider(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // TODO(OAuth real): acá iría el redirect → callback → exchange del
      // proveedor. Por ahora se simula el vínculo con un providerId manual.
      const res = await api.post<SocialVerifyResult>('/api/v1/plugins/social-login/verify', {
        provider: provider.id,
        providerId: pid,
        ...(email ? { email } : {}),
      });
      if (res.ok) {
        setResult(
          res.linked
            ? `Cuenta de ${name} vinculada correctamente.`
            : `Cuenta de ${name} registrada (aún sin vínculo de usuario).`,
        );
      } else {
        setError(res.error ?? 'No se pudo verificar la cuenta social');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar la cuenta social');
    } finally {
      setLoading(false);
      setStep(null);
      setProvider(null);
    }
  };

  return (
    <Card>
      <h3>Conexiones</h3>
      <p className="muted">
        Vinculá tu cuenta con proveedores de login social. El flujo OAuth real
        (redirect → callback → exchange) está pendiente; por ahora se simula con
        un providerId y un email.
      </p>

      {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}
      {result && <p style={{ color: 'var(--ws-success, #16a34a)' }}>{result}</p>}

      {(providers ?? []).length === 0 ? (
        <p className="muted">No hay proveedores de login social habilitados.</p>
      ) : (
        <div className="stack">
          {(providers ?? []).map((p) => (
            <div
              key={p.id}
              className="row"
              style={{ justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}
            >
              <span>{p.name}</span>
              <Button onClick={() => openConnect(p)} disabled={loading}>
                Conectar
              </Button>
            </div>
          ))}
        </div>
      )}

      {step === 'providerId' && provider && (
        <PromptDialog
          open
          title={`Conectar con ${provider.name}`}
          label="ID del proveedor (providerId)"
          confirmLabel="Continuar"
          onConfirm={(value) => {
            setProviderId(value.trim());
            setStep('email');
          }}
          onCancel={() => {
            setProvider(null);
            setStep(null);
          }}
        />
      )}
      {step === 'email' && provider && (
        <PromptDialog
          open
          title={`${provider.name} — email`}
          label="Email (opcional)"
          defaultValue={userEmail ?? ''}
          confirmLabel="Verificar"
          onConfirm={(value) => void verify(value.trim())}
          onCancel={() => {
            setProvider(null);
            setStep(null);
          }}
        />
      )}
    </Card>
  );
}
