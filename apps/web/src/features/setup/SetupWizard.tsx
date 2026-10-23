import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, ApiClientError } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';

type Provider = 'postgresql' | 'sqlite' | 'mysql';

interface SetupForm {
  database: {
    provider: Provider;
    host: string;
    port: string;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    file: string;
  };
  site: {
    name: string;
    tagline: string;
    logoUrl: string;
    logoDarkUrl: string;
    iconUrl: string;
    faviconUrl: string;
    defaultLocale: 'es' | 'en' | 'pt';
    languages: string[];
  };
  smtp: {
    enabled: boolean;
    host: string;
    port: string;
    user: string;
    password: string;
    from: string;
    secure: boolean;
  };
  admin: {
    email: string;
    password: string;
    confirm: string;
    displayName: string;
  };
  template: string;
}

const initialForm: SetupForm = {
  database: {
    provider: 'postgresql',
    host: 'postgres',
    port: '5432',
    name: 'webs',
    user: 'webs',
    password: 'webs',
    ssl: false,
    file: './data/webs.db',
  },
  site: {
    name: 'Webs',
    tagline: '',
    logoUrl: '',
    logoDarkUrl: '',
    iconUrl: '',
    faviconUrl: '',
    defaultLocale: 'es',
    languages: ['es'],
  },
  smtp: {
    enabled: false,
    host: '',
    port: '587',
    user: '',
    password: '',
    from: '',
    secure: false,
  },
  admin: {
    email: '',
    password: '',
    confirm: '',
    displayName: '',
  },
  template: '',
};

const STEPS = ['Bienvenida', 'Base de datos', 'Sitio', 'Correo (SMTP)', 'Cuenta de administrador', 'Plantilla', 'Instalar'];

const AVAILABLE_LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
];

const DB_PRESETS: Array<{ label: string; value: Partial<SetupForm['database']> }> = [
  {
    label: 'PostgreSQL (Docker)',
    value: { provider: 'postgresql', host: 'postgres', port: '5432', name: 'webs', user: 'webs', password: 'webs' },
  },
  {
    label: 'MySQL (Docker)',
    value: { provider: 'mysql', host: 'mysql', port: '3306', name: 'webs', user: 'webs', password: 'webs' },
  },
  {
    label: 'SQLite (archivo local)',
    value: { provider: 'sqlite', file: './data/webs.db' },
  },
  {
    label: 'PostgreSQL (local, sin Docker)',
    value: { provider: 'postgresql', host: 'localhost', port: '5432', name: 'webs', user: 'webs', password: '' },
  },
];

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SetupForm>(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const set = <K extends Exclude<keyof SetupForm, 'template'>>(section: K, patch: Partial<SetupForm[K]>) =>
    setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } }));

  const testDb = useMutation({
    mutationFn: () => api.post('/api/v1/setup/test-db', { database: buildDatabasePayload(form) }),
    onSuccess: () => setTestResult('Conexión exitosa ✓'),
    onError: (e) => setTestResult(e instanceof ApiClientError ? e.message : 'Error de conexión'),
  });

  const install = useMutation({
    mutationFn: () => api.post('/api/v1/setup/install', buildPayload(form)),
    onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Error durante la instalación'),
  });

  const next = () => {
    if (step === 0 && !form.admin.email) return;
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="auth-screen" style={{ alignItems: 'start', paddingTop: '5vh' }}>
      <div style={{ width: 720, maxWidth: '100%' }}>
        <h1 style={{ textAlign: 'center' }}>Instalación de Webs</h1>

        {/* Indicador de pasos */}
        <div className="row" style={{ justifyContent: 'center', marginBottom: 'var(--ws-space-5)', flexWrap: 'wrap' }}>
          {STEPS.map((label, i) => (
            <span key={label} className="badge" style={{ background: i === step ? 'var(--ws-primary-soft)' : undefined, color: i === step ? 'var(--ws-primary)' : undefined }}>
              {i + 1}. {label}
            </span>
          ))}
        </div>

        <Card>
          {step === 0 && <WelcomeStep form={form} set={set} />}
          {step === 1 && (
            <DatabaseStep form={form} set={set} onTest={() => testDb.mutate()} testResult={testResult} testing={testDb.isPending} />
          )}
          {step === 2 && <SiteStep form={form} set={set} />}
          {step === 3 && <SmtpStep form={form} set={set} />}
          {step === 4 && <AdminStep form={form} set={set} />}
          {step === 5 && <TemplateStep value={form.template} onChange={(id) => setForm((f) => ({ ...f, template: id }))} />}
          {step === 6 && <ReviewStep form={form} />}

          {error && <p style={{ color: 'var(--ws-danger)' }}>{error}</p>}

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 'var(--ws-space-5)' }}>
            <Button variant="ghost" onClick={back} disabled={step === 0}>
              ← Volver
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next}>Continuar →</Button>
            ) : (
              <Button onClick={() => install.mutate()} disabled={install.isPending}>
                {install.isPending ? 'Instalando…' : 'Instalar'}
              </Button>
            )}
          </div>
        </Card>

        {install.isSuccess && (
          <Card style={{ marginTop: 'var(--ws-space-4)', textAlign: 'center' }}>
            <h3>✔ Instalación completada</h3>
            <p className="muted">
              El servidor se está reiniciando para aplicar la configuración. Recargá esta página en unos
              segundos para iniciar sesión.
            </p>
            <Button onClick={() => window.location.reload()}>Recargar</Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ form, set }: { form: SetupForm; set: SetupWizardSet }) {
  return (
    <div className="stack">
      <h2>Bienvenido 👋</h2>
      <p>
        Este asistente configura Webs por primera vez: base de datos, apariencia del sitio, correo
        electrónico y la cuenta de administrador. Todo desde esta interfaz, sin tocar código.
      </p>
      <div className="field" style={{ maxWidth: 240 }}>
        <label>Idioma por defecto</label>
        <select className="input" value={form.site.defaultLocale} onChange={(e) => set('site', { defaultLocale: e.target.value as 'es' | 'en' | 'pt' })}>
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </div>
      <div className="field">
        <label>Idiomas habilitados (uno o varios)</label>
        <p className="muted">Solo se cargan los recursos de los idiomas que elijas.</p>
        <div className="row" style={{ gap: 'var(--ws-space-4)' }}>
          {AVAILABLE_LANGUAGES.map((l) => (
            <label key={l.code} className="row" style={{ gap: 'var(--ws-space-2)' }}>
              <input
                type="checkbox"
                checked={form.site.languages.includes(l.code)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...form.site.languages, l.code]
                    : form.site.languages.filter((c) => c !== l.code);
                  set('site', { languages: next.length > 0 ? next : [form.site.defaultLocale] });
                }}
              />
              <span>{l.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function DatabaseStep({
  form,
  set,
  onTest,
  testResult,
  testing,
}: {
  form: SetupForm;
  set: SetupWizardSet;
  onTest: () => void;
  testResult: string | null;
  testing: boolean;
}) {
  const { provider } = form.database;
  return (
    <div className="stack">
      <h2>Base de datos</h2>
      <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
        {DB_PRESETS.map((p) => (
          <Button key={p.label} variant="secondary" type="button" onClick={() => set('database', p.value)}>
            {p.label}
          </Button>
        ))}
      </div>
      <p className="muted">Elegí un preset o configurá manualmente. En Docker usá host=postgres (o mysql); sin Docker, localhost.</p>

      <div className="field" style={{ maxWidth: 320 }}>
        <label>Motor de base de datos</label>
        <select className="input" value={provider} onChange={(e) => set('database', { provider: e.target.value as Provider })}>
          <option value="postgresql">PostgreSQL (recomendado para producción)</option>
          <option value="sqlite">SQLite (archivo local, ideal para empezar)</option>
          <option value="mysql">MySQL / MariaDB</option>
        </select>
      </div>

      {provider === 'sqlite' ? (
        <TextField label="Ruta del archivo" value={form.database.file} onChange={(e) => set('database', { file: e.target.value })} />
      ) : (
        <div className="grid-2">
          <TextField label="Servidor" value={form.database.host} onChange={(e) => set('database', { host: e.target.value })} />
          <TextField label="Puerto" value={form.database.port} onChange={(e) => set('database', { port: e.target.value })} />
          <TextField label="Base de datos" value={form.database.name} onChange={(e) => set('database', { name: e.target.value })} />
          <TextField label="Usuario" value={form.database.user} onChange={(e) => set('database', { user: e.target.value })} />
          <TextField label="Contraseña" type="password" value={form.database.password} onChange={(e) => set('database', { password: e.target.value })} />
          {provider === 'postgresql' && (
            <label className="row" style={{ gap: 'var(--ws-space-2)' }}>
              <input type="checkbox" checked={form.database.ssl} onChange={(e) => set('database', { ssl: e.target.checked })} />
              Usar SSL
            </label>
          )}
        </div>
      )}

      <div className="row">
        <Button variant="secondary" onClick={onTest} disabled={testing}>
          {testing ? 'Probando…' : 'Probar conexión'}
        </Button>
        {testResult && <span className="muted">{testResult}</span>}
      </div>
    </div>
  );
}

function SiteStep({ form, set }: { form: SetupForm; set: SetupWizardSet }) {
  return (
    <div className="stack">
      <h2>Sitio</h2>
      <div className="grid-2">
        <TextField label="Nombre del sitio" value={form.site.name} onChange={(e) => set('site', { name: e.target.value })} />
        <TextField label="Lema / descripción corta" value={form.site.tagline} onChange={(e) => set('site', { tagline: e.target.value })} />
        <TextField label="Logo (claro) — URL" value={form.site.logoUrl} onChange={(e) => set('site', { logoUrl: e.target.value })} placeholder="https://…" />
        <TextField label="Logo (oscuro) — URL" value={form.site.logoDarkUrl} onChange={(e) => set('site', { logoDarkUrl: e.target.value })} placeholder="https://…" />
        <TextField label="Icono — URL" value={form.site.iconUrl} onChange={(e) => set('site', { iconUrl: e.target.value })} placeholder="https://…" />
        <TextField label="Favicon — URL" value={form.site.faviconUrl} onChange={(e) => set('site', { faviconUrl: e.target.value })} placeholder="https://…" />
      </div>
      <p className="muted">Podés dejar las URLs vacías y configurarlas después desde Apariencia → Ajustes.</p>
    </div>
  );
}

function SmtpStep({ form, set }: { form: SetupForm; set: SetupWizardSet }) {
  return (
    <div className="stack">
      <h2>Correo electrónico (SMTP)</h2>
      <label className="row" style={{ gap: 'var(--ws-space-2)' }}>
        <input type="checkbox" checked={form.smtp.enabled} onChange={(e) => set('smtp', { enabled: e.target.checked })} />
        <strong>Habilitar envío de correos</strong>
      </label>
      <p className="muted">Se usa para verificar el correo y restablecer contraseñas. Podés omitirlo ahora y configurarlo luego.</p>

      {form.smtp.enabled && (
        <div className="grid-2">
          <TextField label="Servidor SMTP" value={form.smtp.host} onChange={(e) => set('smtp', { host: e.target.value })} placeholder="smtp.tudominio.com" />
          <TextField label="Puerto" value={form.smtp.port} onChange={(e) => set('smtp', { port: e.target.value })} />
          <TextField label="Usuario" value={form.smtp.user} onChange={(e) => set('smtp', { user: e.target.value })} />
          <TextField label="Contraseña" type="password" value={form.smtp.password} onChange={(e) => set('smtp', { password: e.target.value })} />
          <TextField label="Remitente (from)" value={form.smtp.from} onChange={(e) => set('smtp', { from: e.target.value })} placeholder="no-reply@tudominio.com" />
          <label className="row" style={{ gap: 'var(--ws-space-2)' }}>
            <input type="checkbox" checked={form.smtp.secure} onChange={(e) => set('smtp', { secure: e.target.checked })} />
            Usar SSL/TLS
          </label>
        </div>
      )}
    </div>
  );
}

function AdminStep({ form, set }: { form: SetupForm; set: SetupWizardSet }) {
  const passwordMismatch = form.admin.confirm && form.admin.password !== form.admin.confirm;
  return (
    <div className="stack">
      <h2>Cuenta de administrador</h2>
      <p className="muted">Se crea con acceso total (Super Administrador) para empezar a configurar todo.</p>
      <div className="grid-2">
        <TextField label="Correo electrónico" type="email" value={form.admin.email} onChange={(e) => set('admin', { email: e.target.value })} autoComplete="email" />
        <TextField label="Nombre" value={form.admin.displayName} onChange={(e) => set('admin', { displayName: e.target.value })} />
        <TextField label="Contraseña" type="password" value={form.admin.password} onChange={(e) => set('admin', { password: e.target.value })} autoComplete="new-password" />
        <TextField label="Confirmar contraseña" type="password" value={form.admin.confirm} onChange={(e) => set('admin', { confirm: e.target.value })} autoComplete="new-password" />
      </div>
      {passwordMismatch && <p style={{ color: 'var(--ws-danger)' }}>Las contraseñas no coinciden</p>}
    </div>
  );
}

function TemplateStep({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ['setup-templates'],
    queryFn: () => api.get<Array<{ id: string; name: string; description?: string; blocks: string[] }>>('/api/v1/setup/templates'),
  });

  return (
    <div className="stack">
      <h2>Plantilla inicial</h2>
      <p className="muted">Elegí una plantilla para arrancar con plugins y páginas predefinidas. Podés editarla y cambiar los plugins después.</p>

      <label className="row" style={{ gap: 'var(--ws-space-2)' }}>
        <input type="radio" name="template" checked={!value} onChange={() => onChange('')} />
        <span>Sin plantilla (empezar vacío)</span>
      </label>

      {(data ?? []).map((t) => (
        <label key={t.id} className="row" style={{ gap: 'var(--ws-space-2)' }}>
          <input type="radio" name="template" checked={value === t.id} onChange={() => onChange(t.id)} />
          <span>
            <strong>{t.name}</strong>
            {t.description && <span className="muted"> — {t.description}</span>}
            <span className="muted"> · plugins: {t.blocks.join(', ') || 'ninguno'}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function ReviewStep({ form }: { form: SetupForm }) {
  return (
    <div className="stack">
      <h2>Resumen</h2>
      <p className="muted">Revisá la configuración antes de instalar:</p>
      <ul>
        <li><strong>Base de datos:</strong> {form.database.provider} {form.database.provider === 'sqlite' ? form.database.file : `${form.database.host}:${form.database.port}/${form.database.name}`}</li>
        <li><strong>Sitio:</strong> {form.site.name}</li>
        <li><strong>Correo:</strong> {form.smtp.enabled ? `${form.smtp.host}:${form.smtp.port}` : 'No configurado (se puede configurar luego)'}</li>
        <li><strong>Administrador:</strong> {form.admin.email}</li>
        <li><strong>Plantilla:</strong> {form.template || 'Ninguna'}</li>
      </ul>
      <p>Al instalar se creará el esquema de base de datos, los roles y permisos, y tu cuenta de administrador.</p>
    </div>
  );
}

type SetupWizardSet = <K extends Exclude<keyof SetupForm, 'template'>>(section: K, patch: Partial<SetupForm[K]>) => void;

function buildDatabasePayload(form: SetupForm) {
  const d = form.database;
  return {
    provider: d.provider,
    ...(d.provider === 'sqlite'
      ? { file: d.file }
      : { host: d.host, port: Number(d.port), name: d.name, user: d.user, password: d.password, ssl: d.ssl }),
  };
}

function buildPayload(form: SetupForm) {
  return {
    database: buildDatabasePayload(form),
    site: {
      name: form.site.name,
      tagline: form.site.tagline,
      logoUrl: form.site.logoUrl || undefined,
      logoDarkUrl: form.site.logoDarkUrl || undefined,
      iconUrl: form.site.iconUrl || undefined,
      faviconUrl: form.site.faviconUrl || undefined,
      defaultLocale: form.site.defaultLocale,
      languages: form.site.languages,
    },
    smtp: {
      enabled: form.smtp.enabled,
      host: form.smtp.host || undefined,
      port: Number(form.smtp.port) || 587,
      user: form.smtp.user || undefined,
      password: form.smtp.password || undefined,
      from: form.smtp.from || undefined,
      secure: form.smtp.secure,
    },
    admin: {
      email: form.admin.email,
      password: form.admin.password,
      displayName: form.admin.displayName || undefined,
    },
    template: form.template || undefined,
  };
}
