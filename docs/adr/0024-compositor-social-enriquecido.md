# ADR-0024: Compositor de publicación social enriquecido

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 10 — v2.8.0)
- **Decisión:** Enriquecer el compositor de la red social para que una publicación deje de ser
  «texto + una única imagen/video» y pase a soportar **galería multi-media** (varias imágenes/video
  con pie por ítem), **menciones `@usuario`** y **hashtags `#tema`** extraídos e indexados,
  **encuestas** (una votación por usuario), **selector de visibilidad** `public | followers | private`
  con filtrado en servidor, y **vista previa de enlaces** (unfurl SSRF-safe). Todo **nativo**, sin
  componentes de pago. Especificación detallada en `docs/architecture/compositor-social.md`.

## Contexto

La red social pública actual es un plugin con un compositor mínimo:

- `plugins/social/src/server.ts` (183 líneas) monta rutas bajo `/api/v1/plugins/social` (el frontend
  las consume por el alias retrocompatible `/api/v1/blocks/social`). `POST /posts` acepta
  `{ author, text, mediaUrl, mediaType }` con **una sola** media (`mediaUrl`/`mediaType` escalares),
  recorta `text` a `maxPostLength` (default 500) y guarda en `SocialPost`
  (`apps/api/prisma/schema.prisma:363-376`).
- El modelo `SocialPost` hoy es: `id`, `organizationId`, `author`, `text`, `mediaUrl String?`,
  `mediaType String?`, `likes Int`, `createdAt`. **No** hay galería, ni visibilidad, ni encuestas, ni
  menciones/hashtags, ni preview de enlaces. No existen tablas `SocialMention`/`SocialHashtag`/
  `SocialPoll`/`SocialPollVote`.
- `apps/web/src/features/public/SocialPublicPage.tsx` (834 líneas) define `interface SocialPost`
  con `mediaUrl: string | null` y `mediaType: string | null` únicos; el formulario «Nueva publicación»
  solo expone `textarea` + un input de archivo (una foto/video). El feed lista `p.mediaUrl` como un
  único elemento.
- El scoping multi-tenant ya es **fail-closed** en el plugin (ADR-0006): `resolveOrgId()` usa
  `resolveTenant` con `ROOT_ORG_ID` como fallback single-tenant; el resto de modelos sociales
  (`Follow:378-389`, `Story:391-403`, `Notification:319-334`) llevan `organizationId`.
- `docs/backlog.md` §3.7 (M10 v2.8.0, WB-45→WB-53) define los 9 ítems de este compositor enriquecido
  (galería, menciones, hashtags, encuestas, visibilidad, emoji, contador, preview de enlaces y
  autoguardado), con trazabilidad a las tareas `t143`/`t144` (implementación) y `t145`.

El objetivo es mantener la red social **nativa** (sin pasarelas de pago ni servicios externos de
pago) y **retrocompatible** con los posts ya existentes.

## Decisión

### 1. Modelo de datos

- **`SocialPost`** se extiende (conservando las columnas actuales para retrocompat, ver §4):
  - `mediaUrls Json @default("[]")` — galería de ítems `{ url, type: 'image' | 'video', caption? }`,
    con **caption por ítem**. Es el campo canónico para los posts nuevos.
  - `visibility String @default("public")` — `public | followers | private`.
  - `pollId String?` — FK a `SocialPoll` (una encuesta opcional por post).
  - `preview Json?` — vista previa de enlace `{ url, title, description?, image?, siteName?, fetchedAt }`.
  - `mediaUrl`/`mediaType` se conservan como **columnas legacy** (espejo del primer ítem) para que los
    clientes que aún leen el campo único no se rompan.
- **`SocialMention`** (nueva): `id`, `postId` (FK), `organizationId`, `userId` (el usuario mencionado),
  `createdAt`, `@@unique([postId, userId])`. Se extrae de `text` con regex `@username` y se resuelve
  contra `User.username` (o `displayName`) dentro de la misma organización; el post guarda el texto
  original (no se reescribe) y el frontend lo enlaza al renderizar.
- **`SocialHashtag`** (nueva): `id`, `postId` (FK), `organizationId`, `tag` (normalizado a minúsculas,
  sin `#`), `createdAt`, `@@unique([postId, tag])`, `@@index([tag])`. Extraído de `text` con regex
  `#(\w+)`; enlazable a un feed filtrado por tag.
- **`SocialPoll`** (nueva): `id`, `postId` (FK, `@unique` — una encuesta por post), `organizationId`,
  `question String`, `options Json` (`[{ id, text }]`, 2..N opciones), `endsAt DateTime?`,
  `createdAt`.
- **`SocialPollVote`** (nueva): `id`, `pollId` (FK), `organizationId`, `userId`, `optionId`, `createdAt`,
  `@@unique([pollId, userId])` — garantiza **un voto por usuario** a nivel de base de datos.
- Todos los modelos nuevos llevan `organizationId` y se leen/escriben bajo el scoping fail-closed de
  ADR-0006 (fragmento `where` por tenant, 403 sin tenant).

### 2. Contrato API (plugin `social`)

- **`POST /posts`** (autenticado) — cuerpo enriquecido:
  `{ author, text, mediaUrls: [{ url, type, caption? }], visibility?, poll?: { question, options },
  preview? }`. El servidor:
  1. valida `visibility ∈ {public, followers, private}` (default `public`);
  2. normaliza `mediaUrls[]`, y **espeja** el primer ítem a `mediaUrl`/`mediaType` (retrocompat);
  3. extrae menciones (`@username`) y hashtags (`#tema`) de `text`, creando `SocialMention`/
     `SocialHashtag` en la misma transacción;
  4. si viene `poll`, crea `SocialPoll` y vincula `pollId`;
  5. si viene `preview` (o una URL en `text`), desencadena el **unfurl** server-side (§3);
  6. notifica a los usuarios mencionados (ver §3).
- **`GET /posts`** — gana filtros: `?tag=` (por hashtag), `?mention=` (por usuario mencionado),
  además de los actuales `author`/`followingOf`. Aplica **visibilidad en servidor** (§3).
- **`POST /posts/:id/vote`** (autenticado) — `{ optionId }`: `upsert` de `SocialPollVote` con
  `@@unique([pollId, userId])` (re-voto reemplaza la opción; no suma votos duplicados).
- **`GET /posts/:id/votes`** — conteo por opción (para el conteo en vivo del frontend) y, si el
  request viene autenticado, la opción del usuario.
- La notificación de mención reutiliza la infraestructura existente de `Notification`
  (`schema.prisma:319-334`) + email/WebSocket, sin acoplar al plugin.

### 3. Seguridad y privacidad

- **Visibilidad filtrada en servidor (no leak):** `GET /posts` nunca devuelve posts que el solicitante
  no debe ver. Regla: anónimo → solo `public`; autenticado → `public` + `followers` (si es autor o
  sigue al autor) + `private` (solo si es el autor). El filtro vive en la query del servidor, **no** en
  el cliente.
- **Menciones no spamean:** una mención solo notifica si el `@username` resuelve a un usuario de la
  **misma organización**; hay un **límite de menciones por post** (p. ej. 10, se descartan las que
  excedan) y la notificación es un único `Notification` por usuario mencionado (dedup por
  `@@unique([postId, userId])`). No hay email masivo: se genera notificación interna y, como máximo,
  un email/WebSocket según preferencias ya existentes.
- **Unfurl SSRF-safe:** el fetcher de vista previa de enlaces **deniega destinos loopback/privados**
  (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fe80::/10`),
  solo permite `http`/`https`, aplica **timeout** (3–5 s), **límite de redirecciones** y **tope de
  tamaño** de respuesta (p. ej. 512 KB), y no sigue a puertos no estándar. El `preview` se cachea por
  URL para no re-fetchear en cada render.

### 4. Retrocompatibilidad

- Los posts existentes (`mediaUrl` único, sin `visibility`) **siguen funcionando**: al leer, si
  `mediaUrls` está vacío y `mediaUrl` tiene valor, el servidor (o el serializador) lo expone como una
  galería de un único ítem; `visibility` ausente se interpreta como `public` (el comportamiento
  anterior era público de facto).
- Los clientes viejos que leen `mediaUrl`/`mediaType` siguen viendo el primer ítem de la galería
  (espejo), por lo que el feed actual no se rompe durante la transición. La columna `mediaUrl` se
  marcará como legacy cuando todos los consumidores hayan migrado a `mediaUrls`.
- Ningún campo nuevo es obligatorio: `poll`/`preview`/`mediaUrls`/`visibility` son opcionales y tienen
  valores por defecto sensatos.

## Consecuencias

**Positivas:**

- Compositor de red social completo (galería, menciones, hashtags, encuestas, visibilidad, preview de
  enlaces) **sin salir del ecosistema nativo**: sin pasarelas de pago ni SaaS de pago (coherente con
  `docs/architecture/politica-dependencias.md`).
- Visibilidad y scoping se resuelven en servidor, garantizando privacidad real (no leak) y aislamiento
  multi-tenant fail-closed (ADR-0006).
- Retrocompatible: los posts y clientes existentes no requieren migración urgente.

**Negativas / costes:**

- Migración de `SocialPost`: se añaden columnas con valores por defecto (sin backfill destructivo);
  el campo legacy `mediaUrl` convive con `mediaUrls` hasta que se retire en un cleanup posterior.
- Extracción de menciones/hashtags + unfurl + encuestas añaden lógica en el `POST /posts` (transacción
  con varias tablas) y una tabla de votos con restricción única; se mitiga con índices
  `(organizationId)`, `(postId)` y `(tag)`.
- El unfurl SSRF-safe exige una lista de denegación de rangos privados y límites de red estrictos,
  más cache por URL.

## Notas

- Especificación técnica completa (tablas Prisma, contrato de endpoints, algoritmo de extracción,
  reglas de visibilidad y mitigaciones SSRF): `docs/architecture/compositor-social.md`.
- Implementación en `t143`/`t144` (API + frontend), QA/i18n en `t145`; trazabilidad en
  `docs/backlog.md` §3.7 (WB-45→WB-53).
- Relación con ADR-0006 (scoping fail-closed), ADR-0004 (permisos `<recurso>.<accion>`), ADR-0012
  (i18n de la UI del compositor) y `docs/architecture/politica-dependencias.md` («todo nativo, sin
  modo de pago»).
