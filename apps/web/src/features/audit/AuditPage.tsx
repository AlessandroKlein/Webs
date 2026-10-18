import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, downloadFile } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import type { Page } from '@webs/core';

interface AuditRow {
  id: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ip: string | null;
  actor: { id: string; email: string; displayName: string | null } | null;
  createdAt: string;
}

export function AuditPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState('');
  const [resource, setResource] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return api.get<Page<AuditRow>>(`/api/v1/audit${suffix}`);
    },
  });

  const apply = () =>
    setFilters({
      action,
      resource,
      actorId,
      from: from ? new Date(from).toISOString() : '',
      to: to ? new Date(to).toISOString() : '',
    });

  const exportCsv = () => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    void downloadFile(`/api/v1/audit/export${suffix}`, 'audit-log.csv');
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('nav.audit')}</h1>

      <Card>
        <div className="grid-2" style={{ gap: 'var(--ws-space-2)' }}>
          <TextField label="Acción" value={action} onChange={(e) => setAction(e.target.value)} placeholder="user.create, …" />
          <TextField label="Recurso" value={resource} onChange={(e) => setResource(e.target.value)} placeholder="user, content, …" />
          <TextField label="Actor (id)" value={actorId} onChange={(e) => setActorId(e.target.value)} />
          <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
            <TextField label="Desde" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label="Hasta" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
          <Button onClick={apply}>Filtrar</Button>
          <Button variant="secondary" onClick={exportCsv}>
            Exportar CSV
          </Button>
        </div>
      </Card>

      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Acción</th>
              <th>Recurso</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.createdAt).toLocaleString()}</td>
                <td>
                  <code>{a.action}</code>
                </td>
                <td>
                  {a.resource}
                  {a.resourceId ? ` (${a.resourceId})` : ''}
                </td>
                <td>{a.actor?.email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <p className="muted">Total: {data.total}</p>}
      </Card>
    </div>
  );
}
