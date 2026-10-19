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

  const [selectedLocale, setSelectedLocale] = useState<string | null>(null);
  const [addingLocale, setAddingLocale] = useState(false);
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

  // Locales del sidebar: catálogo (es/en/pt) + idiomas con datos en BD.
  const catalogCodes = new Set(catalog.map((l) => l.code));
  const dbCodes = new Set(items.map((i) => i.locale));
  const extraCodes = [...dbCodes].filter((c) => !catalogCodes.has(c)).sort();
  const sidebarLocales = useMemo(() => {
    const fromCatalog = catalog.map((l) => ({ code: l.code, nativeLabel: l.nativeLabel }));
    const extras = extraCodes.map((c) => ({ code: c, nativeLabel: c }));
    return [...fromCatalog, ...extras];
  }, [catalog, extraCodes.join(',')]);

  const nativeLabelOf = (code: string) => catalog.find((l) => l.code === code)?.nativeLabel ?? code;

  const activeLocale = selectedLocale ?? localesData?.defaultLocale ?? catalog[0]?.code ?? null;

  // Unión de claves: todas las base + claves creadas desde el admin.
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
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)', margin: 0 }}>{t('nav.translations')}</h1>
        {sidebarLocales.map((l) => (
          <button
            key={l.code}
            type="button"
            className={`nav-link ${activeLocale === l.code && !addingLocale ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              setSelectedLocale(l.code);
              setAddingLocale(false);
              setShowNewKey(false);
            }}
          >
            {l.nativeLabel} <span className="muted">({l.code})</span>
          </button>
        ))}
        <button
          type="button"
          className={`nav-link ${addingLocale ? 'active' : ''}`}
          style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          onClick={() => {
            setAddingLocale(true);
            setShowNewKey(false);
          }}
        >
          + Agregar idioma
        </button>
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {addingLocale ? (
          <AddLocaleForm
            existingCodes={new Set([...catalogCodes, ...dbCodes])}
            onCreated={(code) => {
              setSelectedLocale(code);
              setAddingLocale(false);
              invalidate();
            }}
          />
        ) : activeLocale ? (
          <>
            <Card>
              <h2 style={{ marginTop: 0 }}>
                {nativeLabelOf(activeLocale)} <span className="muted">({activeLocale})</span>
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                Claves fijas del sitio. Editá el valor y guardá: el valor guardado sobreescribe la
                traducción base en este idioma.
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
              <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
                <Button variant={showNewKey ? 'secondary' : 'primary'} onClick={() => setShowNewKey((v) => !v)}>
                  {showNewKey ? 'Cerrar formulario' : '+ Nueva clave'}
                </Button>
              </div>
              {showNewKey && (
                <div style={{ marginTop: 'var(--ws-space-4)', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-4)' }}>
                  <NewKeyForm
                    locale={activeLocale}
                    localeLabel={nativeLabelOf(activeLocale)}
                    existingKeys={new Set(allKeys)}
                    onCreated={() => {
                      invalidate();
                      setShowNewKey(false);
                    }}
                  />
                </div>
              )}
            </Card>

            <Card>
              <div className="table-scroll" style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 220 }}>Clave</th>
                      <th style={{ minWidth: 320 }}>Valor ({activeLocale})</th>
                      <th style={{ width: 180 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKeys.map((key) => (
                      <LocaleRow
                        key={key}
                        rowKey={key}
                        locale={activeLocale}
                        baseValue={baseValuesByKey.get(key)?.[activeLocale] ?? ''}
                        override={overridesByKeyLocale.get(overrideId(activeLocale, key))}
                        onSaved={invalidate}
                      />
                    ))}
                  </tbody>
                </table>
                {filteredKeys.length === 0 && (
                  <p className="muted" style={{ padding: 'var(--ws-space-4)' }}>No hay claves que coincidan.</p>
                )}
              </div>
            </Card>
          </>
        ) : (
          <Card>
            <p className="muted">Seleccioná un idioma para ver y editar sus traducciones.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

const LocaleRow = memo(function LocaleRow({
  rowKey,
  locale,
  baseValue,
  override,
  onSaved,
}: {
  rowKey: string;
  locale: string;
  baseValue: string;
  override?: TranslationRow;
  onSaved: () => void;
}) {
  const effective = override?.value ?? baseValue;
  const [value, setValue] = useState(effective);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = value !== effective;

  const save = useMutation({
    mutationFn: () =>
      api.post<TranslationRow>('/api/v1/translations', {
        locale,
        namespace: 'translation',
        key: rowKey,
        value: value.trim(),
      }),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al guardar'),
  });

  const reset = useMutation({
    mutationFn: () => (override ? api.del(`/api/v1/translations/${override.id}`) : Promise.resolve()),
    onSuccess: () => {
      setValue(baseValue);
      setSaved(false);
      setError(null);
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Error al restablecer'),
  });

  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <code style={{ wordBreak: 'break-word' }}>{rowKey}</code>
        {override && (
          <span className="badge" style={{ display: 'inline-block', marginTop: 'var(--ws-space-1)' }} title="Tiene valor personalizado">
            personalizada
          </span>
        )}
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <input
          className="input"
          value={value}
          disabled={save.isPending}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
        {override && (
          <button
            type="button"
            className="btn ghost"
            disabled={save.isPending || reset.isPending}
            style={{ marginTop: 'var(--ws-space-1)', fontSize: 'var(--ws-font-size-sm)', padding: '2px 8px' }}
            onClick={() => setConfirmReset(true)}
          >
            ↺ Restablecer base
          </button>
        )}
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          {dirty && (
            <Button variant="ghost" disabled={save.isPending} onClick={() => setValue(effective)}>
              Descartar
            </Button>
          )}
          {saved && !error && <span className="muted">✓ Guardado</span>}
          {error && <span style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</span>}
        </div>
      </td>
      <ConfirmDialog
        open={confirmReset}
        title="Restablecer traducción"
        confirmLabel="Restablecer"
        danger
        onConfirm={() => {
          setConfirmReset(false);
          reset.mutate();
        }}
        onCancel={() => setConfirmReset(false)}
      >
        ¿Restablecer <strong>{rowKey}</strong> al valor base en {locale}?
      </ConfirmDialog>
    </tr>
  );
});

function NewKeyForm({
  locale,
  localeLabel,
  existingKeys,
  onCreated,
}: {
  locale: string;
  localeLabel: string;
  existingKeys: Set<string>;
  onCreated: () => void;
}) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmedKey = key.trim();
  const alreadyExists = trimmedKey !== '' && existingKeys.has(trimmedKey);

  const create = useMutation({
    mutationFn: () =>
      api.post<TranslationRow>('/api/v1/translations', {
        locale,
        namespace: 'translation',
        key: trimmedKey,
        value,
      }),
    onSuccess: () => {
      setKey('');
      setValue('');
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
    if (value.trim() === '') {
      setError('Ingresá un valor.');
      return;
    }
    setError(null);
    create.mutate();
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Nueva clave en {localeLabel} ({locale})</h3>
      <p className="muted" style={{ margin: 0 }}>
        {alreadyExists ? 'La clave ya existe: al guardar se actualizará su valor.' : 'Creá una clave nueva con su valor.'}
      </p>
      <div style={{ marginTop: 'var(--ws-space-3)' }}>
        <TextField label="Clave" value={key} onChange={(e) => setKey(e.target.value)} placeholder="nav.home, common.save…" />
      </div>
      <div style={{ marginTop: 'var(--ws-space-2)' }}>
        <TextField label="Valor" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Texto traducido" />
      </div>
      {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Guardando…' : alreadyExists ? 'Actualizar clave' : 'Agregar clave'}
        </Button>
      </div>
    </div>
  );
}

function AddLocaleForm({
  existingCodes,
  onCreated,
}: {
  existingCodes: Set<string>;
  onCreated: (code: string) => void;
}) {
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
    if (!code.trim()) {
      setError('El código de idioma es obligatorio');
      return;
    }
    if (existingCodes.has(code.trim())) {
      setError('Ese idioma ya existe en el listado');
      return;
    }
    if (!key.trim() || value.trim() === '') {
      setError('La primera clave y su valor son obligatorios');
      return;
    }
    setError(null);
    create.mutate();
  }

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>Agregar idioma</h2>
      <p className="muted" style={{ margin: 0 }}>
        Creá un idioma nuevo registrando su primera traducción. Usá un código ISO (ej. <code>fr</code>, <code>de</code>).
      </p>
      <div style={{ marginTop: 'var(--ws-space-4)' }}>
        <TextField label="Código de idioma" value={code} onChange={(e) => setCode(e.target.value)} placeholder="fr, de, it…" />
      </div>
      <div style={{ marginTop: 'var(--ws-space-2)' }}>
        <TextField label="Primera clave" value={key} onChange={(e) => setKey(e.target.value)} placeholder="nav.home, common.save…" />
      </div>
      <div style={{ marginTop: 'var(--ws-space-2)' }}>
        <TextField label="Valor" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Texto traducido" />
      </div>
      {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? 'Creando…' : 'Crear idioma'}
        </Button>
      </div>
    </Card>
  );
}
