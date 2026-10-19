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

  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <Spinner />;

  const sections = data ?? [];
  const active = sections.find((s) => s.key === selected) ?? sections[0];

  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--ws-space-6)' }}>
      <aside className="stack" style={{ minWidth: 220, maxWidth: 220 }}>
        <h1 style={{ fontSize: 'var(--ws-font-size-lg)' }}>{t('nav.settings')}</h1>
        {sections.map((section) => (
          <button
            key={section.key}
            className={`nav-link ${section.key === active?.key ? 'active' : ''}`}
            style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setSelected(section.key)}
          >
            {section.schema.title ?? section.key}
          </button>
        ))}
      </aside>

      <div className="stack" style={{ flex: 1, minWidth: 0 }}>
        {active && (
          <SettingsSectionCard
            key={active.key}
            section={active}
            saving={save.isPending}
            onSave={(value) => save.mutate({ key: active.key, value })}
          />
        )}
      </div>
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
