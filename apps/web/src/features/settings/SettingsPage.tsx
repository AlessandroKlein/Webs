import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JsonSchema } from '@webs/plugin-sdk';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { SchemaForm } from '../../components/ui/SchemaForm';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface SettingsSection {
  key: string;
  group: string;
  schema: JsonSchema;
  defaults: Record<string, unknown>;
  value: Record<string, unknown>;
}

export function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SettingsSection[]>('/api/v1/settings'),
  });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put(`/api/v1/settings/${key}`, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('nav.settings')}</h1>
      {data?.map((section) => (
        <SettingsSectionCard
          key={section.key}
          section={section}
          saving={save.isPending}
          onSave={(value) => save.mutate({ key: section.key, value })}
        />
      ))}
    </div>
  );
}

function SettingsSectionCard({
  section,
  onSave,
  saving,
}: {
  section: SettingsSection;
  onSave: (value: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<Record<string, unknown>>(section.value);

  return (
    <Card>
      <h3 style={{ marginBottom: 'var(--ws-space-4)' }}>{section.schema.title ?? section.key}</h3>
      <SchemaForm schema={section.schema} value={value} onChange={setValue} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button onClick={() => onSave(value)} disabled={saving}>
          {t('common.save')}
        </Button>
      </div>
    </Card>
  );
}
