import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';
import { PageHeader } from '../../components/ui/PageHeader';

interface PermissionItem {
  key: string;
  description: string | null;
}
interface ApiTokenRow {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  rateLimit: number | null;
  requestCount: number;
  createdAt: string;
}
interface CreatedToken extends ApiTokenRow {
  token: string;
}
interface AdminTokenRow extends ApiTokenRow {
  user: { id: string; email: string };
}

export function ApiTokensPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<ApiTokenRow[]>('/api/v1/api-tokens'),
  });
  const { data: permissions } = useQuery({
    queryKey: ['permissions'],
    // ADR-0018: /permissions devuelve catálogo agrupado por defecto; pedimos la
    // variante plana `{ key, description }[]` que esta página consume.
    queryFn: () => api.get<PermissionItem[]>('/api/v1/permissions?format=flat'),
  });

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [rateLimit, setRateLimit] = useState('');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const myPermissions = useAuthStore((s) => s.permissions);
  const isAdmin = myPermissions.includes('apiToken.read');
  const canWrite = useAuthStore((s) => s.hasPermission)('apiToken.write');

  const { data: allTokens } = useQuery({
    queryKey: ['admin-api-tokens'],
    queryFn: () => api.get<AdminTokenRow[]>('/api/v1/admin/api-tokens'),
    enabled: isAdmin,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<CreatedToken>('/api/v1/api-tokens', {
        name,
        scopes,
        expiresInDays: expiresInDays ? Number(expiresInDays) : null,
        rateLimit: rateLimit ? Number(rateLimit) : null,
      }),
    onSuccess: (result) => {
      setCreated(result);
      setName('');
      setScopes([]);
      setExpiresInDays('');
      setRateLimit('');
      qc.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/api-tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  const revokeAny = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/admin/api-tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-api-tokens'] }),
  });

  const toggleScope = (key: string) =>
    setScopes((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const copy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <PageHeader title={t('nav.api')} />
      <p className="muted">
        {t('apiTokens.intro')}
      </p>

      {created && (
        <Card style={{ borderColor: 'var(--ws-warning)' }}>
          <h3>{t('apiTokens.createdTitle')}</h3>
          <p className="muted">{t('apiTokens.createdHint')}</p>
          <div className="row">
            <code style={{ flex: 1, wordBreak: 'break-all', background: 'var(--ws-surface-2)', padding: 'var(--ws-space-2)', borderRadius: 'var(--ws-radius-md)' }}>
              {created.token}
            </code>
            <Button variant="secondary" onClick={copy}>
              {copied ? t('apiTokens.copied') : t('apiTokens.copy')}
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setCreated(null)} style={{ marginTop: 'var(--ws-space-3)' }}>
            {t('apiTokens.close')}
          </Button>
        </Card>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <h3>{t('apiTokens.create')}</h3>
          <TextField label={t('apiTokens.name')} value={name} onChange={(e) => setName(e.target.value)} placeholder="App móvil, integración…" />

          <div className="field">
            <label>{t('apiTokens.scopes')}</label>
            <div className="stack" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {(permissions ?? [])
                .filter((p) => myPermissions.includes(p.key))
                .map((p) => (
                  <label key={p.key} className="row" style={{ gap: 'var(--ws-space-2)' }}>
                    <input type="checkbox" checked={scopes.includes(p.key)} onChange={() => toggleScope(p.key)} />
                    <span>
                      <code>{p.key}</code>
                      {p.description && <span className="muted"> — {p.description}</span>}
                    </span>
                  </label>
                ))}
            </div>
          </div>

          <div className="field">
            <label>{t('apiTokens.expiry')}</label>
            <select className="input" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
              <option value="">{t('apiTokens.noExpiry')}</option>
              <option value="30">{t('apiTokens.days30')}</option>
              <option value="90">{t('apiTokens.days90')}</option>
              <option value="365">{t('apiTokens.year1')}</option>
            </select>
          </div>

          <TextField label={t('apiTokens.rateLimit')} type="number" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} placeholder={t('apiTokens.noLimit')} />

          {canWrite && (
            <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
              {t('apiTokens.create')}
            </Button>
          )}
        </Card>

        <Card>
          <h3>{t('apiTokens.tokens')}</h3>
          <div className="stack">
            {(data ?? []).map((tok) => (
              <div key={tok.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                <div>
                  <strong>{tok.name}</strong>
                  <div>
                    <span className="muted">{tok.scopes.length} {t('apiTokens.permissions')}</span>
                    {tok.rateLimit && <span className="muted"> · {tok.rateLimit} req/min</span>}
                    {tok.expiresAt && <span className="muted"> · {t('apiTokens.expires')} {new Date(tok.expiresAt).toLocaleDateString()}</span>}
                    {tok.lastUsedAt && <span className="muted"> · {t('apiTokens.lastUsed')} {new Date(tok.lastUsedAt).toLocaleString()}</span>}
                    <span className="muted"> · {tok.requestCount} {t('apiTokens.requests')}</span>
                  </div>
                </div>
                {canWrite && (
                  <Button variant="ghost" onClick={() => revoke.mutate(tok.id)}>
                    {t('apiTokens.revoke')}
                  </Button>
                )}
              </div>
            ))}
            {(data ?? []).length === 0 && <p className="muted">{t('apiTokens.noTokens')}</p>}
          </div>
        </Card>
      </div>

      {isAdmin && (
        <Card>
          <h3>{t('apiTokens.allTokens')}</h3>
          <div className="stack">
            {(allTokens ?? []).map((tok) => (
              <div key={tok.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                <div>
                  <strong>{tok.name}</strong> <span className="muted">· {tok.user.email}</span>
                  <div>
                    <span className="muted">{tok.scopes.length} {t('apiTokens.permissions')}</span>
                    {tok.rateLimit && <span className="muted"> · {tok.rateLimit} req/min</span>}
                    {tok.expiresAt && <span className="muted"> · {t('apiTokens.expires')} {new Date(tok.expiresAt).toLocaleDateString()}</span>}
                    {tok.lastUsedAt && <span className="muted"> · {t('apiTokens.lastUsed')} {new Date(tok.lastUsedAt).toLocaleString()}</span>}
                  </div>
                </div>
                {canWrite && (
                  <Button variant="ghost" onClick={() => revokeAny.mutate(tok.id)}>
                    {t('apiTokens.revoke')}
                  </Button>
                )}
              </div>
            ))}
            {(allTokens ?? []).length === 0 && <p className="muted">{t('apiTokens.noOtherTokens')}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
