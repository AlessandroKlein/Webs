import { useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { DeviceConfigForm } from './DeviceConfigForm';
import { deleteDevice, listDevices, type IotDevice } from './iot-api';

function formatSeen(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

/** Fila de listado de un dispositivo IoT (seleccionable para ver su dashboard). */
export function DeviceListItem({
  device,
  onEdit,
  onDelete,
  onSelect,
  selected = false,
}: {
  device: IotDevice;
  onEdit?: () => void;
  onDelete?: () => void;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const { t } = useTranslation();
  const online = device.enabled && device.lastSeenAt !== null;

  function handleKey(e: KeyboardEvent<HTMLLIElement>) {
    if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    <li
      className={`flex flex-wrap items-center gap-3 rounded-md border bg-surface p-3 ${
        selected ? 'border-primary' : 'border-border'
      } ${onSelect ? 'cursor-pointer' : ''}`}
      onClick={onSelect}
      onKeyDown={handleKey}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-text">{device.name}</span>
          <Badge variant="neutral">{t(`iot.kind.${device.kind}`)}</Badge>
          <Badge variant={online ? 'success' : 'danger'}>
            {online ? t('iot.online') : t('iot.offline')}
          </Badge>
          {!device.enabled && <Badge variant="neutral">{t('common.disabled')}</Badge>}
        </div>
        <div className="truncate text-sm text-muted">
          {device.baseUrl} · {t('iot.lastSeen')}:{' '}
          {device.lastSeenAt ? formatSeen(device.lastSeenAt) : t('common.never')}
        </div>
      </div>
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {onEdit && (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <i className="bi bi-pencil" aria-hidden="true" />
            {t('common.edit')}
          </Button>
        )}
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete} aria-label={t('iot.deleteDevice')}>
            <i className="bi bi-trash" aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Listado de dispositivos IoT con alta (modal "crear"), edición, borrado y
 * selección. Consume las rutas compartidas de `@webs/iot`
 * (POST/GET/PATCH/DELETE /devices).
 */
export function DevicesList({
  basePath,
  selectedId,
  onSelectDevice,
  className,
}: {
  basePath: string;
  selectedId?: string;
  onSelectDevice?: (device: IotDevice) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<IotDevice | null>(null);
  const [deleting, setDeleting] = useState<IotDevice | null>(null);

  const devices = useQuery({
    queryKey: ['iot-devices', basePath],
    queryFn: () => listDevices(basePath),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteDevice(basePath, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['iot-devices', basePath] });
      setDeleting(null);
    },
  });

  const dialogOpen = creating || editing !== null;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{t('iot.devices')}</h3>
        <Button onClick={() => setCreating(true)}>
          <i className="bi bi-plus-lg" aria-hidden="true" />
          {t('iot.newDevice')}
        </Button>
      </div>

      {devices.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : devices.data && devices.data.length === 0 ? (
        <EmptyState
          icon="bi-hdd-network"
          title={t('iot.noDevices')}
          description={t('iot.noDevicesHint')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {devices.data?.map((d) => (
            <DeviceListItem
              key={d.id}
              device={d}
              selected={selectedId === d.id}
              onSelect={onSelectDevice ? () => onSelectDevice(d) : undefined}
              onEdit={() => setEditing(d)}
              onDelete={() => setDeleting(d)}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={dialogOpen}
        title={creating ? t('iot.newDevice') : t('iot.editDevice')}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      >
        <DeviceConfigForm
          basePath={basePath}
          device={editing ?? undefined}
          onSaved={(saved) => {
            setCreating(false);
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['iot-devices', basePath] });
            onSelectDevice?.(saved);
          }}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={t('iot.deleteDevice')}
        danger
        confirmLabel={t('common.delete')}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      >
        {deleting ? t('iot.deleteConfirm', { name: deleting.name }) : ''}
      </ConfirmDialog>
    </div>
  );
}
