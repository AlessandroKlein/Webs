import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
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
            <div key={c.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
              <div>
                <strong>{c.name}</strong>
                <span className="muted"> · {c.template?.name ?? 'sin plantilla'}</span>
                <div>
                  <span className="badge">{c.status}</span>
                  <span className="muted"> {c.sentCount}/{c.totalCount} enviados</span>
                </div>
              </div>
              <div className="row">
                <Button variant="secondary" onClick={() => send.mutate(c.id)} disabled={send.isPending || !c.templateId}>
                  Enviar
                </Button>
                <Button variant="ghost" onClick={() => remove.mutate(c.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
          {(data ?? []).length === 0 && <p className="muted">No hay campañas.</p>}
        </div>
      </Card>
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
