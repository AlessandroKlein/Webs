import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, downloadFile } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { RichTextEditor } from '../../components/ui/RichTextEditor';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';

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

type View = 'templates' | 'new-template' | 'campaigns' | 'automations';

export function EmailPage() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('templates');
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const canWrite = useAuthStore((s) => s.hasPermission)('email.write');
  const { data: variables } = useQuery({
    queryKey: ['email-variables'],
    queryFn: () => api.get<Array<{ key: string; description: string }>>('/api/v1/email/variables'),
  });

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setView('new-template');
  };

  const openEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setView('new-template');
  };

  const closeEditor = () => {
    setEditingTemplate(null);
    setView('templates');
  };

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-6)' }}>
      <PageHeader title={t('nav.email')}>
        <SegmentedControl
          ariaLabel={t('nav.email')}
          value={view}
          onChange={(v) => (v === 'new-template' ? openNewTemplate() : setView(v as View))}
          options={[
            { value: 'templates', label: t('email.templates') },
            ...(canWrite ? [{ value: 'new-template', label: t('email.newTemplate') }] : []),
            { value: 'campaigns', label: t('email.campaigns') },
            { value: 'automations', label: t('email.automations') },
          ]}
        />
      </PageHeader>

      <div className="stack">
        {view === 'new-template' && (
          <Card>
            <h3>{t('email.variablesTitle')}</h3>
            <p className="muted">{t('email.variablesHint', { example: '{{ user.name }}' })}:</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--ws-space-2)' }}>
              {(variables ?? []).map((v) => (
                <code key={v.key} title={v.description} style={{ background: 'var(--ws-surface-2)', padding: 'var(--ws-space-1) var(--ws-space-2)', borderRadius: 'var(--ws-radius-sm)' }}>
                  {'{{ ' + v.key + ' }}'}
                </code>
              ))}
            </div>
          </Card>
        )}

        {view === 'templates' && <TemplatesListPanel onEdit={openEditTemplate} onNew={openNewTemplate} />}
        {view === 'new-template' && (
          <TemplateEditorPanel key={editingTemplate?.id ?? 'new'} template={editingTemplate} onDone={closeEditor} />
        )}
        {view === 'campaigns' && <CampaignsPanel />}
        {view === 'automations' && <AutomationsPanel />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

function TemplatesListPanel({
  onEdit,
  onNew,
}: {
  onEdit: (template: EmailTemplate) => void;
  onNew: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const canWrite = useAuthStore((s) => s.hasPermission)('email.write');
  const { data, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get<EmailTemplate[]>('/api/v1/email/templates'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/email/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['email-templates'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>{t('email.templates')}</h3>
        {canWrite && <Button onClick={onNew}>{t('email.newTemplate')}</Button>}
      </div>
      <div className="stack">
        {(data ?? []).map((tmpl) => (
          <div key={tmpl.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
            <div>
              <strong>{tmpl.name}</strong>
              <span className="muted"> · {tmpl.bodyMode}</span>
            </div>
            <div className="row">
              {canWrite && (
                <Button variant="secondary" onClick={() => onEdit(tmpl)}>
                  {t('email.edit')}
                </Button>
              )}
              {canWrite && (
                <Button variant="ghost" onClick={() => remove.mutate(tmpl.id)}>
                  {t('email.delete')}
                </Button>
              )}
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && <p className="muted">{t('email.noTemplates')}</p>}
      </div>
    </Card>
  );
}

function TemplateEditorPanel({
  template,
  onDone,
}: {
  template: EmailTemplate | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const canWrite = useAuthStore((s) => s.hasPermission)('email.write');
  const [name, setName] = useState(template?.name ?? '');
  const [key, setKey] = useState(template?.key ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [bodyMode, setBodyMode] = useState<'wysiwyg' | 'html'>(template?.bodyMode === 'html' ? 'html' : 'wysiwyg');
  const [body, setBody] = useState(template?.body ?? '');
  const [variables, setVariables] = useState((template?.variables ?? []).join(', '));

  const save = useMutation({
    mutationFn: () => {
      const payload = { name, key, subject, bodyMode, body, variables: variables.split(',').map((s) => s.trim()).filter(Boolean) };
      return template
        ? api.patch(`/api/v1/email/templates/${template.id}`, payload)
        : api.post('/api/v1/email/templates', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] });
      onDone();
    },
  });

  return (
    <Card>
      <h3>{template ? t('email.editTemplate') : t('email.newTemplate')}</h3>
      <TextField label={t('email.name')} value={name} onChange={(e) => setName(e.target.value)} />
      <TextField label={t('email.keyLabel')} value={key} onChange={(e) => setKey(e.target.value)} placeholder="bienvenida" />
      <TextField label={t('email.subject')} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Bienvenido, {{ user.name }}" />
      <TextField label={t('email.variablesLabel')} value={variables} onChange={(e) => setVariables(e.target.value)} placeholder="site.name, user.name, user.email" />

      <div className="field">
        <label>{t('email.editMode')}</label>
        <select className="input" value={bodyMode} onChange={(e) => setBodyMode(e.target.value as 'wysiwyg' | 'html')}>
          <option value="wysiwyg">{t('email.wysiwyg')}</option>
          <option value="html">{t('email.rawHtml')}</option>
        </select>
      </div>

      <label className="muted" style={{ display: 'block', margin: 'var(--ws-space-2) 0' }}>
        {t('email.bodyLabel')}
      </label>
      {bodyMode === 'wysiwyg' ? (
        <RichTextEditor value={body} onChange={setBody} />
      ) : (
        <textarea className="input" rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder="<h1>Hola</h1>" />
      )}

      <div className="row" style={{ marginTop: 'var(--ws-space-3)' }}>
        {canWrite && (
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {template ? t('email.save') : t('email.create')}
          </Button>
        )}
        <Button variant="ghost" onClick={onDone}>
          {t('email.cancel')}
        </Button>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------------------

function CampaignsPanel() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const canWrite = useAuthStore((s) => s.hasPermission)('email.write');
  const canSend = useAuthStore((s) => s.hasPermission)('email.send');
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
        <h3>{t('email.newCampaign')}</h3>
        <TextField label={t('email.name')} value={name} onChange={(e) => setName(e.target.value)} />

        <div className="field">
          <label>{t('email.template')}</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">—</option>
            {(templates ?? []).map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name}
              </option>
            ))}
          </select>
        </div>

        <TextField label={t('email.subjectOverride')} value={subject} onChange={(e) => setSubject(e.target.value)} />

        <div className="field">
          <label>{t('email.recipients')}</label>
          <select className="input" value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
            <option value="all">{t('email.allUsers')}</option>
            <option value="roles">{t('email.byRoles')}</option>
            <option value="list">{t('email.manualList')}</option>
          </select>
        </div>

        {recipientType === 'roles' && (
          <TextField label={t('email.rolesLabel')} value={roles} onChange={(e) => setRoles(e.target.value)} placeholder="user, editor" />
        )}
        {recipientType === 'list' && (
          <div className="field">
            <label>{t('email.emailsLabel')}</label>
            <textarea className="input" rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} />
          </div>
        )}

        {canWrite && (
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {t('email.createCampaign')}
          </Button>
        )}
      </Card>

      <Card>
        <h3>{t('email.campaigns')}</h3>
        <div className="stack">
          {(data ?? []).map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              canWrite={canWrite}
              canSend={canSend}
              onSend={send.mutate}
              onSchedule={schedule.mutate}
              onCancel={cancel.mutate}
              onRemove={remove.mutate}
            />
          ))}
          {(data ?? []).length === 0 && <p className="muted">{t('email.noCampaigns')}</p>}
        </div>
      </Card>
    </div>
  );
}

function CampaignRow({
  campaign,
  canWrite,
  canSend,
  onSend,
  onSchedule,
  onCancel,
  onRemove,
}: {
  campaign: EmailCampaign;
  canWrite: boolean;
  canSend: boolean;
  onSend: (id: string) => void;
  onSchedule: (arg: { id: string; scheduledAt: string }) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [when, setWhen] = useState('');
  const [showReport, setShowReport] = useState(false);
  const scheduled = campaign.status === 'scheduled';

  return (
    <div className="stack" style={{ borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{campaign.name}</strong>
          <span className="muted"> · {campaign.template?.name ?? t('email.noTemplate')}</span>
          <div>
            <span className="badge">{campaign.status}</span>
            <span className="muted">
              {' '}{campaign.sentCount}/{campaign.totalCount} {t('email.sent')} · {campaign.openCount} {t('email.opens')} · {campaign.clickCount} {t('email.clicks')}
            </span>
          </div>
          {campaign.scheduledAt && (
            <span className="muted">{t('email.scheduledAt')}: {new Date(campaign.scheduledAt).toLocaleString()}</span>
          )}
        </div>
        <div className="row">
          {scheduled ? (
            canSend && (
              <Button variant="secondary" onClick={() => onCancel(campaign.id)}>
                {t('email.cancel')}
              </Button>
            )
          ) : (
            canSend && (
              <Button variant="secondary" onClick={() => onSend(campaign.id)} disabled={!campaign.templateId}>
                {t('email.sendNow')}
              </Button>
            )
          )}
          <Button variant="ghost" onClick={() => setShowReport((v) => !v)}>
            {t('email.report')}
          </Button>
          <Button variant="ghost" onClick={() => void downloadFile(`/api/v1/email/campaigns/${campaign.id}/export`, `campaign-${campaign.id}.csv`)}>
            CSV
          </Button>
          <Button variant="ghost" onClick={() => void downloadFile(`/api/v1/email/campaigns/${campaign.id}/export?format=json`, `campaign-${campaign.id}.json`)}>
            JSON
          </Button>
          <Button variant="ghost" onClick={() => void downloadFile(`/api/v1/email/campaigns/${campaign.id}/export?format=xlsx`, `campaign-${campaign.id}.xlsx`)}>
            XLSX
          </Button>
          {canWrite && (
            <Button variant="ghost" onClick={() => onRemove(campaign.id)}>
              {t('email.delete')}
            </Button>
          )}
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
          {canSend && (
            <Button
              variant="ghost"
              onClick={() => when && onSchedule({ id: campaign.id, scheduledAt: new Date(when).toISOString() })}
              disabled={!when}
            >
              {t('email.schedule')}
            </Button>
          )}
        </div>
      )}

      {showReport && <CampaignReport id={campaign.id} />}
    </div>
  );
}

interface CampaignReportData {
  campaign: { id: string; name: string; status: string; totalCount: number };
  summary: { sentCount: number; openCount: number; uniqueClicks: number; totalClicks: number; openRate: number; clickRate: number };
  timeSeries: Array<{ date: string; opens: number; clicks: number }>;
  recipients: Array<{ email: string; status: string; openedAt: string | null; clickCount: number }>;
}

function CampaignReport({ id }: { id: string }) {
  const { t } = useTranslation();
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
      <h4>{t('email.reportTitle')} — {data.campaign.name}</h4>
      <div className="stack">
        <div>
          <span className="muted">{t('email.opensLabel')}: {s.openCount}/{s.sentCount} ({pct(s.openRate)})</span>
          <Bar value={s.openRate} />
        </div>
        <div>
          <span className="muted">{t('email.uniqueClicksLabel')}: {s.uniqueClicks}/{s.sentCount} ({pct(s.clickRate)})</span>
          <Bar value={s.clickRate} />
        </div>
        <p className="muted">
          {s.sentCount} {t('email.sent')} · {s.openCount} {t('email.opens')} · {s.uniqueClicks} {t('email.uniqueClicks')} · {s.totalClicks} {t('email.totalClicks')}
        </p>
        <p className="muted">{t('email.recipientsLabel')}: {data.recipients.length} ({t('email.opened')} {s.openCount}, {t('email.withClicks')} {s.uniqueClicks})</p>

        {data.timeSeries.length > 0 && <TimeSeriesChart series={data.timeSeries} />}
      </div>
    </Card>
  );
}

function TimeSeriesChart({ series }: { series: Array<{ date: string; opens: number; clicks: number }> }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...series.map((d) => Math.max(d.opens, d.clicks)));
  return (
    <div>
      <h5 className="muted">{t('email.timeSeriesTitle')}</h5>
      <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
        {series.map((d) => (
          <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
            <span className="muted" style={{ width: 90, fontSize: '0.85em' }}>{d.date}</span>
            <div style={{ flex: 1, display: 'flex', gap: 2, height: 16 }}>
              <div title={`${t('email.opens')} ${d.opens}`} style={{ width: `${(d.opens / max) * 100}%`, background: 'var(--ws-primary)', minWidth: d.opens ? 4 : 0, borderRadius: 2 }} />
              <div title={`${t('email.clicks')} ${d.clicks}`} style={{ width: `${(d.clicks / max) * 100}%`, background: 'var(--ws-secondary, var(--ws-warning))', minWidth: d.clicks ? 4 : 0, borderRadius: 2 }} />
            </div>
            <span className="muted" style={{ fontSize: '0.8em', width: 70 }}>
              {d.opens} a · {d.clicks} c
            </span>
          </div>
        ))}
      </div>
    </div>
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
  const { t } = useTranslation();
  const canWrite = useAuthStore((s) => s.hasPermission)('email.write');
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
        <h3>{t('email.newAutomation')}</h3>
        <p className="muted">{t('email.automationHint')}</p>
        <TextField label={t('email.name')} value={name} onChange={(e) => setName(e.target.value)} />

        <div className="field">
          <label>{t('email.eventLabel')}</label>
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
          <label>{t('email.template')}</label>
          <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">—</option>
            {(templates ?? []).map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name}
              </option>
            ))}
          </select>
        </div>

        {canWrite && (
          <Button onClick={() => create.mutate()} disabled={create.isPending || !event || !templateId}>
            {t('email.createAutomation')}
          </Button>
        )}
      </Card>

      <Card>
        <h3>{t('email.automations')}</h3>
        <div className="stack">
          {(data ?? []).map((a) => (
            <div key={a.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
              <div>
                <strong>{a.name}</strong>
                <span className="muted"> · {t('email.event')}: {a.event}</span>
                <div>
                  <span className="badge">{a.enabled ? t('email.enabled') : t('email.disabled')}</span>
                  <span className="muted"> → {a.template?.name ?? t('email.noTemplate')}</span>
                </div>
              </div>
              <div className="row">
                {canWrite && (
                  <Button variant="secondary" onClick={() => toggle.mutate(a)}>
                    {a.enabled ? t('email.disable') : t('email.enable')}
                  </Button>
                )}
                {canWrite && (
                  <Button variant="ghost" onClick={() => remove.mutate(a.id)}>
                    {t('email.delete')}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {(data ?? []).length === 0 && <p className="muted">{t('email.noAutomations')}</p>}
        </div>
      </Card>
    </div>
  );
}
