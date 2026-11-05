import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Spinner } from '../../components/ui/Spinner';
import { formatDate } from '../../lib/format';
import { fetchEvents, severityTone, type DeviceEvent } from './iot-api';

type Filter = 'all' | 'alarm' | 'event';

function eventText(e: DeviceEvent): string {
  return e.message ?? e.rule ?? e.type ?? e.source ?? '';
}

function formatScaledValue(value: number | null | undefined, scaled: boolean): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return scaled ? (value / 100).toFixed(2) : String(value);
}

/**
 * Tarjeta "Eventos y alarmas" alimentada por GET /devices/:id/events (task-20).
 * Muestra `receivedAt`; `tsRaw` (uptime ms en SEMA / epoch s en Invernadero) no se usa.
 */
export function DeviceEventsCard({
  basePath,
  deviceId,
  valueIsScaled = false,
}: {
  basePath: string;
  deviceId: string;
  /** SEMA: `value` de alarmas por regla viene ×100 (4150 = 41,50). */
  valueIsScaled?: boolean;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');

  const eventsQuery = useQuery({
    queryKey: ['iot-events', basePath, deviceId],
    queryFn: () => fetchEvents(basePath, deviceId, { limit: 100 }),
    refetchInterval: 30000,
    retry: 1,
  });

  const events = useMemo(() => {
    const all = eventsQuery.data ?? [];
    const filtered = filter === 'all' ? all : all.filter((e) => e.kind === filter);
    return filtered.slice(0, 20);
  }, [eventsQuery.data, filter]);

  return (
    <Card>
      <Card.Header>
        <Card.Title className="flex flex-wrap items-center gap-2">
          <i className="bi bi-exclamation-triangle text-danger" aria-hidden="true" />
          {t('iot.events.title')}
          {eventsQuery.isFetching && <Spinner size="sm" />}
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <div className="flex flex-col gap-3">
          <SegmentedControl
            ariaLabel={t('iot.events.filter')}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
            options={[
              { value: 'all', label: t('iot.events.filterAll') },
              { value: 'alarm', label: t('iot.events.filterAlarm') },
              { value: 'event', label: t('iot.events.filterEvent') },
            ]}
          />
          {eventsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : events.length === 0 ? (
            <EmptyState icon="bi-bell-slash" title={t('iot.events.empty')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={severityTone(e.severity)}>{e.severity ?? '—'}</Badge>
                  <span className="min-w-0 flex-1 truncate text-muted" title={eventText(e)}>
                    {eventText(e) || t('iot.events.unnamed')}
                  </span>
                  {formatScaledValue(e.value, valueIsScaled) !== null && (
                    <span
                      className="font-mono text-xs text-muted"
                      title={valueIsScaled ? t('iot.events.valueScaledHint') : undefined}
                    >
                      {formatScaledValue(e.value, valueIsScaled)}
                    </span>
                  )}
                  <span className="text-xs text-muted">{formatDate(e.receivedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
