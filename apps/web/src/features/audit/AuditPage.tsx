import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
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
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<Page<AuditRow>>('/api/v1/audit'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('nav.audit')}</h1>
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
      </Card>
    </div>
  );
}
