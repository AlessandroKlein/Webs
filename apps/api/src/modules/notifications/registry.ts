import type { NotificationProviderAdapter } from '@webs/plugin-sdk';

/** Registro central de proveedores de notificaciones (SMS/WhatsApp/Push). */
const providers = new Map<string, NotificationProviderAdapter>();

export function registerNotificationProvider(adapter: NotificationProviderAdapter): void {
  providers.set(adapter.id, adapter);
}

export function getNotificationProvider(id: string): NotificationProviderAdapter | undefined {
  return providers.get(id);
}

export function listNotificationProviders(): Array<{ id: string; displayName: string; channels: string[] }> {
  return [...providers.values()].map((p) => ({ id: p.id, displayName: p.displayName, channels: p.channels }));
}
