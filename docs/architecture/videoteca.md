# Plugin videoteca (M15 — v2.13.0)

**Spec técnica del ADR-0030**: catálogo de series/películas con embed multi-plataforma y metadatos de terceros.

## 1. Objetivo

Agregar a la plataforma un plugin `videoteca` (`@webs/plugin-videoteca`) que provea catálogo de películas y series (temporadas/episodios), embed de video server-side (oEmbed + video propio) y enriquecimiento de metadatos desde TMDB/Wikipedia, todo scoped multi-tenant y sin dependencias de pago.

## 2. Modelo de datos

Agregado con raíz `ScreenWork` (única con `organizationId`); hijas scoped transitivamente.

```prisma
model ScreenWork {
  id             String   @id @default(uuid())
  organizationId String
  type           String   // 'movie' | 'series'
  title          String
  originalTitle  String?
  synopsis       String?
  year           Int?
  genres         Json     @default("[]") // string[]
  posterUrl      String?
  backdropUrl    String?
  rating         Float?
  tmdbId         String?
  wikidataId     String?
  imdbId         String?  // ttNNN
  tvdbId         String?
  letterboxdSlug String?
  justwatchSlug  String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  seasons    Season[]
  sources    VideoSource[]
  downloads  DownloadLink[]

  @@unique([organizationId, tmdbId])
  @@index([organizationId, type])
  @@map("videoteca_works")
}

model Season {
  id        String   @id @default(uuid())
  workId    String
  number    Int
  title     String?
  synopsis  String?
  posterUrl String?
  order     Int      @default(0)
  work      ScreenWork @relation(fields: [workId], references: [id], onDelete: Cascade)
  episodes  Episode[]

  @@unique([workId, number])
  @@map("videoteca_seasons")
}

model Episode {
  id          String  @id @default(uuid())
  seasonId    String
  number      Int
  title       String?
  synopsis    String?
  runtime     Int?
  thumbnailUrl String?
  order       Int     @default(0)
  season      Season  @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  sources     VideoSource[]

  @@unique([seasonId, number])
  @@map("videoteca_episodes")
}

model VideoSource {
  id         String  @id @default(uuid())
  workId     String
  episodeId  String?
  platform   String  // youtube|vimeo|dailymotion|twitch|tiktok|self
  url        String
  embedHtml  String?
  order      Int     @default(0)
  kind       String  // 'embed' | 'file'
  work       ScreenWork @relation(fields: [workId], references: [id], onDelete: Cascade)
  episode    Episode?  @relation(fields: [episodeId], references: [id], onDelete: Cascade)

  @@index([workId])
  @@index([episodeId])
  @@map("videoteca_sources")
}

model DownloadLink {
  id       String  @id @default(uuid())
  workId   String
  platform String
  label    String
  url      String
  kind     String  // 'official' | 'own-file'
  order    Int     @default(0)
  work     ScreenWork @relation(fields: [workId], references: [id], onDelete: Cascade)

  @@index([workId])
  @@map("videoteca_download_links")
}
```

**Scoping fail-closed**: cada query hace join por `workId`/`seasonId` a `ScreenWork.organizationId` (o valida el padre en el write). Un POST/PATCH con un `workId`/`seasonId` de otra organización devuelve 403/404.

## 3. Embed de video (oEmbed server-side + SSRF)

### 3.1 Resolución oEmbed

`apps/api/src/lib/oembed.ts`:

```ts
const OEMBED_PROVIDERS: Record<string, { endpoint: string; pattern: RegExp }> = {
  youtube:    { endpoint: 'https://www.youtube.com/oembed', pattern: /youtube\.com|youtu\.be/ },
  vimeo:      { endpoint: 'https://vimeo.com/api/oembed.json', pattern: /vimeo\.com/ },
  dailymotion:{ endpoint: 'https://www.dailymotion.com/services/oembed', pattern: /dailymotion\.com/ },
  twitch:     { endpoint: 'https://api.twitch.tv/v5/oembed', pattern: /twitch\.tv/ },
  tiktok:     { endpoint: 'https://www.tiktok.com/oembed', pattern: /tiktok\.com/ },
};

async function resolveOEmbed(url: string): Promise<{ html: string; provider: string } | null>;
```

### 3.2 Protección SSRF (patrón ADR-0024 §3)

Antes de resolver, se valida el host del `url`:

- Denegar loopback/privado: `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`.
- Sólo `http`/`https`.
- `AbortSignal.timeout(5000)` y tope de respuesta 512 KB.
- Caché con TTL.
- Allowlist adicional `OEMBED_ALLOWLIST` (hosts separados por coma).

El `html` devuelto se **sanea** con `sanitize-html`: sólo `iframe`/`blockquote`; se eliminan `script`, `on*` y `srcdoc`. Nunca se persiste HTML crudo no saneado en `VideoSource.embedHtml`.

### 3.3 Video propio

`kind: 'file'`, `platform: 'self'`, `url` = URL del storage (firmada/allowlist). El frontend renderiza `<video controls src={url}>` directo, sin oEmbed.

## 4. Conectores de metadatos

### 4.1 TMDB (primaria)

- Endpoint proxy server-side: `POST /metadata/lookup` (body `{ title, type, year? }`).
- API key por tenant en settings (`tmdbApiKey`, secret cifrado con `encrypt()` de `apps/api/src/lib/crypto.ts`, AES-256-GCM).
- Caché por `title+type+year` (TTL 24 h). Sin scraping.
- Atribución obligatoria en UI y docs: «This product uses the TMDB API but is not endorsed or certified by TMDB».

### 4.2 Wikipedia / Wikidata (respaldo)

- Gratis, sin key: `GET /metadata/lookup` cae a `https://www.wikidata.org` / REST de Wikipedia si TMDB no está configurado o no encuentra el título.
- Rellena `synopsis` (resumen) y `wikidataId`; no sustituye a TMDB.

### 4.3 IDs externos (links salientes)

`imdbId`/`tvdbId`/`letterboxdSlug`/`justwatchSlug` se persisten y se renderizan como botones «Ver en IMDb/TheTVDB/Letterboxd/JustWatch». Nunca se scrapean.

## 5. Botón ver/descargar

- `DownloadLink.kind === 'official'`: plataformas oficiales (Netflix, Prime Video, Apple TV, YouTube Movies, etc.).
- `DownloadLink.kind === 'own-file'`: archivos propios con derechos.
- El frontend muestra el **disclaimer legal**: «Enlaces a servicios oficiales; Webs no aloja ni distribuye contenido protegido.» Template legal: `docs/legal/10-videoteca-derechos-de-autor-y-cumplimiento.md` (DMCA/Ley 11.723, ToS de TMDB, CC BY-SA de Wikipedia/Wikidata, no-scraping y embedding oEmbed).
- No existe endpoint de rip/descarga del contenido protegido.

## 6. Estructura del plugin (`plugin.json`)

```json
{
  "id": "videoteca",
  "name": "@webs/plugin-videoteca",
  "version": "1.0.0",
  "type": "plugin",
  "category": "contenido",
  "apiVersion": "1.0.0",
  "permissions": ["videoteca.read", "videoteca.manage"],
  "menu": [
    { "path": "/admin/videoteca", "section": "contenido", "order": 5, "target": "admin", "permissions": ["videoteca.manage"] }
  ],
  "settings": {
    "tmdbApiKey": { "type": "string", "secret": true },
    "attribution": { "type": "string", "default": "This product uses the TMDB API but is not endorsed or certified by TMDB." },
    "embedAllowedProviders": { "type": "array", "default": ["youtube", "vimeo", "dailymotion", "twitch", "tiktok"] },
    "enableWikipediaFallback": { "type": "boolean", "default": true }
  },
  "entry": "./dist/server.js",
  "clientEntry": "./dist/client.js"
}
```

Ruta pública: `/videoteca` (catálogo + detalle) vía `clientEntry` (`defineClientPlugin`).

## 7. Permisos

| Permiso | Descripción | Área |
|---------|-------------|------|
| `videoteca.read` | Ver catálogo, detalle y fuentes de video. | `contenido` |
| `videoteca.manage` | CRUD de obras/temporadas/episodios, fuentes, enlaces de descarga y metadatos. | `contenido` |

Se declaran en `manifest.permissions` y se registran con `registerPluginPermissions` (aparecen en `GET /permissions`, agrupados por `area` vía `groupPermissionCatalog`).

## 8. Endpoints REST

Base: `/api/v1/plugins/videoteca`.

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| GET | `/works` | público | Catálogo (`?type=&genre=&search=&page=&pageSize=`) |
| GET | `/works/:id` | público | Detalle + `seasons[]`/`episodes[]`/`sources[]`/`downloads[]` |
| GET | `/works/:id/sources` | público | Fuentes con `embedHtml` resuelto (oEmbed server-side) |
| POST | `/works` | `videoteca.manage` | Crear obra (movie/series) |
| PATCH | `/works/:id` | `videoteca.manage` | Editar obra |
| DELETE | `/works/:id` | `videoteca.manage` | Borrar obra (cascada) |
| POST | `/works/:id/seasons` | `videoteca.manage` | Crear temporada |
| PATCH | `/seasons/:id` | `videoteca.manage` | Editar temporada |
| DELETE | `/seasons/:id` | `videoteca.manage` | Borrar temporada |
| POST | `/seasons/:id/episodes` | `videoteca.manage` | Crear episodio |
| PATCH | `/episodes/:id` | `videoteca.manage` | Editar episodio |
| DELETE | `/episodes/:id` | `videoteca.manage` | Borrar episodio |
| POST | `/works/:id/sources` | `videoteca.manage` | Agregar fuente (embed o archivo) |
| DELETE | `/sources/:id` | `videoteca.manage` | Quitar fuente |
| POST | `/works/:id/downloads` | `videoteca.manage` | Agregar enlace de descarga |
| DELETE | `/downloads/:id` | `videoteca.manage` | Quitar enlace |
| POST | `/metadata/lookup` | `videoteca.manage` | Proxy TMDB/Wikipedia (enriquecimiento) |
| POST | `/metadata/import` | `videoteca.manage` | Importar obra desde TMDB → `ScreenWork` |

## 9. Trazabilidad M15

| WB | Alcance | Sección |
|----|---------|---------|
| WB-145 | ADR + spec | ADR-0030 + este documento |
| WB-146 | modelo de datos | §2 |
| WB-147 | embed oEmbed | §3 |
| WB-148 | ver/descargar | §5 |
| WB-149 | TMDB | §4.1 |
| WB-150 | Wikipedia/Wikidata + IDs | §4.2–4.3 |
| WB-151 | frontend | §6 (ruta pública `/videoteca`) |
| WB-152 | i18n/docs | claves `videoteca.*` ES/EN/PT + docs |
| WB-153 | QA/release v2.13.0 | — |
