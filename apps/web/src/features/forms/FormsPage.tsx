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
  const [fieldsJson, setFieldsJson] = useState('');
  const [fieldsError, setFieldsError] = useState('');
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

  const createForm = useMutation({
    mutationFn: (fields: unknown) => api.post<FormDef>(`${FORMS_BASE}/forms`, { title: formTitle.trim(), fields }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forms'] });
      setFormTitle('');
      setFieldsJson('');
      setFieldsError('');
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
    let fields: unknown;
    try {
      fields = JSON.parse(fieldsJson);
    } catch {
      setFieldsError(t('admin.forms.invalidJson'));
      return;
    }
    setFieldsError('');
    createForm.mutate(fields);
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
              <h3 style={{ marginTop: 0 }}>{t('admin.forms.newForm')}</h3>
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
                <div className="field">
                  <label>{t('admin.forms.fieldsJson')}</label>
                  <textarea
                    className="input"
                    value={fieldsJson}
                    onChange={(e) => setFieldsJson(e.target.value)}
                    placeholder='[{"name":"email","label":"Email","type":"text"}]'
                    rows={4}
                  />
                </div>
                {fieldsError && <p style={{ color: 'var(--ws-danger)', margin: 0 }}>{fieldsError}</p>}
                <div className="row">
                  <Button type="submit" disabled={createForm.isPending || !formTitle}>
                    {t('admin.forms.createForm')}
                  </Button>
                  {createForm.error && <span style={{ color: 'var(--ws-danger)' }}>{createForm.error.message}</span>}
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
