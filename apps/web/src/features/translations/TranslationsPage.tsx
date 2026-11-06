import { memo, useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PageHeader } from '../../components/ui/PageHeader';

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

export function TranslationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useAuthStore((s) => s.hasPermission)('translation.write');

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
        <PageHeader title={t('nav.translations')} />
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
        {canWrite && (
          <button
            type="button"
            className={`nav-link ${addingLocale ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              setAddingLocale(true);
              setShowNewKey(false);
            }}
          >
            + {t('translations.addLanguage')}
          </button>
        )}
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
                {t('translations.keysHint')}
              </p>
            </Card>

            <Card>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 240 }}>
                  <TextField
                    label={t('translations.searchKey')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="nav.home, common.save…"
                  />
                </div>
                <span className="muted" style={{ paddingBottom: 'var(--ws-space-4)' }}>
                  {t('translations.keysCount', { shown: filteredKeys.length, total: allKeys.length })}
                </span>
              </div>
              {canWrite && (
                <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
                  <Button variant={showNewKey ? 'secondary' : 'primary'} onClick={() => setShowNewKey((v) => !v)}>
                    {showNewKey ? t('translations.closeForm') : t('translations.newKey')}
                  </Button>
                </div>
              )}
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
                      <th style={{ minWidth: 220 }}>{t('translations.key')}</th>
                      <th style={{ minWidth: 320 }}>{t('translations.value')} ({activeLocale})</th>
                      <th style={{ width: 180 }}>{t('translations.actions')}</th>
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
                  <p className="muted" style={{ padding: 'var(--ws-space-4)' }}>{t('translations.noMatch')}</p>
                )}
              </div>
            </Card>
          </>
        ) : (
          <Card>
            <p className="muted">{t('translations.selectLocale')}</p>
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
  const { t } = useTranslation();
  const [value, setValue] = useState(effective);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = value !== effective;
  const canWrite = useAuthStore((s) => s.hasPermission)('translation.write');

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
    onError: (e) => setError(e instanceof Error ? e.message : t('translations.saveError')),
  });

  const reset = useMutation({
    mutationFn: () => (override ? api.del(`/api/v1/translations/${override.id}`) : Promise.resolve()),
    onSuccess: () => {
      setValue(baseValue);
      setSaved(false);
      setError(null);
      onSaved();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('translations.resetError')),
  });

  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <code style={{ wordBreak: 'break-word' }}>{rowKey}</code>
        {override && (
          <span className="badge" style={{ display: 'inline-block', marginTop: 'var(--ws-space-1)' }} title={t('translations.customizedTitle')}>
            {t('translations.customized')}
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
        {override && canWrite && (
          <button
            type="button"
            className="btn ghost"
            disabled={save.isPending || reset.isPending}
            style={{ marginTop: 'var(--ws-space-1)', fontSize: 'var(--ws-font-size-sm)', padding: '2px 8px' }}
            onClick={() => setConfirmReset(true)}
          >
            ↺ {t('translations.resetBase')}
          </button>
        )}
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <div className="stack" style={{ gap: 'var(--ws-space-1)' }}>
          {canWrite && (
            <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty}>
              {save.isPending ? t('translations.saving') : t('translations.save')}
            </Button>
          )}
          {dirty && (
            <Button variant="ghost" disabled={save.isPending} onClick={() => setValue(effective)}>
              {t('translations.discard')}
            </Button>
          )}
          {saved && !error && <span className="muted">{t('translations.saved')}</span>}
          {error && <span style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</span>}
        </div>
      </td>
      <ConfirmDialog
        open={confirmReset}
        title={t('translations.resetTitle')}
        confirmLabel={t('translations.reset')}
        danger
        onConfirm={() => {
          setConfirmReset(false);
          reset.mutate();
        }}
        onCancel={() => setConfirmReset(false)}
      >
        {t('translations.resetConfirmBefore')}<strong>{rowKey}</strong>{t('translations.resetConfirmAfter', { locale })}
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
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canWrite = useAuthStore((s) => s.hasPermission)('translation.write');

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
    onError: (e) => setError(e instanceof Error ? e.message : t('translations.saveError')),
  });

  function submit() {
    if (!trimmedKey) {
      setError(t('translations.keyRequired'));
      return;
    }
    if (value.trim() === '') {
      setError(t('translations.valueRequired'));
      return;
    }
    setError(null);
    create.mutate();
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{t('translations.newKeyIn', { locale: localeLabel, code: locale })}</h3>
      <p className="muted" style={{ margin: 0 }}>
        {alreadyExists ? t('translations.keyExists') : t('translations.createKey')}
      </p>
      <div style={{ marginTop: 'var(--ws-space-3)' }}>
        <TextField label={t('translations.key')} value={key} onChange={(e) => setKey(e.target.value)} placeholder="nav.home, common.save…" />
      </div>
      <div style={{ marginTop: 'var(--ws-space-2)' }}>
        <TextField label={t('translations.value')} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('translations.translatedText')} />
      </div>
      {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        {canWrite && (
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? t('translations.saving') : alreadyExists ? t('translations.updateKey') : t('translations.addKey')}
          </Button>
        )}
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
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canWrite = useAuthStore((s) => s.hasPermission)('translation.write');

  const create = useMutation({
    mutationFn: () =>
      api.post<TranslationRow>('/api/v1/translations', {
        locale: code.trim(),
        namespace: 'translation',
        key: key.trim(),
        value,
      }),
    onSuccess: () => onCreated(code.trim()),
    onError: (e) => setError(e instanceof Error ? e.message : t('translations.createLocaleError')),
  });

  function submit() {
    if (!code.trim()) {
      setError(t('translations.localeCodeRequired'));
      return;
    }
    if (existingCodes.has(code.trim())) {
      setError(t('translations.localeExists'));
      return;
    }
    if (!key.trim() || value.trim() === '') {
      setError(t('translations.firstKeyRequired'));
      return;
    }
    setError(null);
    create.mutate();
  }

  return (
    <Card>
      <h2 style={{ marginTop: 0 }}>{t('translations.addLocaleTitle')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('translations.addLocaleHint')}
      </p>
      <div style={{ marginTop: 'var(--ws-space-4)' }}>
        <TextField label={t('translations.localeCode')} value={code} onChange={(e) => setCode(e.target.value)} placeholder="fr, de, it…" />
      </div>
      <div style={{ marginTop: 'var(--ws-space-2)' }}>
        <TextField label={t('translations.firstKey')} value={key} onChange={(e) => setKey(e.target.value)} placeholder="nav.home, common.save…" />
      </div>
      <div style={{ marginTop: 'var(--ws-space-2)' }}>
        <TextField label={t('translations.value')} value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('translations.translatedText')} />
      </div>
      {error && <p style={{ color: 'var(--ws-danger, #dc2626)' }}>{error}</p>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
        {canWrite && (
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? t('translations.creating') : t('translations.createLocale')}
          </Button>
        )}
      </div>
    </Card>
  );
}
