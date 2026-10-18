import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface TranslationRow {
  id: string;
  locale: string;
  namespace: string;
  key: string;
  value: string;
}

export function TranslationsPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['translations'],
    queryFn: () => api.get<{ items: TranslationRow[] }>('/api/v1/translations'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('nav.translations')}</h1>
      <Card>
        <p className="muted">
          Las traducciones definidas aquí sobrescriben los recursos base. Los bloques pueden aportar
          sus propias claves.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Locale</th>
              <th>Clave</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((tr) => (
              <tr key={tr.id}>
                <td>{tr.locale}</td>
                <td>
                  <code>{tr.key}</code>
                </td>
                <td>{tr.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
