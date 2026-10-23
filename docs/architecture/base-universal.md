# Base universal — de la base + plugins a la app final

> **Objetivo:** explicar cómo Webs pasa de ser una «base» genérica a la **app final** que el
> cliente usa (blog, red social, tienda, gimnasio, logística…), **definiendo la página de inicio**
> como el punto de arranque de esa transformación.

## 1. La idea en una frase

Webs no es *una* app: es una **base universal** (núcleo + plugins) que, al aplicar una
**plantilla** y una **página de inicio**, se convierte en la app concreta que el cliente necesita.
El mismo núcleo sirve para un blog, una red social, una tienda o un gimnasio; lo que cambia es
**qué plugins se instalan** y **qué página se muestra al entrar**.

## 2. Los tres ingredientes

| Ingrediente | Dónde vive | Qué aporta |
|-------------|-----------|------------|
| **Núcleo (base)** | `apps/api` + `apps/web` + `packages/*` | Auth/RBAC, menú, páginas, settings, i18n, multi-tenant, licencias, actualizaciones, slots. Es **idéntico** para todas las apps. |
| **Plugins** | `plugins/*` (41 paquetes) | Dominio de negocio: `blog`, `social`, `ecommerce`, `carrito`, `inventario`, `mercadopago`, `facturacion`, `organizaciones`, `reservas`, `gym`-style `workflows`, `correo`, etc. Se instalan bajo demanda. |
| **Plantilla** | `templates/*.json` (8 presets) | Preset de sitio: qué plugins instalar, settings por defecto, menú y — clave — la **página de inicio**. |

Las plantillas actuales son: `blog`, `corporativo`, `cursos`, `gym`, `logistica`, `market`,
`supermercado`, `tienda`.

## 3. El punto de arranque: la página de inicio

La **página de inicio** es el mecanismo que materializa la transformación:

- `apps/api/prisma/schema.prisma:593-604` define `model Page { slug, title, layout Json, isHome
  Boolean @default(false), … }`. La home es **única** (`isHome`): al guardar una página como home,
  `POST /pages` y `PATCH /pages/:id` desmarcan las demás.
- `GET /public/page/home` y `GET /public/page/:slug` resuelven la home por `isHome` (no por slug
  fijo), de modo que **cada plantilla define su propio inicio**.
- `Page.layout` es la **estructura de secciones + bloques**: una sección (`size: full|half`) con
  `blocks[]`, donde cada bloque es un objeto nativo (`{ type: 'heading'|'text', content, level }`)
  o el `id` de un **plugin** (se monta su `clientEntry`). Ver `templates/tienda.json`.

Ejemplo concreto (tienda): la plantilla instala `ecommerce`, `inventario`, `carrito`,
`mercadopago`, `stripe`, `paypal`, `facturacion`, `marketing`, `analytics`, `social`, `search`,
`support`, y define la home con secciones «Catálogo» y «Pagos». El resultado visible ya **no es
Webs**: es una tienda online.

## 4. Cómo se convierte en cada app final

| App final | Plantilla | Plugins clave | Home típica |
|-----------|-----------|---------------|-------------|
| Blog | `blog.json` | `blog`, `mapa`, `seo`, `search` | Artículos recientes + categorías + contacto |
| Red social | (base + `social` + `chat`) | `social`, `chat`, `comments`, `notificaciones` | Feed social + historias |
| Tienda | `tienda.json` | `ecommerce`, `carrito`, `inventario`, `mercadopago`, `facturacion` | Catálogo + pagos |
| Gimnasio | `gym.json` | `reservas`, `workflows`, `organizaciones`, `suscripciones` | Clases + reservas + membresías |
| Logística | `logistica.json` | `oca`, `andreani`, `inventario`, `mapa`, `documentos` | Seguimiento de envíos + rutas |
| Cursos | `cursos.json` | `academia`, `reservas`, `correo`, `suscripciones` | Catálogo de cursos + inscripción |

En todos los casos el **núcleo es el mismo**: cambian los plugins instalados y el `layout` de la
home. No hay *forks* del núcleo por vertical.

## 5. Reglas de coherencia

1. **El núcleo no conoce el dominio.** Nada en `apps/api/src/modules/*` base asume «tienda» o
   «blog»; todo lo vertical vive en `plugins/*`.
2. **La plantilla es un preset, no código.** Un `template.json` referencia `id`s de plugins ya
   publicados; `applyTemplate` (en `apps/api/src/modules/templates.ts`) instala los plugins y
   aplica `settings`, `menu` y `pages`.
3. **La home es el contrato de entrada.** Toda app final define exactamente una `isHome`; el
   enrutado público resuelve `/` a esa página.
4. **Un plugin se integra nativo al menú** (ADR-0005): no hay categoría «Plugins»; cada plugin
   declara `manifest.menu` y sus ítems aparecen como nativos.
5. **El builder visual (ADR-0011) edita la home** generada por la plantilla, cerrando el ciclo:
   *plantilla → home → edición visual → app final*.

## 6. Flujo de creación de una app

```
1. El cliente elige una plantilla (blog/tienda/gym/...).
2. applyTemplate instala los plugins + settings + menu + pages (con isHome).
3. La home se renderiza desde Page.layout (secciones + bloques nativos + clientEntry de plugins).
4. El cliente personaliza la home y el resto con el builder visual (ADR-0011).
5. El resultado es la app final; el núcleo, los plugins y la home son actualizables en caliente
   (ADR-0010) y licenciables por features (ADR-0007).
```

## Notas

- Relación con ADR-0005 (plugins/menú), ADR-0007 (licencias por features), ADR-0010 (update),
  ADR-0011 (page builder).
- Fuente de verdad de plantillas: `templates/*.json` y `apps/api/src/modules/templates.ts`.
