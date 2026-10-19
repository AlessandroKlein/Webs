import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

interface LocaleDefinition {
  code: string;
  label: string;
  nativeLabel: string;
}

interface TranslationRow {
  id: string;
  locale: string;
  namespace: string;
  key: string;
  value: string;
}

interface LocalesResponse {
  locales: LocaleDefinition[];
  defaultLocale: string;
}

interface TranslationsResponse {
  items: TranslationRow[];
}

interface BaseKeysResponse {
  locales: string[];
  keys: Array<{ key: string; values: Record<string, string> }>;
}

export function TranslationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);
  const [addingLocale, setAddingLocale] = useState(false);

  const { data: localesData } = useQuery({
    queryKey: ['translations-locales'],
    queryFn: () => api.get<LocalesResponse>('/api/v1/locales'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['translations'],
    queryFn: () => api.get<TranslationsResponse>('/api/v1/translations'),
  });

  const { data: keysData } = useQuery({
    queryKey: ['translations-keys'],
    queryFn: () => api.get<BaseKeysResponse>('/api/v1/translations/keys'),
  });

  const baseKeys = (keysData?.keys ?? []).map((k) => k.key);
  const catalog = localesData?.locales ?? [];
  const items = data?.items ?? [];

  // Locales de la barra lateral: el catálogo más los idiomas que ya tienen
  // traducciones en la BD (así un idioma recién creado aparece de inmediato).
  const catalogCodes = new Set(catalog.map((l) => l.code));
  const dbCodes = new Set(items.map((i) => i.locale));
  const extraCodes = [...dbCodes].filter((c) => !catalogCodes.has(c)).sort();
  const sidebarLocales: Array<{ code: string; nativeLabel: string }> = [
    ...catalog.map((l) => ({ code: l.code, nativeLabel: l.nativeLabel })),
    ...extraCodes.map((c) => ({ code: c, nativeLabel: c })),
  ];

  const activeLocale = selectedLocale ?? localesData?.defaultLocale ?? catalog[0]?.code ?? null;
  const rows = activeLocale ? items.filter((i) => i.locale === activeLocale) : [];

  if (isLoading) return <Spinner />;

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.translations')}</h1>
        {sidebarLocales.map((l) => (
          <button
            key={l.code}
            className={`nav-link ${activeLocale === l.code && !addingLocale ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              setSelectedLocale(l.code);
              setAddingLocale(false);
            }}
          >
            {l.nativeLabel} <span className="muted">({l.code})</span>
          </button>
        ))}
        <button
          className={`nav-link ${addingLocale ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => setAddingLocale(true)}
        >
          + Agregar idioma
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        <datalist id="translation-keys">
          {baseKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        {addingLocale ? (
          <AddLocaleForm
            onCreated={(code) => {
              setSelectedLocale(code);
              setAddingLocale(false);
              void qc.invalidateQueries({ queryKey: ['translations'] });
            }}
          />
        ) : activeLocale ? (
          <>
            <Card>
              <h3 style={{ marginTop: 0 }}>
                {catalog.find((l) => l.code === activeLocale)?.nativeLabel ?? activeLocale}{' '}
                <span className="muted">({activeLocale})</span>
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Claves y valores de este idioma. Editá cada fila y guardá los cambios.
              </p>
            </Card>

            <NewKeyForm locale={activeLocale} />

            <Card>
              <table className="table">
                <thead>
                  <tr>
                    <th>Clave</th>
                    <th>Valor</th>
                    <th style={{ width: 220 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <TranslationRowItem key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p className="muted">Este idioma no tiene traducciones definidas. Agregá una clave arriba.</p>
              )}
            </Card>
          </>
        ) : (
          <Card>
            <p className="muted">Seleccioná un idioma para ver sus traducciones.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function AddLocaleForm({ onCreated }: { onCreated: (code: string) => void }) {
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<TranslationRow>('/api/v1/translations', {
        locale: code.trim(),
        namespace: 'translation',
        key: key.trim(),
        value,
      }),
    onSuccess: () => onCreated(code.trim()),
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al crear el idioma'),
  });

  function submit() {
    if (!code.trim() || !key.trim()) {
      setError('El código de idioma y la primera clave son obligatorios');
      return;
    }
    setError(null);
    create.mutate();
  }

  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>Agregar idioma</h3>
      <p className="muted">
        Creá un idioma nuevo registrando su primera traducción. Usá un código ISO (por ejemplo <code>fr</code>).
      </p>
      <div className="grid-2" style={{ gap: 'var(--ws-space-2)' }}>
        <TextField
          label="Código de idioma"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="fr, de, it, …"
        />
        <TextField
          label="Primera clave"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="nav.home, common.save, …"
          list="translation-keys"
        />
      </div>
      <TextField
        label="Valor"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Texto traducido"
      />
      {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Creando…' : 'Crear idioma'}
        </Button>
      </div>
    </Card>
  );
}

function NewKeyForm({ locale }: { locale: string }) {
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<TranslationRow>('/api/v1/translations', {
        locale,
        namespace: 'translation',
        key: key.trim(),
        value,
      }),
    onSuccess: () => {
      setKey('');
      setValue('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['translations'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  function submit() {
    if (!key.trim()) {
      setError('La clave es obligatoria');
      return;
    }
    setError(null);
    create.mutate();
  }

  return (
    <Card>
      <h3 style={{ marginTop: 0 }}>Nueva clave</h3>
      <div className="grid-2" style={{ gap: 'var(--ws-space-2)' }}>
        <TextField
          label="Clave"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="nav.home, common.save, …"
          list="translation-keys"
        />
        <TextField
          label="Valor"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Texto traducido"
        />
      </div>
      {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Guardando…' : 'Agregar clave'}
        </Button>
      </div>
    </Card>
  );
}

function TranslationRowItem({ row }: { row: TranslationRow }) {
  const qc = useQueryClient();
  const [key, setKey] = useState(row.key);
  const [value, setValue] = useState(row.value);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = key !== row.key || value !== row.value;

  const save = useMutation({
    mutationFn: () =>
      api.put<TranslationRow>(`/api/v1/translations/${row.id}`, {
        locale: row.locale,
        namespace: row.namespace,
        key: key.trim(),
        value,
      }),
    onSuccess: () => {
      setKey(key.trim());
      setSaved(true);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['translations'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/api/v1/translations/${row.id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['translations'] }),
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al eliminar'),
  });

  function submitSave() {
    if (!key.trim()) {
      setError('La clave no puede estar vacía');
      return;
    }
    setError(null);
    setSaved(false);
    save.mutate();
  }

  return (
    <tr>
      <td>
        <input
          className="input"
          list="translation-keys"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setSaved(false);
          }}
        />
        {row.namespace !== 'translation' && (
          <span className="muted" style={{ fontSize: 'var(--ws-font-size-sm)' }}>
            ns: {row.namespace}
          </span>
        )}
      </td>
      <td>
        <input
          className="input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
      </td>
      <td>
        <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
          <Button onClick={submitSave} disabled={save.isPending || !dirty}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            Eliminar
          </Button>
        </div>
        {saved && !error && (
          <p className="muted" style={{ margin: 0 }}>
            ✓ Guardado
          </p>
        )}
        {error && <p style={{ color: 'var(--ws-danger, #dc2626)', margin: 0 }}>{error}</p>}
      </td>
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar traducción"
        confirmLabel="Eliminar"
        danger
        onConfirm={() => {
          remove.mutate();
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      >
        ¿Eliminar la traducción <strong>{row.key}</strong> ({row.locale})?
      </ConfirmDialog>
    </tr>
  );
}
