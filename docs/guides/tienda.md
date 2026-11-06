# Tienda, carrito y pedidos

Cómo funciona la compra de punta a punta en Webs: del catálogo público a la
orden pagada y a la factura.

## Flujo de compra

1. **Catálogo público** — la tienda (`/store`) lee los productos persistidos
   con `GET /api/v1/plugins/ecommerce/products/persisted` (o
   `/api/v1/blocks/ecommerce/...`, shim legacy). El precio y el stock se
   resuelven contra `Product` e `InventoryItem` por talle.
2. **Carrito** — vive en el navegador, en `localStorage` (store zustand
   `checkout-store`). No hay carrito en el servidor: `plugins/carrito` es un
   plugin server-side que **no se usa** en la web.
3. **Checkout** — la ruta `/checkout` (componente `CheckoutPage`) acepta
   `?kind=store` (tienda) o `?kind=subscription` (suscripciones). Flujo:
   - **Completar datos** — si el usuario tiene sesión y le falta teléfono o
     dirección (`!user.phone || !user.address`), pide esos datos y los guarda
     con `PATCH /api/v1/auth/me` (cuerpo `{phone, address}`).
   - **Método de pago** — online (proveedores configurados) o físico
     (efectivo / terminal POS).
4. **Crear orden** — `POST /api/v1/plugins/ecommerce/orders` con
   `{items:[{id,qty,size}], shippingAddress, shippingMethod, shippingCost}`.
   El servidor recalcula precios y arma la orden con `status: 'pending'`,
   `currency: 'ARS'` y el envío guardado como un ítem interno `_shipping`.
5. **Pago aprobado** — cuando el proveedor confirma, el evento
   `payment.approved` dispara el listener del plugin que pasa la orden a
   `status: 'paid'` (idempotente: no pisa una orden ya pagada).
6. **Factura** — el módulo de facturación genera la factura asociada a la
   orden. La orden, el pago, la factura y el envío se cruzan en "Mis compras".

## Mis compras

`GET /api/v1/plugins/ecommerce/my-orders` (autenticado y con tenant). Devuelve
las órdenes del usuario actual con, para cada una, el pago (el primero), la
factura y el envío si existen:

```json
{
  "id": "…", "status": "paid", "total": 45000, "currency": "ARS",
  "createdAt": "…", "items": ["…"],
  "payment": { "id": "…", "status": "approved", "provider": "…", "transactionId": "…", "paidAt": "…" },
  "invoice": { "id": "…", "number": "…", "status": "…" },
  "shipment": { "id": "…", "status": "…", "trackingCode": "…" }
}
```

La vista se monta en el dashboard del usuario ("Mis compras").

> **Límite**: un checkout **invitado** (sin sesión) crea la orden con
> `userId: null`. Esas órdenes quedan en el sistema, pero **no aparecen en
> "Mis compras"**, que filtra por el usuario autenticado.

## Vistos recientemente

La tienda guarda los últimos productos visitados en `localStorage` con la clave
`webs.recentlyViewed` y el dashboard los muestra cruzando los ids contra el
catálogo. Es una señal 100 % local del navegador: no viaja al servidor.

## Envíos y cupones

- `GET /api/v1/plugins/ecommerce/shipping/quotes` — cotizaciones. Sin
  `provider`, o con `all`/`list`, devuelve todas (las locales más las de
  proveedores registrados). Las locales usan `shippingRates` (costo base +
  costo por kg por días).
- `POST /api/v1/plugins/ecommerce/orders/:id/apply-coupon` — aplica un cupón
  activo y vigente (descuento porcentual).

## Límites y estado real

| Tema | Estado |
|------|--------|
| Carrito server-side (`plugins/carrito`) | Sin uso en la web; el carrito es `localStorage` |
| Checkout invitado | Crea la orden, pero no aparece en "Mis compras" |
| `Subscription` | **Muerta** en la práctica: las suscripciones usan `Membership` |
| Cupones | Descuento porcentual; sin cupones por monto fijo ni por usuario |
| Envío | Cotización + ítem `_shipping` dentro de `items`; el modelo `Order` no tiene columna de envío propia |
| Pagos | Online (proveedores) o físico (efectivo/terminal); confirmación vía evento `payment.approved` |
