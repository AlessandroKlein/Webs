# ADR-0020: Generador de APIs de acceso rápido + SDK tipado web/móvil

- **Estado:** Aceptado
- **Fecha:** 2026 (versión 2.5.0 del monorepo — Milestone 7)
- **Decisión:** Un recurso definido (nombre + campos + tipos, expresado como **JSON Schema**)
  se persiste como **dato** (tablas `GeneratedResource`/`GeneratedRecord` con filas JSONB) y
  un **único router genérico** bajo `/api/v1/generated/:resource` sirve CRUD, validación y
  permisos en caliente, sin recompilar ni reiniciar. El SDK tipado para `apps/web` y
  `apps/mobile` se genera por **codegen estático exportable** (tipos TS + funciones cliente)
  más un endpoint de **schema en runtime** para render dinámico. El generador es una feature
  premium `generator`, todo nativo y sin dependencias de pago.

## Contexto

La plataforma necesita permitir que un operador (sin tocar el monorepo) defina un recurso
arbitrario — por ejemplo `visitas`, `reservas-mesa` o `campaña` — y obtenga **en caliente**
backend + SDK sin deploy. Hoy cada entidad es un módulo Fastify estático más un modelo
Prisma estático:

- `apps/api/src/app.ts` registra ~30 módulos en build-time bajo `API_PREFIX` (`/api/v1`),
  cada uno un plugin Fastify (`fastify.get/post`, `preHandler: [authenticate, authorize(...)]`,
  `fastify.prisma.<modelo>`). Ver `modules/metrics.ts`, `modules/pages/routes.ts`.
- `apps/api/prisma/schema.prisma` es estático; un modelo nuevo exige `prisma generate` +
  `migrate deploy` + reinicio — incompatible con «en caliente».
- El cliente web (`apps/web/src/lib/api.ts`) es un wrapper `fetch` genérico
  `api.get/post/patch/del<T>(...)` con refresh de token y headers de tenant, pero **sin
  codegen**: los tipos se pasan a mano como genérico `<T>`.
- `apps/mobile` (`@webs/mobile`, Capacitor ^6) es un **host PWA que envuelve `apps/web`**
  (`build:web` = `pnpm --filter @webs/web build`); no tiene cliente API propio. Por tanto,
  «SDK web/móvil» = un único cliente tipado consumido por `apps/web` (y heredado por la PWA
  de `apps/mobile`).

El plugin system ya resuelve «código nuevo sin tocar el core» para funcionalidades
complejas (un plugin en `plugins/` registra sus rutas, settings, permisos y menú). El
generador es la variante **declarativa y sin compilar** para recursos CRUD simples.

## Decisión

### 1. Persistencia del recurso generado: tabla dinámica (JSONB)

Se elige **tabla dinámica** (dos modelos Prisma estáticos + filas JSONB) frente a
«código generado» y «plantillas bajo `plugins/`»:

- `GeneratedResource` — la **definición** (schema + metadatos), global (actúa como
  plantilla/esquema, coherente con los modelos globales de ADR-0006).
- `GeneratedRecord` — las **filas de datos**, scoped por `organizationId` (fail-closed),
  con el payload en una columna `data Json`.

Razones: (a) es **caliente** — definir/editar un recurso no requiere `prisma generate`,
build ni reinicio; (b) mantiene la DB de la app como única fuente de verdad (sin escribir
archivos en disco que rompan el despliegue stateless); (c) reutiliza el patrón ya adoptado
en ADR-0027 (tabla genérica `measurements` JSONB en vez de una tabla por dispositivo).

`código generado` se descarta como vía primaria por romper el hot-reload y por el caveat de
ADR-0010 (Fastify 5 no puede hot-desregistrar rutas). `plantillas bajo plugins/` queda como
**escape hatch**: un recurso que necesite relaciones reales de Prisma o lógica no-CRUD se
«promueve» a plugin generando el paquete desde una plantilla (fuera del alcance de este ADR).

### 2. Formato de definición: JSON Schema (+ builder UI)

El recurso se define con **JSON Schema** (subconjunto draft 2020-12, el mismo estándar ya
usado en `manifest.settings` y en la validación de rutas Fastify/Ajv). El campo
`GeneratedResource.schema` guarda el esquema del **registro** (los campos y tipos). El
autor puede escribirlo como JSON o armarlo en un **builder UI** (sección
`/admin/generated`) que genera el JSON Schema. No se inventa un DSL nuevo.

### 3. Generación de SDK: codegen estático exportable + schema en runtime

Ambos, complementarios:

- **Codegen estático (exportable)**: un script `pnpm run gen:api` (en `packages/generated`
  o `apps/web`) lee las definiciones de `GeneratedResource` y emite tipos TypeScript
  (`interface Visita { ... }`) + funciones cliente tipadas que envuelven
  `apps/web/src/lib/api.ts`. El resultado se commitea en `apps/web/src/lib/generated/`
  (o un paquete `@webs/generated`), dando **tipos en tiempo de compilación** a `apps/web` y,
  por herencia, a `apps/mobile`.
- **Schema en runtime**: `GET /api/v1/generated/:resource/schema` devuelve el JSON Schema
  para que la UI renderice formularios/tablas y valide sin recompilar (el «acceso rápido»).

El path caliente es runtime; el codegen es el paso de endurecimiento (opcional, vía botón
«Exportar SDK»).

### 4. Seguridad / validación / sanitización

- **Validación**: el router genérico valida body/query contra el JSON Schema del recurso
  (Ajv, ya dependencia de Fastify) antes de tocar la DB.
- **Sanitización**: los campos `string` con `format: "html"` (o `content`) se sanean con
  `sanitize-html` (reutiliza el enfoque de `apps/api/src/lib/sanitize`, t56). Los `string`
  planos se escapan al serializar.
- **Permisos**: al crear un recurso se generan automáticamente las claves
  `gen.<resourceKey>.read` / `gen.<resourceKey>.write` (y se registran vía el mismo
  mecanismo que `registerPluginPermissions`, `apps/api/src/plugins/loader.ts:213`), más una
  `generated.manage` para definir/editar recursos. Se integran al catálogo canónico de
  permisos (ADR-0018).
- **Multi-tenant**: `GeneratedRecord.organizationId` obligatorio; el router usa
  `requireTenant`/`resolveScope` (ADR-0006) y falla cerrado si no hay tenant.

### 5. Integración con plugins y feature-gating (M6)

- **Router genérico único**: se registra **una vez** en build-time
  (`apps/api/src/modules/generated/routes.ts` bajo `API_PREFIX`) con rutas wildcard
  `GET/POST /generated/:resource` y `GET/PATCH/DELETE /generated/:resource/:id`. En cada
  request resuelve el recurso (Prisma + caché Redis), aplica schema/permisos/tenant. Así se
  evita registrar/desregistrar rutas por recurso (el caveat de Fastify 5 de ADR-0010).
- **Feature premium `generator`**: se añade una décima flag a `LICENSE_FEATURES`
  (`apps/api/src/modules/licenses/features.ts`, `area: 'extensions'`, `core: false`). El
  menú `/admin/generated`, la creación de recursos y el router devuelven 403 sin licencia
  (`isLicensed(fastify, 'generator')`, ADR-0019). Los **datos** de un recurso pueden, además,
  declarar su propia `feature` (un recurso generado puede ser premium por sí mismo).
- **Coherencia con plugins**: un recurso generado es un «plugin declarativo» — se registra en
  el menú admin (ítem `/admin/generated`) como un plugin más, y su item de menú resuelve
  `feature` por la precedencia de ADR-0019 (`menu[].feature > manifest.feature > 'core'`).

### 6. Sin dependencias de pago

Todo nativo: Ajv (JSON Schema), Prisma (JSONB), `sanitize-html` (ya en el repo), caché
Redis. Sin SaaS ni pasarela, coherente con `docs/architecture/politica-dependencias.md`.

## Consecuencias

### Positivas

- Recursos CRUD arbitrarios en caliente, sin build/deploy ni tocar el monorepo.
- Un solo router genérico evita el problema de hot-(des)registro de rutas de Fastify 5.
- Tipos reales en compilación para `apps/web`/`apps/mobile` vía codegen, más render dinámico
  vía schema en runtime.
- Reutiliza infraestructura existente (Ajv, sanitize-html, Redis, requireTenant,
  registerPluginPermissions, hasFeature) en vez de introducir dependencias nuevas.

### Negativas

- JSONB no tiene las garantías relacionales de un modelo Prisma real (sin FK, sin índices
  ricos; solo GIN en `data` y `[resourceId, organizationId]`). Mitigación: el escape hatch
  de «promover a plugin».
- El codegen estático puede desincronizarse del schema si no se re-ejecuta tras editar el
  recurso (se mitiga con una advertencia en la UI y regeneración por CI).
- Añadir una feature premium nueva (`generator`) toca `LICENSE_FEATURES`, el catálogo de
  features de la UI de emisión y los textos i18n (superficie pequeña, ya prevista en
  ADR-0019 §4).

## Notas

- El modelo `GeneratedRecord` es análogo al `measurements` de ADR-0027 (tabla genérica
  JSONB + índice compuesto), pero vive en el schema Prisma principal (no en una base
  separada).
- `apps/mobile` no requiere SDK propio: al envolver `apps/web`, hereda el mismo cliente
  tipado. La parte nativa de Capacitor (QR, splash) es ajena a este ADR.
- El `feature` del generador (`generator`) es la décima flag; el mapeo feature→recursos se
  mantiene en `docs/architecture/feature-gating.md`.
- Alcance: este ADR define el diseño; la implementación (M7) y el catálogo de recursos
  generables quedan para las tareas siguientes.
