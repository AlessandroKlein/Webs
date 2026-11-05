import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useAuthStore } from '../../lib/auth-store';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
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
  ACTUATOR_ROLES,
  INVERNADERO_BASE,
  METRIC_DEFS,
  formatMetricValue,
  normalizeStatus,
  type ActuatorRole,
} from './invernadero';
import { DeviceEventsCard } from '../iot/DeviceEventsCard';
import { DeviceConfigPanel } from '../iot/DeviceConfigPanel';

const BASE_CHART_METRICS = ['temperature', 'humidity', 'soil_moisture', 'tank_level', 'light'];

interface MetricCard {
  key: string;
  label: string;
  value: string;
  icon: string;
  tone?: 'success' | 'danger' | 'neutral';
}

function booleanLabel(value: boolean): string {
  return value ? 'ON' : 'OFF';
}

/**
 * Dashboard por dispositivo del plugin invernadero: estado en vivo, gráficos de
 * serie temporal, alarmas (severidad ≥ 2) y control de actuadores.
 */
export function InvernaderoDashboard({
  device,
  basePath = INVERNADERO_BASE,
}: {
  device: IotDevice;
  basePath?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canWrite = useAuthStore((s) => s.hasPermission)('iot.write');

  const [metric, setMetric] = useState('temperature');
  const [range, setRange] = useState<SeriesRange>('24h');
  const [agg, setAgg] = useState<Aggregation>('avg');
  const [outputs, setOutputs] = useState<Record<string, number>>({});

  const statusQuery = useQuery({
    queryKey: ['invernadero-status', device.id],
    queryFn: () =>
      api.get<{ device: unknown; status: unknown }>(
        `${basePath.replace(/\/+$/, '')}/devices/${device.id}/status`,
      ),
    refetchInterval: 30000,
    retry: 1,
  });

  const status = useMemo(() => normalizeStatus(statusQuery.data?.status), [statusQuery.data]);

  const { from, to } = useMemo(() => rangeWindow(range, new Date()), [range]);
  const seriesQuery = useQuery({
    queryKey: ['invernadero-series', device.id, metric, range, agg],
    queryFn: () =>
      fetchSeries(basePath, device.id, { metric, from, to, agg }),
    enabled: Boolean(device.id),
  });

  const apply = useMutation({
    mutationFn: ({ role, output }: { role: ActuatorRole; output: number }) =>
      api.post(`${basePath.replace(/\/+$/, '')}/devices/${device.id}/actuators`, { role, output }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['invernadero-status', device.id] });
    },
  });

  const chartMetrics = useMemo(() => {
    const zones = Object.keys(status.metrics).filter((k) => k.startsWith('soil_moisture_'));
    const list = [...BASE_CHART_METRICS, ...zones];
    if (status.alarms.length > 0) list.push('alarms');
    return [...new Set(list)];
  }, [status]);

  const metricLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of Object.keys(METRIC_DEFS)) {
      const def = METRIC_DEFS[m];
      if (def) map[m] = t(def.labelKey);
    }
    for (const z of Object.keys(status.metrics).filter((k) => k.startsWith('soil_moisture_'))) {
      map[z] = `${t('iot.metric.soilMoisture')} · ${z.slice('soil_moisture_'.length)}`;
    }
    return map;
  }, [status.metrics, t]);

  const cards = useMemo<MetricCard[]>(() => {
    const list: MetricCard[] = [];
    for (const m of BASE_CHART_METRICS) {
      const value = status.metrics[m];
      const def = METRIC_DEFS[m];
      if (value !== undefined && def) {
        list.push({
          key: m,
          label: t(def.labelKey),
          value: formatMetricValue(m, value),
          icon: def.icon,
        });
      }
    }
    for (const z of Object.keys(status.metrics).filter((k) => k.startsWith('soil_moisture_'))) {
      const value = status.metrics[z];
      const def = METRIC_DEFS.soil_moisture;
      if (value !== undefined && def) {
        list.push({
          key: z,
          label: `${t('iot.metric.soilMoisture')} · ${z.slice('soil_moisture_'.length)}`,
          value: formatMetricValue('soil_moisture', value),
          icon: def.icon,
        });
      }
    }
    if (status.booleans.pump !== undefined) {
      const on = status.booleans.pump;
      list.push({
        key: 'pump',
        label: t('invernadero.pump'),
        value: booleanLabel(on),
        icon: 'bi-droplet',
        tone: on ? 'success' : 'neutral',
      });
    }
    if (status.booleans.fan !== undefined) {
      const on = status.booleans.fan;
      list.push({
        key: 'fan',
        label: t('invernadero.fan'),
        value: booleanLabel(on),
        icon: 'bi-wind',
        tone: on ? 'success' : 'neutral',
      });
    }
    return list;
  }, [status, t]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Card.Header>
          <Card.Title className="flex flex-wrap items-center gap-2">
            {device.name}
            <Badge variant="neutral">{t('iot.kind.invernadero')}</Badge>
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
          title={t('invernadero.statusError')}
          description={t('invernadero.statusErrorHint')}
        />
      ) : (
        <>
          <div className="grid grid-2 gap-3">
            {cards.map((c) => (
              <div key={c.key} className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
                <i className={`bi ${c.icon} text-lg text-primary`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-muted">{c.label}</div>
                  <div
                    className={`font-mono text-lg font-semibold ${
                      c.tone === 'success' ? 'text-success' : c.tone === 'danger' ? 'text-danger' : 'text-text'
                    }`}
                  >
                    {c.value}
                  </div>
                </div>
              </div>
            ))}
            {cards.length === 0 && (
              <div className="col-span-full">
                <EmptyState icon="bi-reception-0" title={t('invernadero.noMetrics')} />
              </div>
            )}
          </div>

          <DeviceEventsCard basePath={basePath} deviceId={device.id} />
          <DeviceConfigPanel basePath={basePath} deviceId={device.id} />
        </>
      )}

      <Card>
        <Card.Header>
          <Card.Title>{t('invernadero.series')}</Card.Title>
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

      {canWrite && (
        <Card>
          <Card.Header>
            <Card.Title>{t('invernadero.actuators')}</Card.Title>
            <Card.Description>{t('invernadero.actuatorsHint')}</Card.Description>
          </Card.Header>
          <Card.Content>
            <div className="flex flex-col gap-2">
              {ACTUATOR_ROLES.map((role) => {
                const value = outputs[role] ?? 0;
                return (
                  <div key={role} className="flex flex-wrap items-center gap-3">
                    <span className="w-28 text-sm text-muted">{t(`invernadero.actuator.${role}`)}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={value}
                      onChange={(e) => setOutputs((o) => ({ ...o, [role]: Number(e.target.value) }))}
                      className="min-w-0 flex-1"
                      aria-label={t(`invernadero.actuator.${role}`)}
                    />
                    <span className="w-10 font-mono text-sm">{value}%</span>
                    <Button
                      size="sm"
                      loading={apply.isPending}
                      onClick={() => apply.mutate({ role, output: value })}
                    >
                      {t('common.apply')}
                    </Button>
                  </div>
                );
              })}
            </div>
            {apply.isError && (
              <p className="mt-2 text-sm text-danger" role="alert">
                {t('invernadero.actuatorError')}
              </p>
            )}
          </Card.Content>
        </Card>
      )}
    </div>
  );
}
