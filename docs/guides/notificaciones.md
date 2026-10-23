# Notificaciones (SMS/WhatsApp/Push)

## Núcleo (registro de proveedores)

| Endpoint | Descripción |
| -------- | ----------- |
| `GET /notifications/providers` | Lista los proveedores registrados (y sus canales). |
| `POST /notifications/send` | Envía una notificación `{ provider, to, message, channel? }`. |

El envío exitoso emite el evento `notification.sent` (automatizaciones/auditoría).

## Plugin Twilio (SMS/WhatsApp)

`plugins/twilio` registra el proveedor `twilio` con canales `sms` y `whatsapp`.
Configurá en **Plugins → Twilio**: `accountSid`, `authToken` (cifrado), `fromNumber`
(SMS) y `whatsappFrom` (WhatsApp).

```bash
curl -X POST /api/v1/notifications/send \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"provider":"twilio","to":"+5491100000000","message":"Tu código es 123456","channel":"sms"}'
```

## Contrato (SDK)

Un plugin de notificación registra un `NotificationProviderAdapter`:

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

## 2FA por SMS (OTP)

El plugin Twilio habilita **2FA por SMS**: en **Mi cuenta → 2FA por SMS** se
configura el teléfono (se envía un OTP y se verifica). Al iniciar sesión, si el
SMS 2FA está activo, se envía el código y se valida con `smsCode`.
