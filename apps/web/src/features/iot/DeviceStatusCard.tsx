import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import type { DeviceStatus, IotDevice } from './iot-api';

function formatMetric(v: number | { value: number; unit?: string }): string {
  if (typeof v === 'number') return String(v);
  const unit = v.unit ? ` ${v.unit}` : '';
  return `${v.value}${unit}`;
}

function formatSeen(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

/**
 * Tarjeta de estado en vivo de un dispositivo IoT.
 *
 * `status` lo provee el plugin (p. ej. GET /status mapeado al dispositivo); si
 * no está disponible, se deriva "en línea" del `lastSeenAt` del registro.
 */
export function DeviceStatusCard({
  device,
  status,
  loading = false,
  error,
  className,
}: {
  device: IotDevice;
  status?: DeviceStatus;
  loading?: boolean;
  error?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const online = status ? status.online : device.enabled && device.lastSeenAt !== null;
  const lastSeenAt = status?.lastSeenAt ?? device.lastSeenAt;
  const metrics = status?.metrics ? Object.entries(status.metrics) : [];

  return (
    <Card className={className}>
      <Card.Header>
        <div className="flex flex-wrap items-center gap-2">
          <Card.Title>{device.name}</Card.Title>
          <Badge variant="neutral">{t(`iot.kind.${device.kind}`)}</Badge>
          <Badge variant={online ? 'success' : 'danger'}>
            <i className={`bi ${online ? 'bi-wifi' : 'bi-wifi-off'}`} aria-hidden="true" />
            {online ? t('iot.online') : t('iot.offline')}
          </Badge>
        </div>
        <Card.Description>
          {t('iot.lastSeen')}: {lastSeenAt ? formatSeen(lastSeenAt) : t('common.never')}
        </Card.Description>
      </Card.Header>

      <Card.Content>
        {loading ? (
          <Spinner label={t('common.loading')} />
        ) : error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : metrics.length === 0 ? (
          <EmptyState icon="bi-speedometer2" title={t('iot.noMetrics')} />
        ) : (
          <div className="grid-2" role="list">
            {metrics.map(([key, value]) => (
              <div key={key} role="listitem" className="rounded-md bg-surface-2 p-3">
                <div className="text-sm text-muted">{key}</div>
                <div className="font-mono text-lg font-semibold text-text">
                  {formatMetric(value)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
