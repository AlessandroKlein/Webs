# Compositor de publicación social enriquecido (ADR-0024)

Spec técnica del compositor enriquecido de la red social (`plugins/social`), correspondiente al
Milestone 10 (v2.8.0). Define el modelo de datos, el contrato API, las reglas de visibilidad y las
mitigaciones de seguridad para galería multi-media, menciones, hashtags, encuestas y vista previa de
enlaces. Decisión registrada en `docs/adr/0024-compositor-social-enriquecido.md`.

## 1. Estado actual (punto de partida)

- Plugin `plugins/social/src/server.ts` (183 líneas): rutas bajo `/api/v1/plugins/social` (alias
  `/api/v1/blocks/social` en el frontend). `POST /posts` acepta `{ author, text, mediaUrl, mediaType }`
  con una sola media; `text` recortado a `maxPostLength` (default 500). Ya implementa scoping
  fail-closed (`resolveOrgId()` → `resolveTenant` con fallback `ROOT_ORG_ID`).
- Modelo `SocialPost` (`apps/api/prisma/schema.prisma:363-376`): `id`, `organizationId`, `author`,
  `text`, `mediaUrl String?`, `mediaType String?`, `likes Int`, `createdAt`, `@@map("social_posts")`.
- Frontend `apps/web/src/features/public/SocialPublicPage.tsx` (834 líneas): `interface SocialPost`
  con `mediaUrl`/`mediaType` únicos; compositor = `textarea` + un solo `input[type=file]`.

## 2. Modelo de datos (Prisma)

### 2.1 `SocialPost` (extendido)

```prisma
model SocialPost {
  id             String   @id @default(uuid())
  organizationId String
  author         String
  text           String
  mediaUrls      Json     @default("[]")   // [{ url, type: 'image'|'video', caption? }]
  mediaUrl       String?                    // legacy (espejo del primer ítem)
  mediaType      String?                    // legacy
  visibility     String   @default("public") // public | followers | private
  preview        Json?                      // { url, title, description?, image?, siteName?, fetchedAt }
  likes          Int      @default(0)
  createdAt      DateTime @default(now())

  poll           SocialPoll?   // back-relation (option B): la FK vive en SocialPoll.postId
  mentions       SocialMention[]
  hashtags       SocialHashtag[]

  @@index([organizationId])
  @@index([createdAt])
  @@index([author, createdAt])
  @@map("social_posts")
}
```

### 2.2 `SocialMention`

```prisma
model SocialMention {
  id             String   @id @default(uuid())
  postId         String
  organizationId String
  userId         String   // usuario mencionado (@username resuelto)
  createdAt      DateTime @default(now())

  post           SocialPost @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, userId])
  @@index([userId])
  @@index([organizationId])
  @@map("social_mentions")
}
```

### 2.3 `SocialHashtag`

```prisma
model SocialHashtag {
  id             String   @id @default(uuid())
  postId         String
  organizationId String
  tag            String   // normalizado minúsculas, sin '#'
  createdAt      DateTime @default(now())

  post           SocialPost @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@unique([postId, tag])
  @@index([tag])
  @@index([organizationId])
  @@map("social_hashtags")
}
```

### 2.4 `SocialPoll` y `SocialPollVote`

```prisma
model SocialPoll {
  id             String    @id @default(uuid())
  postId         String    @unique  // una encuesta por post
  organizationId String
  question       String
  options        Json      // [{ id, text }], 2..N opciones
  endsAt         DateTime?
  createdAt      DateTime  @default(now())

  post           SocialPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  votes          SocialPollVote[]

  @@index([organizationId])
  @@map("social_polls")
}

model SocialPollVote {
  id             String   @id @default(uuid())
  pollId         String
  organizationId String
  userId         String
  optionId       String
  createdAt      DateTime @default(now())

  poll           SocialPoll @relation(fields: [pollId], references: [id], onDelete: Cascade)

  @@unique([pollId, userId]) // un voto por usuario
  @@index([organizationId])
  @@map("social_poll_votes")
}
```

Todos los modelos llevan `organizationId` y se operan bajo el scoping fail-closed de ADR-0006.

> **Estado: implementado (M10, v2.8.0).** Los modelos y endpoints descritos abajo quedaron
> implementados por t143 (backend), t144 (compositor) y t145 (feed). Desviación respecto de un
> borrador previo del spec: la encuesta usa **option B** — `SocialPoll.postId @unique` como FK real
> (`social_polls → social_posts`) y `SocialPost.poll` como back-relation (sin columna `pollId` en
> `social_posts`), resolviendo una FK circular inválida del borrador. El resto coincide 1:1 con el
> código (`apps/api/prisma/schema.prisma:392-474`).

## 3. Contrato API (plugin `social`)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/posts` | no | Feed. Filtros: `author`, `followingOf`, `tag`, `mention`. Aplica visibilidad (§5). |
| POST | `/posts` | sí | Crea publicación enriquecida (§4). |
| PATCH | `/posts/:id/like` | sí | Toggle like (existente, sin cambios). |
| DELETE | `/posts/:id` | sí | Elimina post (cascade de mentions/hashtags/poll). |
| POST | `/posts/:id/vote` | sí | Vota `{ optionId }` (upsert por `@@unique([pollId,userId])`). |
| GET | `/posts/:id/votes` | no | Conteo por opción + opción del usuario si autenticado. |
| POST/DELETE/GET | `/follow`, `/follow/counts` | sí/no | Seguimiento (existente, sin cambios). |
| GET/POST/DELETE | `/stories` | sí/no | Historias (existente, sin cambios). |
| GET | `/users` | no | Usuarios para autocomplete de menciones y follow. |

El alias retrocompatible `/api/v1/blocks/social` se conserva durante M10 (igual que el resto del
shim de plugins).

## 4. Creación de publicación (`POST /posts`)

Cuerpo:

```jsonc
{
  "author": "<userId>",
  "text": "Hola @juan mira #webs",
  "mediaUrls": [
    { "url": "https://cdn/1.jpg", "type": "image", "caption": "portada" },
    { "url": "https://cdn/2.jpg", "type": "image", "caption": "detalle" }
  ],
  "visibility": "public",        // public | followers | private (default public)
  "poll": { "question": "¿?", "options": [{ "id": "a", "text": "Sí" }, { "id": "b", "text": "No" }] },
  "preview": { "url": "https://webs.com" }  // o se deriva de una URL en text
}
```

Flujo (en una transacción):

1. **Validar** `visibility ∈ {public, followers, private}` (default `public`).
2. **Normalizar media**: aceptar `mediaUrls[]` (cada ítem `{ url, type: image|video, caption? }`).
   Espejar el primer ítem a `mediaUrl`/`mediaType` (retrocompat). Si el cliente envía el campo legacy
   `mediaUrl` (único), convertirlo en una galería de un ítem.
3. **Extraer menciones/hashtags** de `text`:
   - menciones: regex `@([A-Za-z0-9_.-]+)` → resolver cada `username` contra `User` **de la misma
     organización**; crear `SocialMention` por usuario resuelto (dedup, máx. 10).
   - hashtags: regex `#([A-Za-z0-9_]+)` → normalizar a minúsculas; crear `SocialHashtag` (dedup por
     `@@unique([postId, tag])`).
4. **Encuesta**: si `poll` presente, crear `SocialPoll` y vincular `pollId`.
5. **Unfurl**: si `preview.url` (o una URL detectada en `text`), fetchear el preview SSRF-safe (§6)
   y persistir en `preview`.
6. **Notificar menciones**: crear un `Notification` por usuario mencionado (no más de 10), reutilizando
   la infraestructura existente; sin email masivo.

## 5. Visibilidad (filtrado en servidor, no leak)

`GET /posts` aplica siempre el filtro de visibilidad **en el servidor**:

| Solicitante | Ve `public` | Ve `followers` | Ve `private` |
|-------------|:-----------:|:--------------:|:------------:|
| Anónimo | ✅ | ❌ | ❌ |
| Autenticado, es autor | ✅ | ✅ | ✅ |
| Autenticado, sigue al autor | ✅ | ✅ | ❌ |
| Autenticado, no sigue | ✅ | ❌ | ❌ |

- `followers` se resuelve consultando `Follow` (`followerId = solicitante, followingId = post.author`).
- El filtro se materializa en la `where` de Prisma (nunca en el cliente). Los filtros `tag`/`mention`
  se combinan con la visibilidad (`AND`).

## 6. Unfurl SSRF-safe

El fetcher de vista previa de enlaces:

1. **Deniega destinos privados/loopback**: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`,
   `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fe80::/10`, y cualquier IP literal de esos rangos
   resuelta por DNS (se resuelve y se re-valida la IP destino).
2. Solo `http`/`https`, puertos 80/443.
3. **Timeout** 3–5 s, **máx. 5 redirecciones**, **tope de respuesta** 512 KB.
4. Parsea `<title>`, `<meta name="description">`, `<meta property="og:image">` y `og:site_name`.
5. **Cachea** por URL (`preview.fetchedAt`) para no re-fetchear en cada render.

## 7. Retrocompatibilidad

- Posts existentes (`mediaUrl` único, sin `visibility`): al leer, si `mediaUrls == []` y `mediaUrl`
  presente → se expone como galería de un ítem; `visibility` ausente → `public`.
- Clientes viejos leen `mediaUrl`/`mediaType` (espejo del primer ítem), así el feed actual no se
  rompe. `mediaUrl` se retira en un cleanup posterior.
- `poll`/`preview`/`mediaUrls`/`visibility` son opcionales.

## 8. Implementación (M10, v2.8.0)

1. **Migración Prisma** `0011_social_rich` (aditiva): `social_posts` + `mediaUrls`/`visibility`/
   `preview`; nuevas tablas `social_mentions`, `social_hashtags`, `social_polls`,
   `social_poll_votes` (option B para la FK de la encuesta). Sin backfill destructivo.
2. **Backend (t143)**: `plugins/social/src/server.ts` — `POST /posts` transaccional (galería
   `mediaUrls[]` + legacy `mediaUrl`, `visibility`, `poll`, extracción de hashtags/menciones, unfurl
   SSRF-safe con `node:dns` re-validando IP, notificación de menciones); `GET /posts` con filtros
   `tag`/`mention` + visibilidad server-side; `GET /posts/:id`, `POST /posts/:id/vote` (upsert
   `@@unique([pollId,userId])`), `GET /posts/:id/votes`. Retrocompat: posts viejos → `visibility
   public`, `mediaUrl` legacy → `mediaUrls[0]`.
3. **Compositor (t144)**: `apps/web/src/features/public/SocialComposer.tsx` (~400 líneas) — galería
   multi-media (subir múltiple, reordenar, eliminar, caption), selector de visibilidad, contador
   con límite 500, autocompletado de menciones/hashtags (`detectToken` + dropdown), emoji picker
   (48 emojis), encuestas (pregunta + 2..20 opciones), preview de enlace inline y autoguardado de
   borrador en `localStorage` (`webs.social.draft.v1`). Corregido `SOCIAL_BASE` →
   `/api/v1/plugins/social` (el shim `/blocks` era solo CRUD y daba 404).
4. **Feed (t145)**: nuevos componentes `apps/web/src/features/public/social/` + `SocialPublicPage`
   — galerías, encuestas interactivas con conteo, menciones/hashtags clicables.

## 9. Referencias

- `docs/adr/0024-compositor-social-enriquecido.md` (decisión).
- `docs/adr/0006-multi-tenant.md` (scoping fail-closed).
- `docs/adr/0004-auth.md` (permisos `<recurso>.<accion>`).
- `docs/adr/0012-i18n.md` (i18n de la UI).
- `docs/architecture/politica-dependencias.md` («todo nativo, sin modo de pago»).
- `docs/backlog.md` §3.7 (WB-45→WB-53).
