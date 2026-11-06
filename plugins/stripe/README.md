# Stripe

Pagos con tarjeta vía Stripe.

## Metadatos

| Campo | Valor |
|-------|-------|
| id | `stripe` |
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

Opciones: `publishableKey`, `secretKey`, `webhookSecret`, `primaryColor`.

## Variables de entorno (checkout real / mock)

| Var | Uso |
|-----|-----|
| `STRIPE_MODE=mock` | Checkout simulado: no llama a la API, devuelve `https://sandbox.stripe.com/mock/<id>` |
| `STRIPE_SECRET_KEY` | Secret key si no está en la config del plugin |
| `STRIPE_WEBHOOK_SECRET` | Secreto para validar `stripe-signature` (si no está, el webhook NO verifica firma) |
| `PUBLIC_BASE_URL` | Base pública para `success_url`/`cancel_url` |

Webhook real: `POST /api/v1/payments/webhook/stripe` (webhook genérico del núcleo).

### Probar en Docker (mock, sin credenciales)

```bash
# levantar api con STRIPE_MODE=mock y hacer checkout
curl -s localhost:4000/api/v1/payments/checkout \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' \
  -d '{"provider":"stripe","amount":1000,"currency":"ARS","items":[{"id":"lic","title":"Licencia","quantity":1,"unitPrice":1000}]}'
# → "paymentUrl":"https://sandbox.stripe.com/mock/cs_..."
```

