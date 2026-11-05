# Plugin tracking tipo Trakt (M16 — v2.14.0)

**Spec técnica del ADR-0031**: scrobble, sync, extensión de navegador, import/export y gating de un rastreador de visionado tipo Trakt, nativo y sin dependencias de pago.

## 1. Objetivo

Agregar el plugin `tracking` (`@webs/plugin-tracking`) que registra qué ve cada usuario: historial, «viendo ahora», watchlist, colección/favoritos y valoraciones, con scrobble automático desde el reproductor de la videoteca (M15) y desde plataformas de terceros (Netflix/Prime/YouTube) vía una extensión de navegador Manifest V3.

## 2. Modelo de datos

Catálogo global normalizado (`TrackMedia`, una fila por obra/episodio) + tablas por usuario (sin duplicar metadatos). `id` entero autoincremental para compacidad.

```prisma
model TrackMedia {
  id            Int      @id @default(autoincrement())
  type          String   // 'movie' | 'episode'
  title         String   // snapshot mínimo
  year          Int?
  seasonNumber  Int?
  episodeNumber Int?
  imdbId        String?  // "tt..."
  tmdbId        Int?
  tvdbId        Int?
  traktSlug     String?  // compat import/export, nunca llamada a Trakt
  screenWorkId  String?  // link opcional al catálogo M15 (metadatos ricos por join)
  createdAt     DateTime @default(now())

  @@unique([imdbId])  // parciales en SQL (null no colisiona)
  @@index([tmdbId])
  @@index([tvdbId])
  @@index([traktSlug])
  @@map("tracking_media")
}

model WatchEvent {
  id        Int      @id @default(autoincrement())
  userId    String
  mediaId   Int
  watchedAt DateTime @default(now())
  progress  Int      @default(100) // 0-100
  media     TrackMedia @relation(fields: [mediaId], references: [id], onDelete: Restrict)

  @@index([userId, watchedAt])
  @@map("tracking_watch_events")
}

model WatchlistItem {
  id      Int      @id @default(autoincrement())
  userId  String
  mediaId Int
  addedAt DateTime @default(now())
  media   TrackMedia @relation(fields: [mediaId], references: [id], onDelete: Cascade)

  @@unique([userId, mediaId])
  @@map("tracking_watchlist")
}

model FavoriteItem {
  id      Int      @id @default(autoincrement())
  userId  String
  mediaId Int
  addedAt DateTime @default(now())
  media   TrackMedia @relation(fields: [mediaId], references: [id], onDelete: Cascade)

  @@unique([userId, mediaId])
  @@map("tracking_favorites")
}

model RatingItem {
  id      Int      @id @default(autoincrement())
  userId  String
  mediaId Int
  rating  Int      // 1-10
  ratedAt DateTime @default(now())
  media   TrackMedia @relation(fields: [mediaId], references: [id], onDelete: Cascade)

  @@unique([userId, mediaId])
  @@map("tracking_ratings")
}

model PlaybackSession {
  id        Int      @id @default(autoincrement())
  userId    String
  mediaId   Int
  status    String   @default("playing") // 'playing' | 'paused'
  progress  Int      @default(0) // 0-100
  startedAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  media     TrackMedia @relation(fields: [mediaId], references: [id], onDelete: Cascade)

  @@unique([userId, mediaId])
  @@map("tracking_playback_sessions")
}
```

**Resolución de medios** (`lib/tracking-media.ts`): dado `ids {imdb,tmdb,tvdb,traktSlug}` o `{title,year,type,season,episode}`, se busca `TrackMedia` por IDs (dedupe); si no existe se crea con snapshot. Cuando `screenWorkId` está presente (obra en la videoteca M15), la UI resuelve póster/sinopsis por join a `ScreenWork`.

## 3. API scrobble + sync + check-in

Base: `/api/v1/plugins/tracking` (prefijo estándar de plugins, `loader.ts:197`). Auth: JWT de usuario (`fastify.authenticate`) + `requireTenant` para el contexto de organización del tenant (el dato en sí escala por `userId`).

| Método | Ruta | Permiso/entitlement | Descripción |
|--------|------|---------------------|-------------|
| POST | `/scrobble/start` | `tracking.scrobble` | Crea/reanuda `PlaybackSession` (body `{progress, movie?|episode?}`). |
| POST | `/scrobble/pause` | `tracking.scrobble` | Pausa la sesión + `progress`. |
| POST | `/scrobble/stop` | `tracking.scrobble` | Cierra la sesión; `progress > 80` ⇒ inserta `WatchEvent` (visto). |
| POST | `/checkin` | `tracking.scrobble` | Check-in «viendo ahora» (sin sesión persistente). |
| GET | `/playback` | — (propio) | Sesión activa del usuario. |
| GET | `/history` | — (propio) | Historial (`WatchEvent`, paginado, `?page=&pageSize=`). |
| GET | `/watchlist` | — (propio) | Lista para ver. |
| GET | `/collection` | — (propio) | Colección/favoritos. |
| GET | `/ratings` | — (propio) | Valoraciones 1–10. |
| POST/DELETE | `/watchlist`, `/collection`, `/ratings` | — (propio) | Alta/baja (upsert por `@@unique([userId,mediaId])`). |
| POST | `/metadata/match` | `tracking.scrobble` | Resolver `{title,year,type}` → `ids` vía TMDB (proxy server-side, reusa conector M15). |

**Contrato `ids`**: `{ imdb: string?, tmdb: number?, tvdb: number?, traktSlug: string? }`. El servidor **nunca** llama a Trakt; `traktSlug` es un ID de compatibilidad para import/export y enlaces.

**Semántica del `stop`** (idéntica a Trakt): `progress > 80` ⇒ visto (`WatchEvent.progress`); `1–79` ⇒ se trata como pausa y no se registra en historial.

## 4. Import / export

- `GET /tracking/export?format=csv|json` (entitlement `tracking.export`) — columnas CSV: `type,title,year,imdb_id,tmdb_id,tvdb_id,trakt_slug,season,episode,watched_at,progress,rating,list`. JSON es la estructura equivalente (round-trippable).
- `POST /tracking/import` (entitlement `tracking.export`) — `multipart/form-data` (CSV) o `application/json`; **dedupe por IDs** (`imdb`/`tmdb`/`tvdb`/`traktSlug`), upsert de watchlist/colección/valoraciones, insert idempotente de historial.

## 5. Extensión de navegador (Manifest V3)

Paquete standalone `apps/scrobbler-extension/` (Chrome + Firefox). No es dependencia de `apps/api`/`apps/web`.

- `manifest.json` (V3): `content_scripts` sobre `*://*/*` (o dominios configurados), `permissions: ["storage"]`, `host_permissions` para `http/https`.
- `content.js`: detecta `<video>` (`play`/`pause`/`timeupdate`/`ended`), extrae título+año de la página (OG tags / `<title>`), envía `scrobble/start|pause|stop` a `{tenantUrl}/api/v1/plugins/tracking/scrobble/*` con header `Authorization: Bearer <token>`.
- **Match**: título+año → `POST /metadata/match` → `ids`. Si el match es ambiguo, la extensión muestra un «¿cuál es?» y persiste la elección en `storage.local`.
- **Autenticación**: token de API con scope `tracking.scrobble` (módulo `api-tokens`). El token es personal; la extensión scrobbles como ese usuario. La URL del tenant y el token se configuran en el popup de la extensión.

## 6. Feature-gating (dos niveles)

### Nivel 1 — licencia del operador (M6)

- Nuevo flag en `apps/api/src/modules/licenses/features.ts` `LICENSE_FEATURES`:

```ts
{ key: 'tracking', label: 'Tracking de visionado', description: 'Historial, scrobble, listas y valoraciones (tipo Trakt).', area: 'extensions', core: false }
```

- `plugin.json` declara `"feature": "tracking"`. `POST /plugins/install` → 403 si la licencia activa no incluye `tracking` (patrón ADR-0019); menú `/admin/tracking` oculto/upsell.

### Nivel 2 — membresía del usuario (M4)

Catálogo `TRACKING_ENTITLEMENTS` (en `apps/api/src/modules/tracking/entitlements.ts`):

| Flag | Free (`plan: 'free'`) | Paid |
|------|----------------------|------|
| `tracking.history` | ✅ | ✅ |
| `tracking.watchlist` | ✅ (límite 100) | ✅ (ilimitado) |
| `tracking.collection` | ✅ | ✅ |
| `tracking.ratings` | ✅ | ✅ |
| `tracking.scrobble` | ❌ | ✅ |
| `tracking.export` | ❌ | ✅ |
| `tracking.stats` | ❌ | ✅ |
| `tracking.unlimited_lists` | ❌ | ✅ |

- Flags persistidos en `MembershipPlan.features` (Json). `requireEntitlement(userId, flag)` resuelve `Membership.plan → MembershipPlan.features` (default `free` si el usuario no tiene membresía). Los planes se crean/editan desde la UI del operador marcando estos flags.

## 7. Seguridad y privacidad

- **Dato personal**: tablas escalan por `userId` (no `organizationId`); un usuario sólo ve lo suyo.
- **Consentimiento**: opt-in (activar scrobbler nativo o instalar la extensión y pegar el token). Registrado en el aviso de privacidad (t220).
- **Scope mínimo** `tracking.scrobble`: sin lectura de otros datos.
- **Rate limiting**: `createRateLimiter(redis, points, duration, 'rl:tracking:scrobble')` por usuario/IP en `scrobble/*` e `import`.
- **Sin terceros**: no se llama a la API de Trakt ni se comparten hábitos de visionado; `traktSlug` sólo es compat de import/export.

## 8. Trazabilidad M16

| WB | Alcance | Sección | Tarea código |
|----|---------|---------|--------------|
| WB-154 | Modelo de datos compacto | §2 | t221 |
| WB-155 | API scrobble + check-in | §3 | t222 |
| WB-156 | Endpoints sync | §3 | t222 |
| WB-157 | Import/export | §4 | t222 |
| WB-158 | Dashboard de tracking | (consumidor de §2–§3) | t224 |
| WB-159 | Scrobbler nativo + extensión | §3, §5 | t225 |
| WB-160 | Feature-gating | §6 | t223 |
| WB-161 | i18n ES/EN/PT | claves `tracking.*` | t226 |
| WB-162 | Docs + QA + release | este documento | t227/t228/t229 |
