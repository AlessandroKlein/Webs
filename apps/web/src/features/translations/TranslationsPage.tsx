import { memo, useCallback, useMemo, useState } from 'react';
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

/** Clave compuesta para indexar sobrescrituras: `${locale}\u0000${key}`. */
const overrideId = (locale: string, key: string) => `${locale}\u0000${key}`;

const EMPTY_VALUES: Record<string, string> = {};

export function TranslationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [showNewKey, setShowNewKey] = useState(false);

  const { data: localesData } = useQuery({
    queryKey: ['translations-locales'],
    queryFn: () => api.get<LocalesResponse>('/api/v1/locales'),
  });

  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['translations-keys'],
    queryFn: () => api.get<BaseKeysResponse>('/api/v1/translations/keys'),
  });

  const { data, isLoading: translationsLoading } = useQuery({
    queryKey: ['translations'],
    queryFn: () => api.get<TranslationsResponse>('/api/v1/translations'),
  });

  const catalog = localesData?.locales ?? [];
  const items = data?.items ?? [];

  // Valores base por clave (fuente de verdad de las claves fijas).
  const baseValuesByKey = useMemo(() => {
    const map = new Map<string, Record<string, string>>();
    for (const entry of keysData?.keys ?? []) map.set(entry.key, entry.values);
    return map;
  }, [keysData]);

  // Sobrescrituras de la BD (namespace "translation") indexadas por locale+key.
  const overridesByKeyLocale = useMemo(() => {
    const map = new Map<string, TranslationRow>();
    for (const item of items) {
      if (item.namespace !== 'translation') continue;
      map.set(overrideId(item.locale, item.key), item);
    }
    return map;
  }, [items]);

  // Columnas por idioma: catálogo (es/en/pt) + idiomas extra que ya tengan datos.
  const columnLocales = useMemo(() => {
    const order: string[] = catalog.map((l) => l.code);
    for (const loc of keysData?.locales ?? []) if (!order.includes(loc)) order.push(loc);
    for (const item of items) if (!order.includes(item.locale)) order.push(item.locale);
    return order;
  }, [catalog, keysData, items]);

  const nativeLabelOf = (code: string) => catalog.find((l) => l.code === code)?.nativeLabel ?? code;

  // Unión de claves: todas las base + claves creadas desde el admin (no base).
  const allKeys = useMemo(() => {
    const set = new Set<string>(baseValuesByKey.keys());
    for (const item of items) {
      if (item.namespace === 'translation') set.add(item.key);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [baseValuesByKey, items]);

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allKeys;
    return allKeys.filter((key) => key.toLowerCase().includes(q));
  }, [allKeys, search]);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['translations'] });
  }, [qc]);

  if (keysLoading || translationsLoading) return <Spinner />;

  return (
    <div className="stack" style={{ gap: 'var(--ws-space-5)' }}>
      <Card>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.translations')}</h1>
        <p className="muted" style={{ margin: 'var(--ws-space-2) 0 0' }}>
          Todas las claves base del sitio. Editá el valor en cada idioma y guardá: el valor guardado
          sobreescribe la traducción base y se sirve en el sitio.
        </p>
      </Card>

      <Card>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 240 }}>
            <TextField
              label="Buscar clave"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="nav.home, common.save…"
            />
          </div>
          <span className="muted" style={{ paddingBottom: 'var(--ws-space-4)' }}>
            {filteredKeys.length} / {allKeys.length} claves
          </span>
        </div>

        <div className="row" style={{ justifyContent: 'flex-start', gap: 'var(--ws-space-2)' }}>
          <Button variant={showNewKey ? 'secondary' : 'primary'} onClick={() => setShowNewKey((v) => !v)}>
            {showNewKey ? 'Cerrar formulario' : '+ Nueva clave'}
          </Button>
        </div>

        {showNewKey && (
          <NewKeyForm
            labels={Object.fromEntries(columnLocales.map((code) => [code, nativeLabelOf(code)]))}
            existingKeys={new Set(allKeys)}
            onCreated={invalidate}
          />
        )}
      </Card>

      <Card>
        <div className="table-scroll" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Clave</th>
                {columnLocales.map((loc) => (
                  <th key={loc} style={{ minWidth: 200 }}>
                    {nativeLabelOf(loc)} <span className="muted">({loc})</span>
                  </th>
                ))}
                <th style={{ width: 170 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map((key) => (
                <KeyRow
                  key={key}
                  rowKey={key}
                  locales={columnLocales}
                  baseValues={baseValuesByKey.get(key) ?? EMPTY_VALUES}
                  overrides={overridesByKeyLocale}
                  onSaved={invalidate}
                />
              ))}
            </tbody>
          </table>
          {filteredKeys.length === 0 && (
            <p className="muted" style={{ padding: 'var(--ws-space-4)' }}>
              No hay claves que coincidan con la búsqueda.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

const KeyRow = memo(function KeyRow({
  rowKey,
  locales,
  baseValues,
  overrides,
  onSaved,
}: {
  rowKey: string;
  locales: string[];
  baseValues: Record<string, string>;
  overrides: Map<string, TranslationRow>;
  onSaved: () => void;
}) {
  const overrideRows = useMemo(() => {
    const out: Record<string, TranslationRow | undefined> = {};
    for (const loc of locales) out[loc] = overrides.get(overrideId(loc, rowKey));
    return out;
  }, [locales, overrides, rowKey]);

  const effective = useMemo(() => {
    const out: Record<string, string> = {};
    for (const loc of locales) {
      out[loc] = overrideRows[loc]?.value ?? baseValues[loc] ?? '';
    }
    return out;
  }, [locales, overrideRows, baseValues]);

  const [baseline, setBaseline] = useState<Record<string, string>>(effective);
  const [values, setValues] = useState<Record<string, string>>(effective);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetLocale, setResetLocale] = useState<string | null>(null);

  const dirtyLocales = locales.filter((loc) => values[loc] !== baseline[loc]);

  const save = useMutation({
    mutationFn: async (dirty: string[]) => {
      for (const loc of dirty) {
        await api.post<TranslationRow>('/api/v1/translations', {
          locale: loc,
          namespace: 'translation',
          key: rowKey,
          value: (values[loc] ?? '').trim(),
        });
      }
    },
    onSuccess: (_data, dirty) => {
      setBaseline((prev) => {
        const next = { ...prev };
        for (const loc of dirty) next[loc] = (values[loc] ?? '').trim();
        return next;
      });
      setValues((prev) => {
        const next = { ...prev };
        for (const loc of dirty) next[loc] = (prev[loc] ?? '').trim();
        return next;
      });
      setSaved(true);
      setError(null);
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  const reset = useMutation({
    mutationFn: (loc: string) => {
      const row = overrides.get(overrideId(loc, rowKey));
      if (!row) return Promise.resolve();
      return api.del(`/api/v1/translations/${row.id}`);
    },
    onSuccess: (_data, loc) => {
      const base = baseValues[loc] ?? '';
      setBaseline((prev) => ({ ...prev, [loc]: base }));
      setValues((prev) => ({ ...prev, [loc]: base }));
      setResetLocale(null);
      setSaved(false);
      setError(null);
      onSaved();
    },
    onError: (e) => {
      setResetLocale(null);
      setError(e instanceof Error ? e.message : 'Error al restablecer');
    },
  });

  function submitSave() {
    if (dirtyLocales.length === 0) return;
    setSaved(false);
    setError(null);
    save.mutate(dirtyLocales);
  }

  function discard() {
    setValues(baseline);
    setSaved(false);
  }

  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <code style={{ wordBreak: 'break-word' }}>{rowKey}</code>
        {overrideRows && Object.values(overrideRows).some(Boolean) && (
          <span
            className="badge"
            style={{ display: 'inline-block', marginTop: 'var(--ws-space-1)' }}
            title="Esta clave tiene un valor personalizado en al menos un idioma"
          >
            personalizada
          </span>
        )}
      </td>
      {locales.map((loc) => {
        const overridden = Boolean(overrideRows[loc]);
        return (
          <td key={loc} style={{ verticalAlign: 'top' }}>
            <input
              className="input"
              value={values[loc] ?? ''}
              disabled={save.isPending}
              onChange={(e) => {
                setValues((prev) => ({ ...prev, [loc]: e.target.value }));
                setSaved(false);
              }}
            />
            {overridden && (
              <button
                type="button"
                className="btn ghost"
                disabled={save.isPending || reset.isPending}
                style={{ marginTop: 'var(--ws-space-1)', fontSize: 'var(--ws-font-size-sm)', padding: '2px 8px' }}
                onClick={() => setResetLocale(loc)}
              >
                ↺ Restablecer base
              </button>
            )}
          </td>
        );
      })}
      <td style={{ verticalAlign: 'top' }}>
        <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
          <Button onClick={submitSave} disabled={save.isPending || dirtyLocales.length === 0}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          {dirtyLocales.length > 0 && (
            <Button variant="ghost" disabled={save.isPending} onClick={discard}>
              Descartar
            </Button>
          )}
          {saved && !error && <span className="muted">✓ Guardado</span>}
          {error && <span style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</span>}
        </div>
      </td>
      <ConfirmDialog
        open={resetLocale !== null}
        title="Restablecer traducción"
        confirmLabel="Restablecer"
        danger
        onConfirm={() => {
          if (resetLocale) reset.mutate(resetLocale);
        }}
        onCancel={() => setResetLocale(null)}
      >
        ¿Restablecer <strong>{rowKey}</strong> ({resetLocale}) al valor base? Se eliminará la sobrescritura.
      </ConfirmDialog>
    </tr>
  );
});

function NewKeyForm({
  labels,
  existingKeys,
  onCreated,
}: {
  labels: Record<string, string>;
  existingKeys: Set<string>;
  onCreated: () => void;
}) {
  const [key, setKey] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const locales = Object.keys(labels);
  const trimmedKey = key.trim();
  const alreadyExists = trimmedKey !== '' && existingKeys.has(trimmedKey);

  const create = useMutation({
    mutationFn: async () => {
      for (const loc of locales) {
        const value = (values[loc] ?? '').trim();
        if (value === '') continue;
        await api.post<TranslationRow>('/api/v1/translations', {
          locale: loc,
          namespace: 'translation',
          key: trimmedKey,
          value,
        });
      }
    },
    onSuccess: () => {
      setNotice(`Clave «${trimmedKey}» guardada.`);
      setKey('');
      setValues({});
      setError(null);
      onCreated();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  function submit() {
    if (!trimmedKey) {
      setError('La clave es obligatoria');
      return;
    }
    const hasValue = locales.some((loc) => (values[loc] ?? '').trim() !== '');
    if (!hasValue) {
      setError('Ingresá al menos un valor.');
      return;
    }
    setError(null);
    setNotice(null);
    create.mutate();
  }

  return (
    <div style={{ marginTop: 'var(--ws-space-4)', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-4)' }}>
      <h3 style={{ marginTop: 0 }}>Nueva clave</h3>
      <p className="muted" style={{ margin: 0 }}>
        {alreadyExists
          ? `La clave ya existe: al guardar se actualizarán los valores (sin duplicarla).`
          : 'Creá una clave nueva con su valor en cada idioma.'}
      </p>
      <div style={{ marginTop: 'var(--ws-space-3)' }}>
        <TextField
          label="Clave"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="nav.home, common.save, custom.section…"
        />
      </div>
      <div className="grid-2" style={{ gap: 'var(--ws-space-3)' }}>
        {locales.map((loc) => (
          <TextField
            key={loc}
            label={`${labels[loc]} (${loc})`}
            value={values[loc] ?? ''}
            onChange={(e) => setValues((prev) => ({ ...prev, [loc]: e.target.value }))}
            placeholder="Valor traducido"
          />
        ))}
      </div>
      {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
      {notice && !error && <p className="muted">{notice}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Guardando…' : alreadyExists ? 'Actualizar clave' : 'Agregar clave'}
        </Button>
      </div>
    </div>
  );
}
