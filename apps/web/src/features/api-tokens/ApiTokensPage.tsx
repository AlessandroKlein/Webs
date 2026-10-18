import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { TextField } from '../../components/ui/TextField';

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

export function ApiTokensPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<ApiTokenRow[]>('/api/v1/api-tokens'),
  });
  const { data: permissions } = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<PermissionItem[]>('/api/v1/permissions'),
  });

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [rateLimit, setRateLimit] = useState('');
  const [created, setCreated] = useState<CreatedToken | null>(null);
  const [copied, setCopied] = useState(false);
  const myPermissions = useAuthStore((s) => s.permissions);

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
      <h1>API Tokens</h1>
      <p className="muted">
        Los tokens de API (JWT) permiten que aplicaciones, scripts o integraciones accedan a la API
        REST con permisos limitados. Guardalos de forma segura: solo se muestran una vez.
      </p>

      {created && (
        <Card style={{ borderColor: 'var(--ws-warning)' }}>
          <h3>Token creado — copialo ahora</h3>
          <p className="muted">No volverá a mostrarse.</p>
          <div className="row">
            <code style={{ flex: 1, wordBreak: 'break-all', background: 'var(--ws-surface-2)', padding: 'var(--ws-space-2)', borderRadius: 'var(--ws-radius-md)' }}>
              {created.token}
            </code>
            <Button variant="secondary" onClick={copy}>
              {copied ? 'Copiado ✓' : 'Copiar'}
            </Button>
          </div>
          <Button variant="ghost" onClick={() => setCreated(null)} style={{ marginTop: 'var(--ws-space-3)' }}>
            Cerrar
          </Button>
        </Card>
      )}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card>
          <h3>Crear token</h3>
          <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} placeholder="App móvil, integración…" />

          <div className="field">
            <label>Permisos (scopes)</label>
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
            <label>Caducidad</label>
            <select className="input" value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)}>
              <option value="">Sin caducidad</option>
              <option value="30">30 días</option>
              <option value="90">90 días</option>
              <option value="365">1 año</option>
            </select>
          </div>

          <TextField label="Límite de peticiones/minuto (opcional)" type="number" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} placeholder="Sin límite" />

          <Button onClick={() => create.mutate()} disabled={create.isPending || !name}>
            Crear token
          </Button>
        </Card>

        <Card>
          <h3>Tokens</h3>
          <div className="stack">
            {(data ?? []).map((t) => (
              <div key={t.id} className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--ws-border)', paddingTop: 'var(--ws-space-2)' }}>
                <div>
                  <strong>{t.name}</strong>
                  <div>
                    <span className="muted">{t.scopes.length} permisos</span>
                    {t.rateLimit && <span className="muted"> · {t.rateLimit} req/min</span>}
                    {t.expiresAt && <span className="muted"> · vence {new Date(t.expiresAt).toLocaleDateString()}</span>}
                    {t.lastUsedAt && <span className="muted"> · usado {new Date(t.lastUsedAt).toLocaleString()}</span>}
                    <span className="muted"> · {t.requestCount} peticiones</span>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => revoke.mutate(t.id)}>
                  Revocar
                </Button>
              </div>
            ))}
            {(data ?? []).length === 0 && <p className="muted">No hay tokens.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
