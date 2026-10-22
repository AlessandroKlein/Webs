# Módulos y dependencias

Catálogo de plugins y qué habilita cada uno. Al activar un plugin, si depende de
otro, la app lo recomienda en el diálogo de instalación.

## Plugins disponibles (v1.1.0)

| Plugin | Función | Depende de |
| ------ | ------- | ---------- |
| `notificaciones` | Centro de notificaciones en-app (campana + marcar leída) | — |
| `chat` | Chat en tiempo real (WebSocket) | `@fastify/websocket` (núcleo) |
| `chat-ia` | Chat con IA (endpoint configurable + API key) | proveedor IA externo (OpenAI-compatible) |
| `calendario` | Calendario de turnos/actividades | — |
| `social` | Mini red social (posts, multimedia, likes) | `media` (para subir archivos) |
| `blog` | Blog completo (posts, categorías, etiquetas) | — |
| `ecommerce` | Tienda (productos, pedidos, envíos, dashboard) | `mercadopago`/pagos (checkout) |
| `reservas` | Reservas (restaurante, doctor, gimnasio) | `notificaciones` (recordatorios) |
| `carrito` | Carrito + checkout | pagos (pasarelas) |
| `facturacion` | Facturas de referencia | `ecommerce` (pedidos) |
| `comments` | Comentarios y valoraciones | — |
| `search` | Búsqueda fuzzy | — |
| `marketing` | Cupones y promociones | `ecommerce` |
| `seo` | Sitemap/robots/meta | — |
| `analytics` | Visitas y métricas | — |
| `support` | Tickets de soporte | — |
| `push` | Notificaciones push web | `notificaciones` |
| `mapa` | Mapa/contacto | — |

## Dependencias clave

- **Chat en tiempo real** usa `@fastify/websocket` (ya en el núcleo): no requiere
  nada extra, pero para escalar a múltiples instancias se recomienda Redis pub/sub.
- **Chat IA** requiere un endpoint OpenAI-compatible (URL + API key) en sus ajustes;
  sin él devuelve un mensaje de configuración.
- **Red social** (`social`) guarda URLs de media; para subir archivos reales usá el
  plugin `media`/storage (núcleo) en conjunto.
- **Tienda/ecommerce** + **carrito** se integran con las pasarelas de pago
  (`mercadopago`, `stripe`, `paypal`, etc.).

## Cómo se detectan las dependencias

Dos mecanismos:

1. **`blockDependencies`** (ids fijos): se instalan automáticamente.
2. **`provides` / `requiresProviders`** (grupos): el plugin declara qué grupo de
   proveedores necesita y el sistema muestra un **selector** para que el usuario
   elija cuál(es) instalar.

Ejemplo: `ecommerce` y `carrito` declaran `requiresProviders: ["payment"]`. Los
plugins `mercadopago`, `modo`, `payway`, `stripe`, `paypal`, `ebanx`, `pos`
declaran `provides: ["payment"]`. Al instalar `ecommerce`, aparece un selector con
esos métodos y el usuario elige uno o varios.

- `GET /plugins/providers/:group` lista los proveedores de un grupo.
- `POST /plugins/install` con `providers: { payment: ["stripe", "paypal"] }`
  instala el plugin y los proveedores elegidos.
- Sin `providers`, si falta un grupo requerido, devuelve `needsProviderSelection`
  con las opciones para mostrar el diálogo.


