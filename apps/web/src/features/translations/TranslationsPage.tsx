import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';

interface TranslationRow {
  id: string;
  locale: string;
  namespace: string;
  key: string;
  value: string;
}

interface TranslationForm {
  key: string;
  locale: string;
  namespace: string;
  value: string;
}

const emptyForm: TranslationForm = { key: '', locale: 'es', namespace: 'translation', value: '' };

export function TranslationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [localeFilter, setLocaleFilter] = useState('');
  const [namespaceFilter, setNamespaceFilter] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const [form, setForm] = useState<TranslationForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['translations', filters],
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<{ items: TranslationRow[] }>(`/api/v1/translations${suffix}`);
    },
  });

  const save = useMutation({
    mutationFn: (input: TranslationForm) =>
      editingId
        ? api.put<TranslationRow>(`/api/v1/translations/${editingId}`, input)
        : api.post<TranslationRow>('/api/v1/translations', input),
    onSuccess: () => {
      resetForm();
      void qc.invalidateQueries({ queryKey: ['translations'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/translations/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['translations'] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al eliminar'),
  });

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
  }

  function applyFilters() {
    setFilters({ locale: localeFilter.trim(), namespace: namespaceFilter.trim() });
  }

  function startEdit(row: TranslationRow) {
    setEditingId(row.id);
    setForm({ key: row.key, locale: row.locale, namespace: row.namespace, value: row.value });
    setError(null);
  }

  function submit() {
    if (!form.key.trim() || !form.locale.trim()) {
      setError('Clave y locale son obligatorios');
      return;
    }
    setError(null);
    save.mutate(form);
  }

  if (isLoading) return <Spinner />;

  const items = data?.items ?? [];

  return (
    <div className="stack">
      <h1>{t('nav.translations')}</h1>
      <p className="muted">
        Las traducciones definidas aquí sobrescriben los recursos base. Los bloques pueden aportar
        sus propias claves.
      </p>

      <Card>
        <div className="grid-2" style={{ gap: 'var(--ws-space-2)' }}>
          <TextField
            label="Locale"
            value={localeFilter}
            onChange={(e) => setLocaleFilter(e.target.value)}
            placeholder="es, en, …"
          />
          <TextField
            label="Namespace"
            value={namespaceFilter}
            onChange={(e) => setNamespaceFilter(e.target.value)}
            placeholder="translation, …"
          />
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
          <Button onClick={applyFilters}>Filtrar</Button>
        </div>
      </Card>

      <Card>
        <h3 style={{ marginBottom: 'var(--ws-space-4)' }}>{editingId ? 'Editar traducción' : 'Nueva traducción'}</h3>
        <div className="grid-2" style={{ gap: 'var(--ws-space-2)' }}>
          <TextField
            label="Clave"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            placeholder="nav.home, common.save, …"
          />
          <TextField
            label="Locale"
            value={form.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
            placeholder="es"
          />
          <TextField
            label="Namespace"
            value={form.namespace}
            onChange={(e) => setForm({ ...form, namespace: e.target.value })}
            placeholder="translation"
          />
          <TextField
            label="Valor"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            placeholder="Texto traducido"
          />
        </div>
        {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
          {editingId && (
            <Button variant="secondary" onClick={resetForm}>
              Cancelar
            </Button>
          )}
          <Button onClick={submit} disabled={save.isPending}>
            {editingId ? t('common.save') : 'Crear'}
          </Button>
        </div>
      </Card>

      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>Locale</th>
              <th>Namespace</th>
              <th>Clave</th>
              <th>Valor</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tr) => (
              <tr key={tr.id}>
                <td>{tr.locale}</td>
                <td>
                  <code>{tr.namespace}</code>
                </td>
                <td>
                  <code>{tr.key}</code>
                </td>
                <td>{tr.value}</td>
                <td>
                  <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
                    <Button variant="ghost" onClick={() => startEdit(tr)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la traducción "${tr.key}"?`)) remove.mutate(tr.id);
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="muted">No hay traducciones.</p>}
      </Card>
    </div>
  );
}
