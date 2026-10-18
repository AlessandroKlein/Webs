import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import type { Page } from '@webs/core';

interface ContentRow {
  id: string;
  type: string;
  slug: string;
  status: string;
  updatedAt: string;
}

export function ContentPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['content'],
    queryFn: () => api.get<Page<ContentRow>>('/api/v1/content'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('nav.content')}</h1>
      <Card>
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Slug</th>
              <th>Estado</th>
              <th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.type}</td>
                <td>
                  <code>{c.slug}</code>
                </td>
                <td>
                  <span className="badge">{c.status}</span>
                </td>
                <td>{new Date(c.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
