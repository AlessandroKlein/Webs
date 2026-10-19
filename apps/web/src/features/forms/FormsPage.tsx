import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

const FORMS_BASE = '/api/v1/blocks/formularios';
const DOCS_BASE = '/api/v1/blocks/documentos';

interface FormDef {
  id: string;
  title: string;
  fields: unknown;
  createdAt: string;
}

interface FormResponse {
  id: string;
  formId: string;
  data: unknown;
  createdAt: string;
}

interface DocumentRow {
  id: string;
  userId: string | null;
  name: string;
  content: string;
  signed: boolean;
  createdAt: string;
}

type View = 'forms' | 'documents';

type FieldType = 'text' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';

interface FormFieldDraft {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  optionsText: string;
}

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'select', label: 'Select' },
  { value: 'textarea', label: 'Área de texto' },
  { value: 'checkbox', label: 'Checkbox' },
];

/** Normaliza `fields` (JSON) a borradores editables en el constructor visual. */
const parseFields = (raw: unknown): FormFieldDraft[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((f, i) => {
    const obj = (f ?? {}) as Record<string, unknown>;
    const key =
      typeof obj.key === 'string' && obj.key
        ? obj.key
        : typeof obj.name === 'string' && obj.name
          ? obj.name
          : `campo_${i + 1}`;
    const label = typeof obj.label === 'string' ? obj.label : key;
    const type = FIELD_TYPES.some((ft) => ft.value === obj.type) ? (obj.type as FieldType) : 'text';
    const required = obj.required === true;
    const optionsText = Array.isArray(obj.options)
      ? obj.options.map(String).join(', ')
      : typeof obj.options === 'string'
        ? obj.options
        : '';
    return { key, label, type, required, optionsText };
  });
};

export function FormsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('forms');

  // ── Formularios ─────────────────────────────────────────
  const { data: forms, isLoading: formsLoading } = useQuery({
    queryKey: ['forms'],
    queryFn: () => api.get<FormDef[]>(`${FORMS_BASE}/forms`),
  });

  const [formTitle, setFormTitle] = useState('');
  const [fields, setFields] = useState<FormFieldDraft[]>([]);
  const [editingForm, setEditingForm] = useState<FormDef | null>(null);
  const [selectedForm, setSelectedForm] = useState<FormDef | null>(null);
  const [confirmForm, setConfirmForm] = useState<FormDef | null>(null);

  const { data: responses, isLoading: responsesLoading } = useQuery({
    queryKey: ['form-responses', selectedForm?.id],
    queryFn: () => {
      if (!selectedForm) return Promise.resolve([]);
      return api.get<FormResponse[]>(`${FORMS_BASE}/forms/${selectedForm.id}/responses`);
    },
    enabled: selectedForm !== null,
  });

  const resetFormBuilder = () => {
    setFormTitle('');
    setFields([]);
    setEditingForm(null);
  };

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { key: `campo_${prev.length + 1}`, label: '', type: 'text', required: false, optionsText: '' },
    ]);
  };

  const updateField = (index: number, patch: Partial<FormFieldDraft>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index));
  };

  const startEditForm = (f: FormDef) => {
    setEditingForm(f);
    setFormTitle(f.title);
    setFields(parseFields(f.fields));
    setSelectedForm(null);
  };

  const saveForm = useMutation({
    mutationFn: (vars: { id: string | null; body: { title: string; fields: unknown } }) =>
      vars.id
        ? api.patch<FormDef>(`${FORMS_BASE}/forms/${vars.id}`, vars.body)
        : api.post<FormDef>(`${FORMS_BASE}/forms`, vars.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forms'] });
      resetFormBuilder();
    },
  });

  const deleteForm = useMutation({
    mutationFn: (id: string) => api.del(`${FORMS_BASE}/forms/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forms'] });
      setSelectedForm(null);
    },
  });

  const submitForm = () => {
    const built = fields
      .filter((f) => f.key.trim() && f.label.trim())
      .map((f) => ({
        key: f.key.trim(),
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        ...(f.type === 'select'
          ? { options: f.optionsText.split(',').map((s) => s.trim()).filter(Boolean) }
          : {}),
      }));
    saveForm.mutate({ id: editingForm?.id ?? null, body: { title: formTitle.trim(), fields: built } });
  };

  // ── Documentos ──────────────────────────────────────────
  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.get<DocumentRow[]>(`${DOCS_BASE}/documents`),
  });

  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const [confirmDoc, setConfirmDoc] = useState<DocumentRow | null>(null);

  const createDoc = useMutation({
    mutationFn: () => api.post<DocumentRow>(`${DOCS_BASE}/documents`, { name: docName.trim(), content: docContent }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents'] });
      setDocName('');
      setDocContent('');
    },
  });

  const signDoc = useMutation({
    mutationFn: (id: string) => api.post(`${DOCS_BASE}/documents/${id}/sign`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  const deleteDoc = useMutation({
    mutationFn: (id: string) => api.del(`${DOCS_BASE}/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  });

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('admin.forms.title')}</h1>
        <button
          className={`nav-link ${view === 'forms' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('forms')}
        >
          {t('admin.forms.forms')}
        </button>
        <button
          className={`nav-link ${view === 'documents' ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setView('documents')}
        >
          {t('admin.forms.documents')}
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {view === 'forms' && (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>{editingForm ? 'Editar formulario' : t('admin.forms.newForm')}</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitForm();
                }}
              >
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <TextField label={t('common.title')} value={formTitle} onChange={(e) => setFormTitle(e.target.value)} required />
                </div>

                <div className="stack" style={{ gap: 'var(--ws-space-3)' }}>
                  {fields.map((f, i) => (
                    <div
                      key={i}
                      className="stack"
                      style={{
                        border: '1px solid var(--ws-surface-2)',
                        borderRadius: 'var(--ws-radius-md)',
                        padding: 'var(--ws-space-3)',
                        gap: 'var(--ws-space-2)',
                      }}
                    >
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>Campo {i + 1}</strong>
                        <Button variant="ghost" type="button" onClick={() => removeField(i)}>
                          Eliminar
                        </Button>
                      </div>
                      <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <TextField label="Etiqueta" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                        <TextField label="Clave" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} />
                        <div className="field">
                          <label>Tipo</label>
                          <select
                            className="input"
                            style={{ width: 'auto' }}
                            value={f.type}
                            onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                          >
                            {FIELD_TYPES.map((ft) => (
                              <option key={ft.value} value={ft.value}>
                                {ft.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                          <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--ws-space-2)' }}>
                            <input
                              type="checkbox"
                              checked={f.required}
                              onChange={(e) => updateField(i, { required: e.target.checked })}
                            />
                            Requerido
                          </label>
                        </div>
                      </div>
                      {f.type === 'select' && (
                        <div className="field">
                          <label>Opciones (separadas por coma)</label>
                          <input
                            className="input"
                            value={f.optionsText}
                            onChange={(e) => updateField(i, { optionsText: e.target.value })}
                            placeholder="Opción 1, Opción 2"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {fields.length === 0 && (
                    <p className="muted" style={{ margin: 0 }}>
                      Sin campos todavía. Agregá campos para construir el formulario.
                    </p>
                  )}
                </div>

                <div className="row">
                  <Button variant="secondary" type="button" onClick={addField}>
                    Agregar campo
                  </Button>
                </div>

                <div className="row">
                  <Button type="submit" disabled={saveForm.isPending || !formTitle}>
                    {editingForm ? t('common.save') : t('admin.forms.createForm')}
                  </Button>
                  {editingForm && (
                    <Button variant="ghost" type="button" onClick={resetFormBuilder}>
                      {t('common.cancel')}
                    </Button>
                  )}
                  {saveForm.error && <span style={{ color: 'var(--ws-danger)' }}>{saveForm.error.message}</span>}
                </div>
              </form>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.forms.forms')}</h3>
              {formsLoading ? (
                <Spinner />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.title')}</th>
                      <th>{t('admin.forms.fields')}</th>
                      <th>{t('admin.forms.created')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(forms ?? []).map((f) => (
                      <tr key={f.id}>
                        <td>{f.title}</td>
                        <td>
                          <code className="muted">{JSON.stringify(f.fields)}</code>
                        </td>
                        <td>{new Date(f.createdAt).toLocaleString()}</td>
                        <td>
                          <div className="row">
                            <Button variant="secondary" onClick={() => startEditForm(f)}>
                              {t('common.edit')}
                            </Button>
                            <Button variant="secondary" onClick={() => setSelectedForm(f)}>
                              {t('admin.forms.responses')}
                            </Button>
                            <Button variant="ghost" onClick={() => setConfirmForm(f)}>
                              {t('common.delete')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(forms ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <p className="muted">{t('admin.forms.noForms')}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>

            {selectedForm && (
              <Card>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>{t('admin.forms.responsesOf', { title: selectedForm.title })}</h3>
                  <Button variant="ghost" onClick={() => setSelectedForm(null)}>
                    {t('common.close')}
                  </Button>
                </div>
                {responsesLoading ? (
                  <Spinner />
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('admin.forms.data')}</th>
                        <th>{t('common.date')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(responses ?? []).map((r) => (
                        <tr key={r.id}>
                          <td>
                            <code className="muted">{JSON.stringify(r.data)}</code>
                          </td>
                          <td>{new Date(r.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(responses ?? []).length === 0 && (
                        <tr>
                          <td colSpan={2}>
                            <p className="muted">{t('admin.forms.noResponses')}</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </Card>
            )}
          </>
        )}

        {view === 'documents' && (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.forms.newDocument')}</h3>
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  createDoc.mutate();
                }}
              >
                <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <TextField label={t('common.name')} value={docName} onChange={(e) => setDocName(e.target.value)} required />
                </div>
                <div className="field">
                  <label>{t('admin.forms.content')}</label>
                  <textarea
                    className="input"
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    rows={5}
                    required
                  />
                </div>
                <div className="row">
                  <Button type="submit" disabled={createDoc.isPending || !docName || !docContent}>
                    {t('admin.forms.createDocument')}
                  </Button>
                  {createDoc.error && <span style={{ color: 'var(--ws-danger)' }}>{createDoc.error.message}</span>}
                </div>
              </form>
            </Card>

            <Card>
              <h3 style={{ marginTop: 0 }}>{t('admin.forms.documents')}</h3>
              {documentsLoading ? (
                <Spinner />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      <th>{t('admin.forms.signed')}</th>
                      <th>{t('admin.forms.created')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(documents ?? []).map((d) => (
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: d.signed ? 'var(--ws-success)' : 'var(--ws-surface-2)',
                              color: d.signed ? '#fff' : 'var(--ws-text-muted)',
                            }}
                          >
                            {d.signed ? t('admin.forms.signed') : t('admin.forms.pending')}
                          </span>
                        </td>
                        <td>{new Date(d.createdAt).toLocaleString()}</td>
                        <td>
                          <div className="row">
                            {!d.signed && (
                              <Button variant="secondary" onClick={() => signDoc.mutate(d.id)} disabled={signDoc.isPending}>
                                {t('admin.forms.sign')}
                              </Button>
                            )}
                            <Button variant="ghost" onClick={() => setConfirmDoc(d)}>
                              {t('common.delete')}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(documents ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <p className="muted">{t('admin.forms.noDocuments')}</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}

        <ConfirmDialog
          open={confirmForm !== null}
          title={t('admin.forms.deleteForm')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            if (confirmForm) deleteForm.mutate(confirmForm.id);
            setConfirmForm(null);
          }}
          onCancel={() => setConfirmForm(null)}
        >
          {t('admin.forms.deleteFormConfirm', { title: confirmForm?.title })}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmDoc !== null}
          title={t('admin.forms.deleteDocument')}
          confirmLabel={t('common.delete')}
          danger
          onConfirm={() => {
            if (confirmDoc) deleteDoc.mutate(confirmDoc.id);
            setConfirmDoc(null);
          }}
          onCancel={() => setConfirmDoc(null)}
        >
          {t('admin.forms.deleteDocumentConfirm', { name: confirmDoc?.name })}
        </ConfirmDialog>
      </div>
    </div>
  );
}
