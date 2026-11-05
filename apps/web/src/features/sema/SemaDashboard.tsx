import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { TimeSeriesChart } from '../iot/TimeSeriesChart';
import {
  fetchSeries,
  rangeWindow,
  type Aggregation,
  type IotDevice,
  type SeriesRange,
} from '../iot/iot-api';
import {
  SEMA_BASE,
  SEMA_METRIC_DEFS,
  formatSemaMetricValue,
  normalizeSemaStatus,
} from './sema';
import { DeviceEventsCard } from '../iot/DeviceEventsCard';

const BASE_CHART_METRICS = ['temperature_ext', 'temperature_int', 'humidity', 'energy'];

interface MetricCard {
  key: string;
  label: string;
  value: string;
  icon: string;
}

/**
 * Dashboard por dispositivo del plugin sema: estado en vivo (temperatura EXT/INT,
 * humedad, energía, estado del sistema), alarmas y gráficos de serie temporal.
 * Sin control de actuadores (SEMA v1 es solo monitoreo).
 */
export function SemaDashboard({
  device,
  basePath = SEMA_BASE,
}: {
  device: IotDevice;
  basePath?: string;
}) {
  const { t } = useTranslation();

  const [metric, setMetric] = useState('temperature_ext');
  const [range, setRange] = useState<SeriesRange>('24h');
  const [agg, setAgg] = useState<Aggregation>('avg');

  const statusQuery = useQuery({
    queryKey: ['sema-status', device.id],
    queryFn: () =>
      api.get<{ device: unknown; status: unknown }>(
        `${basePath.replace(/\/+$/, '')}/devices/${device.id}/status`,
      ),
    refetchInterval: 30000,
    retry: 1,
  });

  const status = useMemo(() => normalizeSemaStatus(statusQuery.data?.status), [statusQuery.data]);

  const { from, to } = useMemo(() => rangeWindow(range, new Date()), [range]);
  const seriesQuery = useQuery({
    queryKey: ['sema-series', device.id, metric, range, agg],
    queryFn: () => fetchSeries(basePath, device.id, { metric, from, to, agg }),
    enabled: Boolean(device.id),
  });

  const chartMetrics = useMemo(() => {
    const list = [...BASE_CHART_METRICS];
    if (status.metrics.alarms !== undefined) list.push('alarms');
    return list;
  }, [status]);

  const metricLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of Object.keys(SEMA_METRIC_DEFS)) {
      const def = SEMA_METRIC_DEFS[m];
      if (def) map[m] = t(def.labelKey);
    }
    return map;
  }, [t]);

  const cards = useMemo<MetricCard[]>(() => {
    const list: MetricCard[] = [];
    for (const m of BASE_CHART_METRICS) {
      const value = status.metrics[m];
      const def = SEMA_METRIC_DEFS[m];
      if (value !== undefined && def) {
        list.push({ key: m, label: t(def.labelKey), value: formatSemaMetricValue(m, value), icon: def.icon });
      }
    }
    return list;
  }, [status, t]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Card.Header>
          <Card.Title className="flex flex-wrap items-center gap-2">
            {device.name}
            <Badge variant="neutral">{t('iot.kind.sema')}</Badge>
            {statusQuery.isFetching && <Spinner size="sm" />}
          </Card.Title>
          <Card.Description>
            {device.baseUrl} · {t('iot.lastSeen')}:{' '}
            {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : t('common.never')}
          </Card.Description>
        </Card.Header>
      </Card>

      {statusQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner label={t('common.loading')} />
        </div>
      ) : statusQuery.isError ? (
        <EmptyState
          icon="bi-wifi-off"
          title={t('sema.statusError')}
          description={t('sema.statusErrorHint')}
        />
      ) : (
        <>
          <div className="grid grid-2 gap-3">
            {cards.map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
                <i className={`bi ${c.icon} text-lg text-primary`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted">{c.label}</div>
                  <div className="font-mono text-lg font-semibold text-text">{c.value}</div>
                </div>
              </div>
            ))}
            {status.system && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
                <i className="bi bi-hdd-stack text-lg text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted">{t('sema.systemState')}</div>
                  <div className="font-mono text-lg font-semibold text-text">{status.system}</div>
                </div>
              </div>
            )}
            {cards.length === 0 && !status.system && (
              <div className="col-span-full">
                <EmptyState icon="bi-reception-0" title={t('sema.noMetrics')} />
              </div>
            )}
          </div>

          <DeviceEventsCard basePath={basePath} deviceId={device.id} valueIsScaled />
        </>
      )}

      <Card>
        <Card.Header>
          <Card.Title>{t('sema.series')}</Card.Title>
        </Card.Header>
        <Card.Content>
          <TimeSeriesChart
            data={seriesQuery.data ?? []}
            loading={seriesQuery.isLoading}
            metric={metric}
            metrics={chartMetrics}
            metricLabels={metricLabels}
            onMetricChange={(m) => setMetric(m)}
            range={range}
            onRangeChange={(r) => setRange(r)}
            agg={agg}
            onAggChange={(a) => setAgg(a)}
          />
        </Card.Content>
      </Card>
    </div>
  );
}
