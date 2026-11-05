import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { DevicesList } from '../iot/DevicesList';
import type { IotDevice } from '../iot/iot-api';
import { SemaDashboard } from './SemaDashboard';
import { SEMA_BASE } from './sema';

/** Página /admin/sema: listado de dispositivos + dashboard del seleccionado. */
export function SemaPage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<IotDevice | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('sema.title')}</h1>
        <p className="text-sm text-muted">{t('sema.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr] md:items-start">
        <Card>
          <Card.Content>
            <DevicesList
              basePath={SEMA_BASE}
              selectedId={selected?.id}
              onSelectDevice={setSelected}
            />
          </Card.Content>
        </Card>

        {selected ? (
          <SemaDashboard device={selected} />
        ) : (
          <Card>
            <Card.Content className="py-12">
              <EmptyState
                icon="bi-hdd-network"
                title={t('sema.selectDevice')}
                description={t('sema.selectDeviceHint')}
              />
            </Card.Content>
          </Card>
        )}
      </div>
    </div>
  );
}
