import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import type { Page } from '@webs/core';

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  system: boolean;
  permissions: string[];
}

export function RolesPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Page<RoleRow>>('/api/v1/roles'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('nav.roles')}</h1>
      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>Clave</th>
              <th>Nombre</th>
              <th>Permisos</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((r) => (
              <tr key={r.id}>
                <td>
                  <code>{r.key}</code>
                  {r.system && <span className="badge" style={{ marginLeft: 8 }}>sistema</span>}
                </td>
                <td>{r.name}</td>
                <td>
                  <span className="muted">{r.permissions.length} permisos</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
