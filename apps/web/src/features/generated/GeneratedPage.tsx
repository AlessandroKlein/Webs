import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useLicense } from '../../lib/use-license';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { copyText } from '../../components/ui/clipboard';
import {
  buildSchema,
  fieldToSchema,
  generateSdk,
  normalizeKey,
  type FieldDef,
  type FieldType,
  type GeneratedResource,
  type GeneratedSchema,
} from './generated-api';

const FEATURE_OPTIONS: Array<{ value: string; labelKey: string }> = [
  { value: 'core', labelKey: 'generated.featureCore' },
  { value: 'generator', labelKey: 'generated.featureGenerator' },
  { value: 'payments', labelKey: 'generated.featurePayments' },
  { value: 'shipping', labelKey: 'generated.featureShipping' },
  { value: 'inventory', labelKey: 'generated.featureInventory' },
  { value: 'ai', labelKey: 'generated.featureAi' },
  { value: 'analytics', labelKey: 'generated.featureAnalytics' },
  { value: 'multitenant', labelKey: 'generated.featureMultitenant' },
  { value: 'marketplace', labelKey: 'generated.featureMarketplace' },
  { value: 'templates', labelKey: 'generated.featureTemplates' },
];

function featureLabelKey(feature: string): string {
  return FEATURE_OPTIONS.find((f) => f.value === feature)?.labelKey ?? feature;
}

const TYPE_OPTIONS: Array<{ value: FieldType; labelKey: string }> = [
  { value: 'string', labelKey: 'generated.typeString' },
  { value: 'integer', labelKey: 'generated.typeInteger' },
  { value: 'number', labelKey: 'generated.typeNumber' },
  { value: 'boolean', labelKey: 'generated.typeBoolean' },
  { value: 'array', labelKey: 'generated.typeArray' },
  { value: 'enum', labelKey: 'generated.typeEnum' },
];

function emptyField(): FieldDef {
  return { name: '', type: 'string', required: false, unique: false };
}

/** Página `/admin/generated`: "Acceso rápido" del generador de APIs (ADR-0020). */
export function GeneratedPage() {
  const { t } = useTranslation();
  const { hasFeature } = useLicense();
  const licensed = hasFeature('generator');
  const qc = useQueryClient();

  const { data: resources, isLoading } = useQuery({
    queryKey: ['generated-resources'],
    queryFn: () => api.get<GeneratedResource[]>('/api/v1/generated'),
    retry: 1,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [result, setResult] = useState<GeneratedResource | null>(null);
  const [deleting, setDeleting] = useState<GeneratedResource | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: { name: string; description: string; feature: string; schema: GeneratedSchema }) =>
      api.post<GeneratedResource>('/api/v1/generated', body),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['generated-resources'] });
      setCreateOpen(false);
      setResult(res);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (key: string) => api.del<{ ok: boolean }>(`/api/v1/generated/${key}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['generated-resources'] });
      setDeleting(null);
    },
  });

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-6)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ margin: 0 }}>{t('generated.title')}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {t('generated.subtitle')}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={!licensed}>
          <i className="bi bi-plus-lg" aria-hidden="true" /> {t('generated.create')}
        </Button>
      </div>

      {!licensed && (
        <div
          role="status"
          style={{
            padding: 'var(--ws-space-4)',
            border: '1px solid var(--ws-warning, #d97706)',
            borderRadius: 'var(--ws-radius)',
            background: 'var(--ws-warning-soft, rgba(217,119,6,0.12))',
            color: 'var(--ws-text)',
          }}
        >
          <i className="bi bi-gem" aria-hidden="true" /> {t('generated.upsell')}
        </div>
      )}

      {isLoading && <p className="muted">{t('common.loading')}</p>}

      {!isLoading && (resources ?? []).length === 0 && (
        <div className="card" style={{ padding: 'var(--ws-space-6)', textAlign: 'center' }}>
          <p className="muted" style={{ margin: 0 }}>
            <i className="bi bi-lightning-charge" aria-hidden="true" /> {t('generated.empty')}
          </p>
        </div>
      )}

      <div className="grid-2">
        {(resources ?? []).map((resource) => (
          <div key={resource.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>{resource.name}</h3>
              <Badge variant="neutral">
                <i className="bi bi-braces" aria-hidden="true" /> {resource.key}
              </Badge>
            </div>
            {resource.description && <p className="muted" style={{ margin: 0 }}>{resource.description}</p>}
            <div className="row" style={{ gap: 'var(--ws-space-2)', flexWrap: 'wrap' }}>
              <Badge variant="info">{t(featureLabelKey(resource.feature), { defaultValue: resource.feature })}</Badge>
              <Badge variant={resource.enabled ? 'success' : 'warning'}>
                {resource.enabled ? t('common.enabled') : t('common.disabled')}
              </Badge>
              <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
                {fieldCount(resource.schema)} {t('generated.fieldCount')}
              </span>
            </div>
            <div className="row" style={{ gap: 'var(--ws-space-2)', marginTop: 'auto' }}>
              <Button variant="secondary" onClick={() => setResult(resource)}>
                <i className="bi bi-code-slash" aria-hidden="true" /> {t('generated.sdk')}
              </Button>
              <Button variant="ghost" onClick={() => setDeleting(resource)}>
                <i className="bi bi-trash" aria-hidden="true" /> {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {createOpen && (
        <ResourceFormDialog
          saving={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onSave={(body) => createMutation.mutate(body)}
        />
      )}

      {result && <SdkDialog resource={result} onClose={() => setResult(null)} />}

      <ConfirmDialog
        open={deleting !== null}
        title={t('generated.deleteTitle')}
        danger
        confirmLabel={t('common.delete')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.key)}
      >
        {t('generated.deleteConfirm', { key: deleting?.key ?? '' })}
      </ConfirmDialog>
    </div>
  );
}

function fieldCount(schema: unknown): number {
  const s = (schema ?? {}) as GeneratedSchema;
  return Object.keys(s.properties ?? {}).length;
}

/** Modal del patrón "crear" (M5): define el recurso + sus campos. */
function ResourceFormDialog({
  saving,
  onClose,
  onSave,
}: {
  saving: boolean;
  onClose: () => void;
  onSave: (body: { name: string; description: string; feature: string; schema: GeneratedSchema }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [feature, setFeature] = useState<string>('generator');
  const [fields, setFields] = useState<FieldDef[]>([emptyField()]);
  const [showJson, setShowJson] = useState(false);
  const [error, setError] = useState('');

  const schema = buildSchema(fields);

  function updateField(index: number, patch: Partial<FieldDef>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((prev) => [...prev, emptyField()]);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(t('generated.invalidName'));
      return;
    }
    const named = fields.filter((f) => f.name.trim());
    if (named.length === 0) {
      setError(t('generated.emptyFields'));
      return;
    }
    const seen = new Set<string>();
    for (const f of named) {
      const key = f.name.trim();
      if (seen.has(key)) {
        setError(t('generated.duplicateField'));
        return;
      }
      seen.add(key);
    }
    setError('');
    onSave({ name: name.trim(), description: description.trim(), feature, schema });
  }

  return (
    <Dialog
      open
      title={t('generated.create')}
      onClose={onClose}
      maxWidth={820}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="generated-resource-form" loading={saving}>
            <i className="bi bi-lightning-charge" aria-hidden="true" /> {t('generated.save')}
          </Button>
        </>
      }
    >
      <form id="generated-resource-form" onSubmit={handleSubmit} className="stack" style={{ gap: 'var(--ws-space-4)' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <TextField
            label={t('generated.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('generated.namePlaceholder')}
            required
          />
          <TextField
            label={t('generated.keyLabel')}
            value={normalizeKey(name)}
            disabled
            hint={t('generated.keyHint')}
          />
        </div>
        <TextField
          label={t('generated.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="field">
          <label className="form-label">{t('generated.feature')}</label>
          <select className="input form-select" value={feature} onChange={(e) => setFeature(e.target.value)}>
            {FEATURE_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {t(f.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{t('generated.fields')}</strong>
            <Button variant="secondary" type="button" onClick={addField}>
              <i className="bi bi-plus" aria-hidden="true" /> {t('generated.addField')}
            </Button>
          </div>

          {fields.map((field, index) => (
            <FieldRow
              key={index}
              field={field}
              onChange={(patch) => updateField(index, patch)}
              onRemove={() => removeField(index)}
              canRemove={fields.length > 1}
            />
          ))}

          <button type="button" className="btn ghost" onClick={() => setShowJson((s) => !s)} style={{ alignSelf: 'flex-start' }}>
            <i className="bi bi-braces" aria-hidden="true" /> {t('generated.schemaPreview')}
          </button>
          {showJson && (
            <pre className="log-code" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(schema, null, 2)}
            </pre>
          )}
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function FieldRow({
  field,
  onChange,
  onRemove,
  canRemove,
}: {
  field: FieldDef;
  onChange: (patch: Partial<FieldDef>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ws-space-2)', padding: 'var(--ws-space-3)' }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <TextField
          label={t('generated.fieldName')}
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t('generated.fieldNamePlaceholder')}
          style={{ flex: 1 }}
        />
        <div className="field" style={{ width: 180 }}>
          <label className="form-label">{t('generated.fieldType')}</label>
          <select
            className="input form-select"
            value={field.type}
            onChange={(e) => onChange({ type: e.target.value as FieldType })}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <Button variant="ghost" onClick={onRemove} disabled={!canRemove} aria-label={t('generated.removeField')} title={t('generated.removeField')}>
          <i className="bi bi-trash" aria-hidden="true" />
        </Button>
      </div>

      <div className="row" style={{ gap: 'var(--ws-space-4)', flexWrap: 'wrap' }}>
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          <span className="form-check-label">{t('generated.required')}</span>
        </label>
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={field.unique}
            onChange={(e) => onChange({ unique: e.target.checked })}
          />
          <span className="form-check-label">{t('generated.unique')}</span>
        </label>
        {field.type === 'string' && (
          <label className="form-check">
            <input
              className="form-check-input"
              type="checkbox"
              checked={field.format === 'html'}
              onChange={(e) => onChange({ format: e.target.checked ? 'html' : undefined })}
            />
            <span className="form-check-label">{t('generated.htmlFormat')}</span>
          </label>
        )}
      </div>

      {field.type === 'enum' && (
        <TextField
          label={t('generated.enumValues')}
          value={field.enumValues ?? ''}
          onChange={(e) => onChange({ enumValues: e.target.value })}
          placeholder={t('generated.enumValuesPlaceholder')}
        />
      )}
    </div>
  );
}

/** Modal de resultado: endpoint, CRUD y SDK tipado con copiar/descargar. */
function SdkDialog({ resource, onClose }: { resource: GeneratedResource; onClose: () => void }) {
  const { t } = useTranslation();
  const sdk = generateSdk(resource);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyText(sdk);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function handleDownload() {
    const blob = new Blob([sdk], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resource.key}.sdk.ts`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const crudRows = [
    { method: 'GET', path: `/api/v1/generated/${resource.key}`, label: t('generated.crudList') },
    { method: 'POST', path: `/api/v1/generated/${resource.key}`, label: t('generated.crudCreate') },
    { method: 'GET', path: `/api/v1/generated/${resource.key}/:id`, label: t('generated.crudGet') },
    { method: 'PATCH', path: `/api/v1/generated/${resource.key}/:id`, label: t('generated.crudUpdate') },
    { method: 'DELETE', path: `/api/v1/generated/${resource.key}/:id`, label: t('generated.crudDelete') },
  ];

  return (
    <Dialog open title={resource.name} onClose={onClose} maxWidth={820}>
      <div className="stack" style={{ gap: 'var(--ws-space-4)' }}>
        <div>
          <strong>{t('generated.endpoint')}</strong>
          <pre className="log-code" style={{ margin: 'var(--ws-space-2) 0 0', whiteSpace: 'pre-wrap' }}>
            /api/v1/generated/{resource.key}
          </pre>
        </div>

        <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
          <strong>{t('generated.crud')}</strong>
          <table className="table table-striped" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>{t('generated.crudMethod')}</th>
                <th>{t('generated.crudPath')}</th>
                <th>{t('generated.crudDesc')}</th>
              </tr>
            </thead>
            <tbody>
              {crudRows.map((row) => (
                <tr key={`${row.method}-${row.path}`}>
                  <td>
                    <Badge variant={methodVariant(row.method)}>{row.method}</Badge>
                  </td>
                  <td>
                    <code>{row.path}</code>
                  </td>
                  <td>{row.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="stack" style={{ gap: 'var(--ws-space-2)' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{t('generated.sdk')}</strong>
            <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
              <Button variant="secondary" onClick={handleCopy}>
                <i className={copied ? 'bi bi-check2' : 'bi bi-clipboard'} aria-hidden="true" />{' '}
                {copied ? t('generated.copied') : t('generated.copy')}
              </Button>
              <Button variant="secondary" onClick={handleDownload}>
                <i className="bi bi-download" aria-hidden="true" /> {t('generated.download')}
              </Button>
            </div>
          </div>
          <pre className="log-code" style={{ margin: 0, whiteSpace: 'pre', overflow: 'auto' }}>
            {sdk}
          </pre>
        </div>
      </div>
    </Dialog>
  );
}

function methodVariant(method: string): 'success' | 'primary' | 'warning' | 'danger' | 'neutral' {
  switch (method) {
    case 'GET':
      return 'success';
    case 'POST':
      return 'primary';
    case 'PATCH':
      return 'warning';
    case 'DELETE':
      return 'danger';
    default:
      return 'neutral';
  }
}

// Export local para evitar import no usado de fieldToSchema (lo usa buildSchema).
void fieldToSchema;
