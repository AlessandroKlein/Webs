# ADR-0031: Plugin de tracking tipo Trakt (scrobble, sync, extensión de navegador, import/export y gating)

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 16 — v2.14.0)
- **Decisión:** Plugin `tracking` (`@webs/plugin-tracking`) que replica las capacidades de un rastreador tipo Trakt **sin depender de la API de Trakt**: catálogo global compacto `TrackMedia` (snapshot mínimo + IDs externos, sin duplicar metadatos por usuario) referenciado por tablas por usuario (`WatchEvent`/`WatchlistItem`/`FavoriteItem`/`RatingItem`/`PlaybackSession`); API scrobble/sync/check-in inspirada en Trakt (progress 0–100, `stop` con >80 % = visto); extensión de navegador Manifest V3 complementaria; import/export CSV/JSON round-trippable; y gating en dos niveles (licencia del operador + plan de membresía del usuario).

## Contexto

La videoteca (M15, ADR-0030) aporta el catálogo `ScreenWork`/`Season`/`Episode` y el reproductor, pero no registra **qué ve cada usuario**. El Milestone 16 agrega un plugin de seguimiento tipo Trakt: historial, «viendo ahora», watchlist, colección/favoritos, valoraciones y scrobble (automático desde el reproductor propio y desde plataformas de terceros vía extensión).

La investigación del capitán (fuente: OpenAPI oficial de api.trakt.tv) fija la semántica de referencia:

- **Scrobble**: `start` (empieza/reanuda), `pause`, `stop` (progress >80 % ⇒ «scrobble» = visto; 1–79 % se trata como pausa). Body `{progress, movie:{title,year,ids}, episode:{season,number,title,ids}}`.
- **ids**: `{trakt, slug, imdb, tmdb, tvdb}` — el cross-reference que usaremos para dedupe y enlaces (nuestro `traktSlug` es un ID externo de compatibilidad, nunca una llamada a Trakt).
- **Sync**: `/sync/history`, `/sync/watchlist`, `/sync/collection`, `/sync/ratings`, `/sync/playback`, `/checkin`.

Requisito de arquitectura: ser **nativo y sin modo de pago** (coherente con `politica-dependencias.md` y `base-universal.md`), con scoping y permisos consistentes con el resto de la plataforma.

## Decisión

### 1. Modelo de datos compacto (catálogo compartido + tablas por usuario)

Se separa el **catálogo** (una sola fila por obra/episodio, compartida entre todos los usuarios) de las **tablas de tracking** (una fila por usuario + obra, sin duplicar metadatos).

- `TrackMedia` (catálogo global, **no** org-scoped): `id` entero autoincremental (compacto), `type 'movie'|'episode'`, `title` (snapshot), `year?`, `seasonNumber?`, `episodeNumber?`, `imdbId?`, `tmdbId?`, `tvdbId?`, `traktSlug?`, `screenWorkId?` (link opcional al catálogo de la videoteca M15), `createdAt`. Índices únicos parciales sobre `imdbId`/`tmdbId`/`tvdbId`/`traktSlug` para **dedupe**.
- Tablas por usuario (escaladas por `userId`, **no** por `organizationId` — el historial de visionado es dato personal, ver §6):
  - `WatchEvent` (append-only, historial): `{ id, userId, mediaId, watchedAt, progress SmallInt 0-100 }`, índice `(userId, watchedAt desc)`.
  - `WatchlistItem` (lista para ver): `{ id, userId, mediaId, addedAt }`, `@@unique([userId, mediaId])`.
  - `FavoriteItem` (colección): `{ id, userId, mediaId, addedAt }`, `@@unique([userId, mediaId])`.
  - `RatingItem` (valoración 1–10): `{ id, userId, mediaId, rating TinyInt, ratedAt }`, `@@unique([userId, mediaId])` (upsert).
  - `PlaybackSession` (sesión activa para scrobble start/pause/stop + check-in): `{ id, userId, mediaId, status 'playing'|'paused', progress SmallInt, startedAt, updatedAt }`, `@@unique([userId, mediaId])` (una sesión activa por medio).

**Snapshot vs join**: `TrackMedia` guarda un **snapshot mínimo** (`title`, `year`, `type`, números de temporada/episodio) para que export/listados no requieran join; los metadatos ricos (póster/sinopsis) se resuelven por join opcional a `ScreenWork` vía `screenWorkId` cuando la obra existe en la videoteca. Así se evita duplicar metadatos por usuario **y** se mantiene export sin join.

### 2. API scrobble + sync + check-in (endpoints propios)

El plugin se monta bajo el prefijo estándar de plugins (`apps/api/src/plugins/loader.ts:197`, `prefix: /api/v1/plugins/<id>`), por lo que la ruta canónica es `/api/v1/plugins/tracking/*`. Contrato de request/response **inspirado** en Trakt pero autenticado con el usuario/tenant de Webs:

- `POST /api/v1/plugins/tracking/scrobble/start` — body `{ progress, movie? | episode? }`; crea/actualiza `PlaybackSession` (`status:'playing'`).
- `POST .../scrobble/pause` — `status:'paused'` + `progress`.
- `POST .../scrobble/stop` — cierra la sesión; **si `progress > 80`** → inserta `WatchEvent` (visto); si 1–79 % → se descarta como pausa.
- `POST .../checkin` — check-in (marcar «viendo ahora» sin sesión persistente).
- `GET .../history`, `GET .../watchlist`, `GET .../collection`, `GET .../ratings` — sync por usuario.
- `GET .../playback` — sesión activa.
- `ids` = `{ imdb, tmdb, tvdb, traktSlug }`; el servidor **resuelve/crea** `TrackMedia` por dedupe de IDs (nunca llama a Trakt).

### 3. Extensión de navegador complementaria (Manifest V3)

- Nuevo paquete **standalone** `apps/scrobbler-extension/` (Manifest V3, Chrome + Firefox), **no** es dependencia de `apps/api`/`apps/web` (es un artefacto de usuario final que se distribuye aparte).
- `content-script` que detecta `<video>` en reproducción (inspección de `document.querySelector('video')`, eventos `play`/`pause`/`timeupdate`/`ended`) y envía `scrobble/start|pause|stop` a la URL del tenant configurada.
- **Match mínimo viable**: título + año extraídos de la página (OG tags / título) → `POST .../metadata/match` (proxy server-side que resuelve por TMDB, reutilizando el conector de M15) → `ids` para scrobblear.
- **Autenticación**: token de API de usuario con **scope mínimo `tracking.scrobble`** (sistema de API tokens, `apps/api/src/modules/api-tokens`); el token se pega en la configuración de la extensión junto a la URL del tenant. El token scrobbles **en nombre de ese único usuario**.

### 4. Import/export (CSV + JSON round-trippable)

- `GET /api/v1/plugins/tracking/export?format=csv|json` — columnas: `type,title,year,imdb_id,tmdb_id,tvdb_id,trakt_slug,season,episode,watched_at,progress,rating,list`.
- `POST /api/v1/plugins/tracking/import` — `multipart/form-data` (CSV) o `application/json`; **dedupe por IDs** (`imdb`/`tmdb`/`tvdb`/`traktSlug`), upsert de listas y valoraciones, insert de historial idempotente.

### 5. Feature-gating de suscripción (dos niveles)

**Nivel 1 — licencia del operador (M6)**: nuevo flag `tracking` en `LICENSE_FEATURES` (`apps/api/src/modules/licenses/features.ts`, `area:'extensions'`, `core:false`). El `plugin.json` declara `feature: "tracking"`; el servidor devuelve 403 en `POST /plugins/install` y el menú `/admin/tracking` se oculta/upsell si la licencia no lo incluye (patrón ADR-0019).

**Nivel 2 — membresía del usuario final (M4)**: catálogo `TRACKING_ENTITLEMENTS` con flags `tracking.scrobble`, `tracking.export`, `tracking.unlimited_lists`, `tracking.stats`, persistidos en `MembershipPlan.features` (Json, `schema.prisma:493-503`). Tier `free` (plan `free`, `Membership.plan`): historial + watchlist + colección + valoraciones con listas limitadas (100 ítems); tier `paid`: scrobble automático ilimitado + listas ilimitadas + export/import + estadísticas. Enforcement por request: `requireEntitlement(userId, flag)` resuelve `Membership.plan → MembershipPlan.features` (default `free` sin membresía).

### 6. Seguridad y privacidad

- El historial de visionado es **dato personal**: las tablas escalan por `userId` (no por organización) y no se exponen a otros usuarios ni tenants.
- **Consentimiento**: el tracking es opt-in (el usuario activa el scrobbler nativo o instala la extensión y pega su token — ese acto es el consentimiento); se registra en el aviso de privacidad (t220).
- **Token de scope mínimo** `tracking.scrobble`: sólo puede scrobblear, sin lectura de otros datos del usuario.
- **Rate limiting**: `createRateLimiter` (`apps/api/src/lib/rate-limiter.ts`, Redis en prod) por usuario/IP en `scrobble/*` e `import` para evitar flood desde la extensión.
- **Sin terceros (nativo)**: el tracking nativo no llama a la API de Trakt ni envía hábitos de visionado a terceros; `traktSlug` es un ID de compatibilidad para import/export. La excepción es el conector de **sync Trakt.tv opcional** (§7), donde el usuario autoriza con su propia cuenta; aun así, los metadatos nunca salen de Trakt (se usan TMDB/OMDb/TVMaze). Se reutilizan los conectores de metadatos de M15 (TMDB/OMDb/TVMaze/Wikipedia) sólo para resolver `ids` por título/año.

### 7. Conector de sync Trakt.tv (opcional, post-aceptación)

Ampliación suplementaria: el cliente corroboró **Trakt.tv** como API de terceros para import/export del listado del usuario. Es un conector **opcional** (no reemplaza el tracking nativo ni vuelve a Trakt una dependencia):

- **OAuth2 con PKCE**: el usuario vincula su cuenta Trakt desde la UI (`authorization_code` + `PKCE`, sin secreto de cliente en el frontend). El `access_token`/`refresh_token` se guarda cifrado (AES-256-GCM, `lib/crypto.ts`) por `userId`.
- **Endpoints usados** (API oficial `api.trakt.tv`): `GET /sync/history`, `GET /sync/watchlist`, `GET /sync/collection`, `GET /sync/ratings` para **import**; `POST/PUT/DELETE` de `/sync/*` para **export** del listado de Webs hacia Trakt.
- **Rate limits oficiales respetados**: GET autenticado 500 req/5 min; POST/PUT/DELETE 1 req/seg. Se implementa throttling por usuario y cola.
- **Los metadatos NO se sacan de Trakt**: Trakt sólo aporta el listado (IDs + progreso + valoraciones). Los metadatos ricos (título/póster/sinopsis) se resuelven con TMDB (primaria) / OMDb / TVMaze (ADR-0030) vía los `ids` (`trakt`, `imdb`, `tmdb`, `tvdb`).
- El import de Trakt se **dedupe** por IDs contra `TrackMedia` (mismo mecanismo que §4) y respeta el gating de membresía (§5).

## Consecuencias

**Positivas**

- Catálogo normalizado y compacto: una fila por obra, dedupe por IDs, sin duplicar metadatos por usuario.
- Scrobble nativo + extensión cubren el «viendo ahora» propio y de terceros sin depender de Trakt ni de servicios de pago.
- Gating en dos niveles reutiliza los sistemas ya decididos (licencia M6 + membresía M4), coherente con `politica-dependencias.md`.
- Import/export round-trippable facilita migrar desde Trakt/otros trackers.

**Negativas**

- La extensión de navegador tiene un match heurístico (título+año) que puede fallar con títulos ambiguos; se mitiga con el proxy server-side de TMDB y un flujo de «match manual».
- El snapshot mínimo en `TrackMedia` puede quedar desactualizado si la videoteca corrige el título; se acepta (snapshot para export, join para UI rica).
- `PlaybackSession` requiere limpieza de sesiones huérfanas (job que expira sesiones sin actividad > N horas).

## Notas

- Anclado en: `apps/api/prisma/schema.prisma` (`Membership` :476-491, `MembershipPlan` :493-503; `ScreenWork`/`Season`/`Episode` NO existen aún — los agrega t211 con la videoteca M15); `apps/api/src/modules/licenses/features.ts` (`LICENSE_FEATURES`, 10 flags, áreas `core/commerce/ai/scale/extensions`); `apps/api/src/lib/rate-limiter.ts` (`createRateLimiter(redis, points, duration, prefix)`); `apps/api/src/modules/api-tokens` (scopes); `apps/api/src/plugins/loader.ts:197` (prefijo `/api/v1/plugins/<id>`).
- Trazabilidad de tareas de código: **t221** = modelo de datos (§1); **t222** = API scrobble/sync/check-in + import/export (§2, §4); **t223** = feature-gating (§5); **t224** = dashboard de tracking (consumidor de §1–§2); **t225** = scrobbler nativo + extensión (§3); **t226** = i18n; **t227/t228/t229** = docs/QA/release.
- Spec técnica: `docs/architecture/tracking-trakt.md`.

### Nota suplementaria (conector Trakt.tv, post-aceptación)

El cliente corroboró **Trakt.tv** como API de terceros (junto a TMDB, OMDb y TVMaze). Se añade el **conector de sync Trakt.tv opcional** (§7): OAuth2 PKCE, endpoints `/sync/*` (GET autenticado 500/5 min; POST/PUT/DELETE 1/seg) para import/export del listado del usuario. Los **metadatos NO se sacan de Trakt** — se usan TMDB (primaria) / OMDb / TVMaze (ADR-0030). El tracking nativo sigue sin depender de Trakt. La trazabilidad WB existente no cambia; el backend lo implementa en t223.
