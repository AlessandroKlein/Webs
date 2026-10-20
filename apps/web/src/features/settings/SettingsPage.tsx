import { useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JsonSchema } from '@webs/plugin-sdk';
import { useTranslation } from 'react-i18next';
import { api, ApiClientError, downloadFile } from '../../lib/api';
import { SchemaForm } from '../../components/ui/SchemaForm';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { PromptDialog } from '../../components/ui/PromptDialog';
import { TextField } from '../../components/ui/TextField';

interface SettingsSection {
  key: string;
  group: string;
  schema: JsonSchema;
  defaults: Record<string, unknown>;
  value: Record<string, unknown>;
}

const UPDATES_ID = '__updates__';
const BACKUP_ID = '__backup__';

export function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsSection[]>('/api/v1/settings'),
  });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put(`/api/v1/settings/${key}`, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <Spinner />;

  const sections = data ?? [];
  const active = sections.find((s) => s.key === selected) ?? sections[0];

  const navButton: CSSProperties = {
    textAlign: 'left',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  };

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)' }}>{t('nav.settings')}</h1>
        {sections.map((section) => (
          <button
            key={section.key}
            className={`nav-link ${section.key === active?.key ? 'active' : ''}`}
            style={navButton}
            onClick={() => setSelected(section.key)}
          >
            {section.schema.title ?? section.key}
          </button>
        ))}
        <div style={{ borderTop: '1px solid var(--ws-border, #e5e7eb)', margin: 'var(--ws-space-2) 0' }} />
        <button
          className={`nav-link ${selected === UPDATES_ID ? 'active' : ''}`}
          style={navButton}
          onClick={() => setSelected(UPDATES_ID)}
        >
          Actualizaciones
        </button>
        <button
          className={`nav-link ${selected === BACKUP_ID ? 'active' : ''}`}
          style={navButton}
          onClick={() => setSelected(BACKUP_ID)}
        >
          Copias de seguridad
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {selected === UPDATES_ID ? (
          <UpdatesSection />
        ) : selected === BACKUP_ID ? (
          <BackupSection />
        ) : active ? (
          <SettingsSectionCard
            key={active.key}
            section={active}
            saving={save.isPending}
            onSave={(value) => save.mutate({ key: active.key, value })}
          />
        ) : null}
      </div>
    </div>
  );
}

interface VersionInfo {
  version: string;
  latest: string;
  hasUpdate: boolean;
}

function UpdatesSection() {
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ['system-version'],
    queryFn: () => api.get<VersionInfo>('/api/v1/system/version'),
  });

  return (
    <Card>
      <h3 style={{ margin: 0 }}>Actualizaciones</h3>
      <p className="muted" style={{ margin: 'var(--ws-space-3) 0 0' }}>
        Versión actual: <strong>{data?.version ?? '…'}</strong> · Última disponible:{' '}
        <strong>{data?.latest ?? '…'}</strong>
      </p>
      {data?.hasUpdate && (
        <p style={{ color: 'var(--ws-warning, #b45309)', margin: 'var(--ws-space-3) 0 0' }}>
          Hay una nueva versión v{data.latest} (actualizá reconstruyendo el contenedor)
        </p>
      )}
      <div style={{ marginTop: 'var(--ws-space-4)' }}>
        <Button
          variant="secondary"
          disabled={isFetching}
          onClick={() => qc.invalidateQueries({ queryKey: ['system-version'] })}
        >
          {isFetching ? 'Buscando…' : 'Buscar actualizaciones'}
        </Button>
      </div>
    </Card>
  );
}

function BackupSection() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!password) {
      setError('Ingresá tu contraseña para verificar tu identidad');
      setStatus(null);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadFile(
        `/api/v1/system/backup?password=${encodeURIComponent(password)}`,
        `webs-backup-${date}.json`,
      );
      setStatus('Copia descargada correctamente');
      setPassword('');
    } catch (e) {
      setError(
        e instanceof ApiClientError && e.status === 403
          ? 'Contraseña incorrecta'
          : 'No se pudo descargar la copia',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 style={{ margin: 0 }}>Copias de seguridad</h3>
      <p className="muted" style={{ margin: 'var(--ws-space-3) 0 0' }}>
        Descargá una copia de los datos del sitio (usuarios sin contraseña, roles, ajustes,
        páginas, contenido, productos, órdenes, pagos, inventario, membresías y suscripciones).
        Por seguridad, tenés que re-ingresar tu contraseña.
      </p>
      <div className="row" style={{ gap: 'var(--ws-space-2)', alignItems: 'flex-end', marginTop: 'var(--ws-space-3)' }}>
        <TextField
          label="Contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button onClick={() => void download()} disabled={busy}>
          {busy ? 'Descargando…' : 'Descargar copia'}
        </Button>
      </div>
      {status && (
        <p style={{ color: 'var(--ws-success, #16a34a)', margin: 'var(--ws-space-3) 0 0' }}>{status}</p>
      )}
      {error && (
        <p style={{ color: 'var(--ws-danger, #dc2626)', margin: 'var(--ws-space-3) 0 0' }}>{error}</p>
      )}
    </Card>
  );
}

function SettingsSectionCard({
  section,
  onSave,
  saving,
}: {
  section: SettingsSection;
  onSave: (value: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<Record<string, unknown>>(section.value);
  const [saved, setSaved] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState<string | null>(null);
  const [smtpTo, setSmtpTo] = useState<string | null>(null);

  const testSmtp = async (to: string) => {
    try {
      const r = await api.post<{ ok: boolean; message: string }>('/api/v1/settings/test-smtp', { to });
      setSmtpMsg(r.message);
    } catch (e) {
      setSmtpMsg(e instanceof Error ? e.message : 'Error al probar SMTP');
    }
  };

  return (
    <Card>
      <h3 style={{ marginBottom: 'var(--ws-space-4)' }}>{section.schema.title ?? section.key}</h3>
      <SchemaForm schema={section.schema} value={value} onChange={setValue} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        {section.key === 'smtp' && (
          <Button variant="secondary" onClick={() => setSmtpTo(value.from as string ?? '')}>Test SMTP</Button>
        )}
        {smtpMsg && <span className="muted" style={{ marginRight: 'auto' }}>{smtpMsg}</span>}
        {saved && <span style={{ color: 'var(--ws-success, #16a34a)' }}>Guardado ✓</span>}
        <Button
          onClick={() => {
            onSave(value);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
          disabled={saving}
        >
          {t('common.save')}
        </Button>
      </div>
      <PromptDialog
        open={smtpTo !== null}
        title="Test SMTP"
        label="Enviar correo de prueba a:"
        defaultValue={smtpTo ?? ''}
        confirmLabel="Enviar"
        onConfirm={(to) => { setSmtpTo(null); if (to) void testSmtp(to); }}
        onCancel={() => setSmtpTo(null)}
      />
    </Card>
  );
}
