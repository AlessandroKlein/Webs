import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, downloadFile } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatDate } from '../../lib/format';
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
      <PageHeader title={t('nav.audit')} />

      <Card>
        <div className="grid-2" style={{ gap: 'var(--ws-space-2)' }}>
          <TextField label={t('audit.action')} value={action} onChange={(e) => setAction(e.target.value)} placeholder="user.create, …" />
          <TextField label={t('audit.resource')} value={resource} onChange={(e) => setResource(e.target.value)} placeholder="user, content, …" />
          <TextField label={t('audit.actorId')} value={actorId} onChange={(e) => setActorId(e.target.value)} />
          <div className="row" style={{ gap: 'var(--ws-space-2)' }}>
            <TextField label={t('audit.from')} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextField label={t('audit.to')} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 'var(--ws-space-2)' }}>
          <Button onClick={apply}>{t('audit.filter')}</Button>
          <Button variant="secondary" onClick={exportCsv}>
            {t('audit.exportCsv')}
          </Button>
        </div>
      </Card>

      <Card>
        <table className="table table-striped table-hover">
          <thead>
            <tr>
              <th>{t('audit.date')}</th>
              <th>{t('audit.action')}</th>
              <th>{t('audit.resource')}</th>
              <th>{t('audit.actor')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((a) => (
              <tr key={a.id}>
                <td>{formatDate(a.createdAt)}</td>
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
        {(data?.items ?? []).length === 0 && (
          <EmptyState title={t('audit.empty')} />
        )}
        {data && <p className="muted">{t('audit.total')}: {data.total}</p>}
      </Card>
    </div>
  );
}
