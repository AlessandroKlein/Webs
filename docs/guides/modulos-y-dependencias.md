# Módulos y dependencias

Catálogo de bloques y qué habilita cada uno. Al activar un bloque, si depende de
otro, la app lo recomienda en el diálogo de instalación.

## Bloques disponibles (v1.1.0)

| Bloque | Función | Depende de |
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
  bloque `media`/storage (núcleo) en conjunto.
- **Tienda/ecommerce** + **carrito** se integran con las pasarelas de pago
  (`mercadopago`, `stripe`, `paypal`, etc.).

## Cómo se detectan las dependencias

Cada `block.json` declara `blockDependencies` (ids de bloques). Al instalar:

- `POST /blocks/install` con `autoDependencies: true` (por defecto) **instala
  automáticamente** las dependencias que falten (recursivo).
- Con `autoDependencies: false`, devuelve `missingDependencies` para que el
  frontend muestre un **diálogo de confirmación** antes de instalar.

Ejemplo: instalar `ecommerce` instala también `mercadopago`; instalar `reservas`
instala `notificaciones`.

