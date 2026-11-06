# Mercado Pago

Pagos con Mercado Pago (plugin de referencia con secretos tokenizados y verificación de webhook).

## Metadatos

| Campo | Valor |
|-------|-------|
| id | `mercadopago` |
| versión | `0.1.0` |
| autor | Webs |
| licencia | MIT |
| categoría | `pagos` |
| apiVersion | `1.0.0` |
| repositorio | https://github.com/AlessandroKlein/Webs |

## Proveedores que ofrece

- `payment`

## Slots

- `payment`

## Configuración

Opciones: `storeName`, `environment`, `publicKey`, `accessToken`, `webhookSecret`, `checkoutMode`, `primaryColor`.

## Variables de entorno (checkout real / mock)

| Var | Uso |
|-----|-----|
| `MP_MODE=mock` | Checkout simulado: no llama a la API, devuelve `https://sandbox.mercadopago.com/mock/<id>` |
| `MP_ACCESS_TOKEN` | Token backend si no está en la config del plugin |
| `MP_WEBHOOK_SECRET` | Secreto para validar `x-signature` (si no está, el webhook NO verifica firma) |
| `PUBLIC_BASE_URL` | Base pública para `back_urls` y `notification_url` |

`notification_url` real = `{PUBLIC_BASE_URL}/api/v1/payments/webhook/mercadopago` (webhook genérico del núcleo).

### Probar en Docker (mock, sin credenciales)

```bash
# levantar api con MP_MODE=mock y hacer checkout
curl -s localhost:4000/api/v1/payments/checkout \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' \
  -d '{"provider":"mercadopago","amount":1000,"currency":"ARS","items":[{"id":"lic","title":"Licencia","quantity":1,"unitPrice":1000}]}'
# → "paymentUrl":"https://sandbox.mercadopago.com/mock/mp_..."
```

