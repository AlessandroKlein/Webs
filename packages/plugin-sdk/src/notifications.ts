/**
 * Contrato de un proveedor de notificaciones (SMS/WhatsApp/Push). La plataforma
 * expone un registro central (`fastify.notifications.register`) y un endpoint
 * genérico de envío; cada bloque (Twilio, etc.) implementa este adaptador.
 */

export interface NotificationProviderAdapter {
  /** Identificador único (ej. 'twilio'). */
  id: string;
  /** Nombre visible. */
  displayName: string;
  /** Canales soportados (ej. ['sms', 'whatsapp']). */
  channels: string[];
  /** Envía una notificación y devuelve el id/estado en el proveedor. */
  send(input: { to: string; message: string; channel?: string }): Promise<{ id: string; status: string }>;
}
