import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTheme, type ThemeMode } from '@webs/ui';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';

interface AppearanceValue {
  defaultTheme?: string;
  primaryColor?: string;
  customCss?: string;
}

export function AppearancePage() {
  const { t } = useTranslation();
  const { mode, setMode } = useTheme();
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'appearance'],
    queryFn: () => api.get<{ value: AppearanceValue }>('/api/v1/settings/appearance'),
  });

  const [primaryColor, setPrimaryColor] = useState('#4f46e5');
  const [customCss, setCustomCss] = useState('');

  useEffect(() => {
    if (data?.value?.primaryColor) setPrimaryColor(data.value.primaryColor);
    if (data?.value?.customCss) setCustomCss(data.value.customCss);
  }, [data]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--ws-primary', primaryColor);
    root.style.setProperty('--ws-primary-hover', primaryColor);
  }, [primaryColor]);

  useEffect(() => {
    let style = document.getElementById('custom-css') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'custom-css';
      document.head.appendChild(style);
    }
    style.textContent = customCss;
  }, [customCss]);

  const save = useMutation({
    mutationFn: (value: AppearanceValue) => api.put('/api/v1/settings/appearance', value),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="stack">
      <h1>{t('nav.appearance')}</h1>

      <Card>
        <h3>{t('theme.label')}</h3>
        <select
          className="input"
          style={{ width: 'auto' }}
          value={mode}
          onChange={(e) => setMode(e.target.value as ThemeMode)}
        >
          <option value="light">{t('theme.light')}</option>
          <option value="dark">{t('theme.dark')}</option>
          <option value="system">{t('theme.system')}</option>
        </select>
      </Card>

      <Card>
        <h3>Color primario</h3>
        <div className="row">
          <input
            className="input"
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            style={{ width: 64, padding: 4 }}
          />
          <span className="muted">{primaryColor}</span>
        </div>
      </Card>

      <Card>
        <h3>CSS personalizado</h3>
        <p className="muted">
          El CSS se inyecta en el sitio y puede sobrescribir cualquier token (<code>--ws-*</code>).
        </p>
        <textarea
          className="input"
          rows={12}
          value={customCss}
          onChange={(e) => setCustomCss(e.target.value)}
          placeholder={':root { --ws-primary: #0f766e; }'}
        />
      </Card>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button
          onClick={() => save.mutate({ defaultTheme: mode, primaryColor, customCss })}
          disabled={save.isPending}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
