# Notificaciones (SMS/WhatsApp/Push)

## Núcleo (registro de proveedores)

| Endpoint | Descripción |
| -------- | ----------- |
| `GET /notifications/providers` | Lista los proveedores registrados (y sus canales). |
| `POST /notifications/send` | Envía una notificación `{ provider, to, message, channel? }`. |

El envío exitoso emite el evento `notification.sent` (automatizaciones/auditoría).

## Bloque Twilio (SMS/WhatsApp)

`blocks/twilio` registra el proveedor `twilio` con canales `sms` y `whatsapp`.
Configurá en **Bloques → Twilio**: `accountSid`, `authToken` (cifrado), `fromNumber`
(SMS) y `whatsappFrom` (WhatsApp).

```bash
curl -X POST /api/v1/notifications/send \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"provider":"twilio","to":"+5491100000000","message":"Tu código es 123456","channel":"sms"}'
```

## Contrato (SDK)

Un bloque de notificación registra un `NotificationProviderAdapter`:

```ts
fastify.notifications?.register({
  id: 'twilio',
  displayName: 'Twilio',
  channels: ['sms', 'whatsapp'],
  send: async ({ to, message, channel }) => ({ id, status }),
});
```

> Para **OTP/2FA por SMS**, se puede emitir `notification.sent` y verificar el
> código en el flujo de 2FA (queda como integración futura).
