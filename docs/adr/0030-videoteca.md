# ADR-0030: Plugin videoteca (series/películas, embed multi-plataforma y metadatos de terceros)

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 15 — v2.13.0)
- **Decisión:** Plugin `videoteca` (`@webs/plugin-videoteca`) con una entidad agregada `ScreenWork` (`type: movie|series`) + `Season`/`Episode`/`VideoSource`/`DownloadLink`, todo scoped por `organizationId`. Embed de video por **oEmbed server-side** con allowlist de proveedores (YouTube/Vimeo/Dailymotion/Twitch/TikTok) y protección SSRF; video propio mp4/HLS vía `<video>` directo. Metadatos con **TMDB como fuente primaria** (API key por tenant, atribución obligatoria) y Wikipedia/Wikidata como respaldo; IDs externos (IMDb/TheTVDB/Letterboxd/JustWatch) sólo como enlaces salientes. Botón ver/descargar con enlaces oficiales + archivos propios con derechos (nunca rip).

## Contexto

La plataforma ya es una base multi-app (blog/tienda/gimnasio/logística) compuesta por plugins (`docs/architecture/base-universal.md`). El Milestone 15 agrega una **videoteca** (series y películas) como un plugin más, no como una app separada.

Requisitos clave derivados de la investigación previa (backlog M15, WB-145→WB-153):

- Catálogo de películas y series con temporadas/episodios, multi-tenant por sucursal (ADR-0006).
- Embed de video sin depender de un iframe pegado por el usuario: hay que resolver **oEmbed en el servidor** (el cliente no debe hablar con los proveedores ni exponer la clave) y protegerse contra **SSRF** (mismo patrón que el link-preview del compositor social, ADR-0024 §3).
- Metadatos enriquecidos de fuentes **legales y sin scraping**: TMDB (API con key) como primaria, Wikipedia/Wikidata gratis como respaldo; los IDs de IMDb/TheTVDB/Letterboxd/JustWatch sólo se usan como **enlaces salientes**.
- El botón «ver/descargar» sólo apunta a plataformas oficiales y archivos propios con derechos; **nunca** rip ni descarga de contenido protegido.

## Decisión

### 1. Modelo de datos (agregado `ScreenWork`, scoped)

- `ScreenWork` es la raíz del agregado y la única que porta `organizationId` (raíz del scoping, patrón ADR-0006). `Season`, `Episode`, `VideoSource` y `DownloadLink` son hijas que se escopean **transitivamente** por su `workId`/`seasonId` (cada query hace join al padre para el filtro de org; cada write valida que el padre pertenezca al tenant — fail-closed).
- Campos de `ScreenWork`: `id`, `organizationId`, `type: 'movie' | 'series'`, `title`, `originalTitle?`, `synopsis?`, `year?`, `genres Json` (`string[]`), `posterUrl?`, `backdropUrl?`, `rating?`, `tmdbId?`, `wikidataId?`, `imdbId?` (`ttNNN`), `tvdbId?`, `letterboxdSlug?`, `justwatchSlug?`, `createdAt`, `updatedAt`. Índices `@@index([organizationId, type])` y `@@unique([organizationId, tmdbId])` (nulo no colisiona).
- `Season { id, workId, number, title?, synopsis?, posterUrl?, order }` `@@unique([workId, number])`.
- `Episode { id, seasonId, number, title?, synopsis?, runtime?, thumbnailUrl?, order }` `@@unique([seasonId, number])`.
- `VideoSource { id, workId, episodeId?, platform, url, embedHtml?, order, kind: 'embed' | 'file' }` `@@index([workId])` `@@index([episodeId])`. Para películas `episodeId` es nulo (fuente a nivel obra); para series la fuente puede colgar de la obra (trailer) o del episodio.
- `DownloadLink { id, workId, platform, label, url, kind: 'official' | 'own-file', order }` `@@index([workId])`.

### 2. Embed de video: oEmbed server-side + SSRF

- `apps/api/src/lib/oembed.ts`: `resolveOEmbed(url): Promise<{ html: string; provider: string } | null>` con un mapa **allowlist** `OEMBED_PROVIDERS` (YouTube, Vimeo, Dailymotion, Twitch, TikTok → endpoints de descubrimiento `oembed.com`/nativos).
- **SSRF-safe** (mismo patrón que el link-preview de M10, ADR-0024): denegar loopback/privado `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`; sólo `http`/`https`; timeout (`AbortSignal.timeout(5000)`); tope de respuesta (512 KB); caché con TTL. Allowlist adicional vía `OEMBED_ALLOWLIST`.
- El `html` devuelto se **sanea** (sólo `iframe`/`blockquote`, se descarta `script`/event handlers; `sanitize-html`).
- **Video propio** mp4/HLS: `kind: 'file'`, `platform: 'self'`, sin oEmbed; el frontend renderiza `<video controls src>`. El `src` debe ser una URL firmada/allowlist del storage, no una URL arbitraria.

### 3. Conectores de metadatos

- **TMDB (primaria)**: `GET /api/v1/plugins/videoteca/metadata/lookup` es un **proxy server-side**; la API key vive en settings del plugin por tenant (`tmdbApiKey`, `x-ui.secret`, AES-256-GCM como el resto de secretos). Atribución obligatoria en UI y docs: «This product uses the TMDB API but is not endorsed or certified by TMDB». Caché de respuestas + sin scraping.
- **Wikipedia/Wikidata (respaldo)**: gratis, sin key; para sinopsis e IDs (`wikidataId`). Nunca se reemplaza a TMDB, sólo complementa.
- **OMDb (ratings + lookup por IMDb)**: clave free (1 000 req/día) para ratings de IMDb/Rotten Tomatoes/Metacritic y lookup por IMDb ID (`ttNNN`). Los pósters de OMDb requieren tier de pago (Patreon) → **no** se usan (se usa `posterUrl` de TMDB). Complementa a TMDB, no la reemplaza.
- **TVMaze (series TV)**: gratis sin clave, para episodios/calendario de series. Límite 20 calls/10 s por IP; licencia **CC BY-SA** → atribución + share-alike obligatorias en UI y docs. Complementa a TMDB para el calendario de series.
- **IDs externos**: `imdbId`, `tvdbId`, `letterboxdSlug`, `justwatchSlug` se persisten como **links salientes** (botones «Ver en IMDb/JustWatch…»), nunca se scrapean.

### 4. Botón ver/descargar

- `DownloadLink.kind: 'official'` → plataformas oficiales (Netflix/Prime Video/Apple TV/YouTube Movies, etc.); `kind: 'own-file'` → archivos propios con derechos.
- El frontend renderiza un **disclaimer legal** junto al botón («Enlaces a servicios oficiales; Webs no aloja ni distribuye contenido protegido»). Sin endpoint de descarga/rip del lado del servidor.

### 5. Estructura del plugin

- `id: videoteca`, `package: @webs/plugin-videoteca`, `category: "contenido"`, `apiVersion`/`type` canónicos (`PLUGIN_MANIFEST_FILENAME='plugin.json'`).
- `settings`: `tmdbApiKey` (secret), `attribution` (texto, default TMDB), `embedAllowedProviders` (array, default 5 proveedores), `enableWikipediaFallback` (bool).
- `menu[]`: `{ path: '/admin/videoteca', section: 'contenido', order, target: 'admin', permissions: ['videoteca.manage'] }`.
- `permissions`: `videoteca.read`, `videoteca.manage` (se registran vía `registerPluginPermissions`, aparecen en `GET /permissions` bajo area `contenido`).
- Ruta pública: `/videoteca` (catálogo + detalle) vía `clientEntry`; los endpoints REST cuelgan de `/api/v1/plugins/videoteca`.

## Consecuencias

**Positivas**

- El embed queda desacoplado del cliente y blindado contra SSRF y contra `script` inyectado por un proveedor.
- Metadatos legales y atribuidos; sin scraping ni dependencia de servicios de pago (coherente con `politica-dependencias.md`).
- Reutiliza patrones ya decididos: scoping ADR-0006, secretos AES-256-GCM (`lib/crypto.ts`), SSRF ADR-0024/0028, permisos de plugins ADR-0018.

**Negativas**

- TMDB requiere una API key por tenant (el operador la configura); sin key, el plugin degrada a entrada manual + Wikipedia.
- El scoping transitivo (hijas sin `organizationId` propio) exige validar el padre en cada write; si se omite, hay riesgo de escritura cruzada (se documenta como fail-closed).
- La lista de proveedores oEmbed es fija salvo allowlist; proveedores no previstos requieren editar settings y, si su endpoint no es estándar, código.

## Notas

- Anclado en: `apps/api/prisma/schema.prisma` (sin colisión: no existen `Season`/`Episode`/`VideoSource`/`DownloadLink`/`ScreenWork`), `apps/api/src/lib/crypto.ts` (AES-256-GCM), patrón SSRF de ADR-0024 §3 y ADR-0028, permisos de plugins (ADR-0018, `registerPluginPermissions`).
- Trazabilidad M15: WB-145 (ADR-0030 + spec) → WB-146 (modelo), WB-147 (embed oEmbed), WB-148 (ver/descargar), WB-149 (TMDB), WB-150 (Wikipedia/Wikidata + IDs), WB-151 (frontend), WB-152 (i18n/docs), WB-153 (QA/release v2.13.0).
- Spec técnica: `docs/architecture/videoteca.md`.

### Nota suplementaria (ampliación de conectores, post-aceptación)

El cliente corroboró 4 APIs de terceros para videoteca (M15) y tracking (M16): **TMDB, OMDb, TVMaze y Trakt.tv**. En este ADR se amplían los conectores de metadatos (§3) con **OMDb** (ratings IMDb/Rotten Tomatoes/Metacritic + lookup por IMDb ID `ttNNN`, clave free 1 000 req/día; posters vía Patreon **no**) y **TVMaze** (episodios/calendario de series TV, free sin clave, 20 calls/10 s por IP, licencia CC BY-SA → atribución + share-alike). TMDB se mantiene como fuente primaria; OMDb/TVMaze son complementarias. La trazabilidad WB (WB-145→WB-153) no cambia; el backend implementa estos conectores en t212.
