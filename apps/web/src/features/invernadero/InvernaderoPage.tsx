import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { DevicesList } from '../iot/DevicesList';
import type { IotDevice } from '../iot/iot-api';
import { InvernaderoDashboard } from './InvernaderoDashboard';
import { INVERNADERO_BASE } from './invernadero';

/** Página /admin/invernadero: listado de dispositivos + dashboard del seleccionado. */
export function InvernaderoPage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<IotDevice | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('invernadero.title')}</h1>
        <p className="text-sm text-muted">{t('invernadero.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr] md:items-start">
        <Card>
          <Card.Content>
            <DevicesList
              basePath={INVERNADERO_BASE}
              selectedId={selected?.id}
              onSelectDevice={setSelected}
            />
          </Card.Content>
        </Card>

        {selected ? (
          <InvernaderoDashboard device={selected} />
        ) : (
          <Card>
            <Card.Content className="py-12">
              <EmptyState
                icon="bi-thermometer-sun"
                title={t('invernadero.selectDevice')}
                description={t('invernadero.selectDeviceHint')}
              />
            </Card.Content>
          </Card>
        )}
      </div>
    </div>
  );
}
