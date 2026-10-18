import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, downloadFile } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { RichTextEditor } from '../../components/ui/RichTextEditor';

interface EmailTemplate {
  id: string;
  key: string;
  name: string;
  subject: string;
  body: string;
  bodyMode: string;
  variables: string[];
}
interface EmailCampaign {
  id: string;
  name: string;
  templateId: string | null;
  subject: string | null;
  recipientType: string;
  status: string;
  sentCount: number;
  totalCount: number;
  openCount: number;
  clickCount: number;
  scheduledAt: string | null;
  template: { id: string; name: string } | null;
}
interface EmailAutomation {
  id: string;
  name: string;
  event: string;
  templateId: string | null;
  enabled: boolean;
  template: { id: string; name: string } | null;
}
interface EmailEvent {
  key: string;
  label: string;
}

type Tab = 'templates' | 'campaigns' | 'automations';

export function EmailPage() {
  const [tab, setTab] = useState<Tab>('templates');

  return (
    <div className="stack">
      <h1>Correos</h1>
      <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
        <Button variant={tab === 'templates' ? 'primary' : 'ghost'} onClick={() => setTab('templates')}>
          Plantillas
        </Button>
        <Button variant={tab === 'campaigns' ? 'primary' : 'ghost'} onClick={() => setTab('campaigns')}>
          Campañas
        </Button>
        <Button variant={tab === 'automations' ? 'primary' : 'ghost'} onClick={() => setTab('automations')}>
          Automatizaciones
        </Button>
      </div>

      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'campaigns' && <CampaignsPanel />}
      {tab === 'automations' && <AutomationsPanel />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

function TemplatesPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/api/v1/email/templates'),
  });

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyMode, setBodyMode] = useState<'wysiwyg' | 'html'>('wysiwyg');
  const [body, setBody] = useState('');
  const [variables, setVariables] = useState('');

  const save = useMutation({
    mutationFn: () => {
      const payload = { name, key, subject, bodyMode, body, variables: variables.split(',').map((s) => s.trim()).filter(Boolean) };
      return editing
        ? api.patch(`/api/v1/email/templates/${editing.id}`, payload)
        : api.post('/api/v1/email/templates', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      resetForm();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/email/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });

  function resetForm() {
    setEditing(null);
    setName('');
    setKey('');
    setSubject('');
    setBodyMode('wysiwyg');
    setBody('');
    setVariables('');
  }

  function load(t: EmailTemplate) {
    setEditing(t);
    setName(t.name);
    setKey(t.key);
    setSubject(t.subject);
    setBodyMode(t.bodyMode === 'html' ? 'html' : 'wysiwyg');
    setBody(t.body);
    setVariables((t.variables ?? []).join(', '));
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <h3>{editing ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Clave (única)" value={key} onChange={(e) => setKey(e.target.value)} placeholder="bienvenida" />
        <TextField label="Asunto" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Bienvenido, {{ user.name }}" />
        <TextField label="Variables (separadas por coma)" value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="site.name, user.name, user.email" />

        <div className="field">
          <label>Modo de edición</label>
          <select className="input" value={bodyMode} onChange={(e) => setBodyMode(e.target.value as 'wysiwyg' | 'html')}>
            <option value="wysiwyg">Editor visual (WYSIWYG)</option>
            <option value="html">HTML crudo</option>
          </select>
        </div>

        <label className="muted" style={{ display: 'block', margin: 'var(--ws-space-2) 0' }}>
          Contenido del correo
        </label>
        {bodyMode === 'wysiwyg' ? (
          <RichTextEditor value={body} onChange={setBody} />
        ) : (
          <textarea className="input" rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder="<h1>Hola</h1>" />
        )}

        <div className="row" style={{ marginTop: 'var(--ws-space-3)' }}>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {editing ? 'Guardar' : 'Crear'}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={resetForm}>
              Cancelar
            </Button>
          )}
        </div>
      </Card>

      <Card>
        <h3>Plantillas</h3>
        <div className="stack">
          {(data ?? []).map((t) => (
            <div key={t.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
              <div>
                <strong>{t.name}</strong>
                <span className="muted"> · {t.bodyMode}</span>
              </div>
              <div className="row">
                <Button variant="secondary" onClick={() => load(t)}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => remove.mutate(t.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          {(data ?? []).length === 0 && <p className="muted">No hay plantillas.</p>}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------------

function CampaignsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email-campaigns'],
    queryFn: () => api.get<EmailCampaign[]>('/api/v1/email/campaigns'),
  });
  const { data: templates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/api/v1/email/templates'),
  });

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [recipientType, setRecipientType] = useState('all');
  const [roles, setRoles] = useState('');
  const [emails, setEmails] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/v1/email/campaigns', {
        name,
        templateId: templateId || undefined,
        subject: subject || undefined,
        recipientType,
        recipientRoles: recipientType === 'roles' ? roles.split(',').map((s) => s.trim()).filter(Boolean) : [],
        recipientEmails:
          recipientType === 'list'
            ? emails.split('\n').map((s) => s.trim()).filter(Boolean).map((email) => ({ email }))
            : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] });
      setName('');
      setSubject('');
    },
  });

  const send = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/email/campaigns/${id}/send`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaigns'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/email/campaigns/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaigns'] }),
  });

  const schedule = useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      api.post(`/api/v1/email/campaigns/${id}/schedule`, { scheduledAt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaigns'] }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/email/campaigns/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-campaigns'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <h3>Nueva campaña</h3>
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="field">
          <label>Plantilla</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">—</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <TextField label="Asunto (opcional, sobrescribe la plantilla)" value={subject} onChange={(e) => setSubject(e.target.value)} />

        <div className="field">
          <label>Destinatarios</label>
          <select className="input" value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
            <option value="all">Todos los usuarios</option>
            <option value="roles">Por roles</option>
            <option value="list">Lista manual</option>
          </select>
        </div>

        {recipientType === 'roles' && (
          <TextField label="Roles (claves separadas por coma)" value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="user, editor" />
        )}
        {recipientType === 'list' && (
          <div className="field">
            <label>Correos (uno por línea)</label>
            <textarea className="input" rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} />
          </div>
        )}

        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          Crear campaña
        </Button>
      </Card>

      <Card>
        <h3>Campañas</h3>
        <div className="stack">
          {(data ?? []).map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onSend={send.mutate}
              onSchedule={schedule.mutate}
              onCancel={cancel.mutate}
              onRemove={remove.mutate}
            />
          ))}
          {(data ?? []).length === 0 && <p className="muted">No hay campañas.</p>}
        </div>
      </Card>
    </div>
  );
}

function CampaignRow({
  campaign,
  onSend,
  onSchedule,
  onCancel,
  onRemove,
}: {
  campaign: EmailCampaign;
  onSend: (id: string) => void;
  onSchedule: (arg: { id: string; scheduledAt: string }) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [when, setWhen] = useState('');
  const [showReport, setShowReport] = useState(false);
  const scheduled = campaign.status === 'scheduled';

  return (
    <div className="stack" style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{campaign.name}</strong>
          <span className="muted"> · {campaign.template?.name ?? 'sin plantilla'}</span>
          <div>
            <span className="badge">{campaign.status}</span>
            <span className="muted">
              {' '}{campaign.sentCount}/{campaign.totalCount} enviados · {campaign.openCount} aperturas · {campaign.clickCount} clics
            </span>
          </div>
          {campaign.scheduledAt && (
            <span className="muted">Programada: {new Date(campaign.scheduledAt).toLocaleString()}</span>
          )}
        </div>
        <div className="row">
          {scheduled ? (
            <Button variant="secondary" onClick={() => onCancel(campaign.id)}>
              Cancelar
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onSend(campaign.id)} disabled={!campaign.templateId}>
              Enviar ahora
            </Button>
          )}
          <Button variant="ghost" onClick={() => setShowReport((v) => !v)}>
            Reporte
          </Button>
          <Button variant="ghost" onClick={() => void downloadFile(`/api/v1/email/campaigns/${campaign.id}/export`, `campaign-${campaign.id}.csv`)}>
            Exportar
          </Button>
          <Button variant="ghost" onClick={() => onRemove(campaign.id)}>
            Eliminar
          </Button>
        </div>
      </div>

      {!scheduled && (
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
          <input
            className="input"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            style={{ width: 'auto' }}
          />
          <Button
            variant="ghost"
            onClick={() => when && onSchedule({ id: campaign.id, scheduledAt: new Date(when).toISOString() })}
            disabled={!when}
          >
            Programar
          </Button>
        </div>
      )}

      {showReport && <CampaignReport id={campaign.id} />}
    </div>
  );
}

interface CampaignReportData {
  campaign: { id: string; name: string; status: string; totalCount: number };
  summary: { sentCount: number; openCount: number; uniqueClicks: number; totalClicks: number; openRate: number; clickRate: number };
  recipients: Array<{ email: string; status: string; openedAt: string | null; clickCount: number }>;
}

function CampaignReport({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['email-campaign-report', id],
    queryFn: () => api.get<CampaignReportData>(`/api/v1/email/campaigns/${id}/report`),
  });

  if (isLoading) return <Spinner />;
  if (!data) return null;

  const s = data.summary;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <Card style={{ marginTop: 'var(--ws-space-3)' }}>
      <h4>Reporte — {data.campaign.name}</h4>
      <div className="stack">
        <div>
          <span className="muted">Aperturas: {s.openCount}/{s.sentCount} ({pct(s.openRate)})</span>
          <Bar value={s.openRate} />
        </div>
        <div>
          <span className="muted">Clics únicos: {s.uniqueClicks}/{s.sentCount} ({pct(s.clickRate)})</span>
          <Bar value={s.clickRate} />
        </div>
        <p className="muted">
          {s.sentCount} enviados · {s.openCount} aperturas · {s.uniqueClicks} clics únicos · {s.totalClicks} clics totales
        </p>
        <p className="muted">Destinatarios: {data.recipients.length} (abiertos {s.openCount}, con clics {s.uniqueClicks})</p>
      </div>
    </Card>
  );
}

function Bar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div style={{ height: 8, background: 'var(--ws-surface-2)', borderRadius: 'var(--ws-radius-full)', overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', background: 'var(--ws-primary)' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automatizaciones
// ---------------------------------------------------------------------------

function AutomationsPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['email-automations'],
    queryFn: () => api.get<EmailAutomation[]>('/api/v1/email/automations'),
  });
  const { data: templates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/api/v1/email/templates'),
  });
  const { data: events } = useQuery({
    queryKey: ['email-events'],
    queryFn: () => api.get<EmailEvent[]>('/api/v1/email/events'),
  });

  const [name, setName] = useState('');
  const [event, setEvent] = useState('');
  const [templateId, setTemplateId] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/api/v1/email/automations', { name, event, templateId: templateId || undefined, enabled: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-automations'] });
      setName('');
    },
  });

  const toggle = useMutation({
    mutationFn: (a: EmailAutomation) => api.patch(`/api/v1/email/automations/${a.id}`, { enabled: !a.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automations'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/email/automations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-automations'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card>
        <h3>Nueva automatización</h3>
        <p className="muted">"Cuando ocurra [evento], enviar [plantilla] al usuario."</p>
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="field">
          <label>Evento (criterio)</label>
          <select className="input" value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">—</option>
            {(events ?? []).map((ev) => (
              <option key={ev.key} value={ev.key}>
                {ev.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Plantilla</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">—</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={() => create.mutate()} disabled={create.isPending || !event || !templateId}>
          Crear automatización
        </Button>
      </Card>

      <Card>
        <h3>Automatizaciones</h3>
        <div className="stack">
          {(data ?? []).map((a) => (
            <div key={a.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
              <div>
                <strong>{a.name}</strong>
                <span className="muted"> · evento: {a.event}</span>
                <div>
                  <span className="badge">{a.enabled ? 'Habilitada' : 'Deshabilitada'}</span>
                  <span className="muted"> → {a.template?.name ?? 'sin plantilla'}</span>
                </div>
              </div>
              <div className="row">
                <Button variant="secondary" onClick={() => toggle.mutate(a)}>
                  {a.enabled ? 'Deshabilitar' : 'Habilitar'}
                </Button>
                <Button variant="ghost" onClick={() => remove.mutate(a.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          {(data ?? []).length === 0 && <p className="muted">No hay automatizaciones.</p>}
        </div>
      </Card>
    </div>
  );
}
