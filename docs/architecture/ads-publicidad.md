# Plugin de publicidad (ads) — entrega, tracking y consentimiento

> Spec técnica del ADR-0033 (Milestone 18, v2.16.0). Plugin `ads`
> (`@webs/plugin-ads`) como motor de publicidad nativo: modelo de datos agregado,
> entrega server-side rotativa, conectores third-party condicionados a
> consentimiento IAB TCF v2.2, y tracking anti-fraude.

## 1. Alcance

- **WB-172** — publicidad de terceros (AdSense / Ad Manager / script genérico).
- **WB-173** — self-serve: anunciante → campaña → creatividad → slot → targeting → rotación.
- **WB-174** — ubicaciones: `header`, `sidebar`, `in-content`, `footer`, `video` (preroll/midroll), `sticky`.
- **WB-175** — tracking agregado por hora/día + dedupe + anti-fraude.
- **WB-176** — consentimiento CMP / IAB TCF v2.2 (bloqueo de scripts hasta consentir).
- **WB-177** — admin `/admin/ads`.
- Multi-tenant embebido (scoping `organizationId` fail-closed) en WB-172/173/175.

## 2. Modelo de datos (schema.prisma, migración nueva)

Todas las tablas con `organizationId` (ADR-0006).

```prisma
enum AdZone        { header sidebar in-content footer video sticky }
enum AdPlacementType { third-party propia }
enum AdCampaignStatus { draft active paused ended }
enum AdCreativeType { image text html script-externo }

model AdPlacement {
  id             String   @id @default(uuid())
  organizationId String
  key            String                 // único por org
  zone           AdZone
  type           AdPlacementType
  label          String
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([organizationId, key])
  @@map("ad_placements")
}

model AdCampaign {
  id             String   @id @default(uuid())
  organizationId String
  advertiserId   String?
  name           String
  startDate      DateTime
  endDate        DateTime?
  budget         Int                    // centavos
  status         AdCampaignStatus @default(draft)
  targeting      Json     @default("{}")
  schedule       Json     @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([organizationId, status])
  @@map("ad_campaigns")
}

model AdCreative {
  id          String   @id @default(uuid())
  campaignId  String
  type        AdCreativeType
  mediaUrl    String?
  assetId     String?
  text        String?
  urlDestino  String
  width       Int?
  height      Int?
  createdAt   DateTime @default(now())
  @@index([campaignId])
  @@map("ad_creatives")
}

model AdStat {
  id            String   @id @default(uuid())
  organizationId String
  placementId   String
  creativeId    String
  day           DateTime               // truncado a medianoche UTC
  impressions   Int      @default(0)
  clicks        Int      @default(0)
  @@unique([organizationId, placementId, creativeId, day])
  @@index([organizationId, day])
  @@map("ad_stats")
}
```

**Contadores agregados por día**: el beacon de impresión hace `upsert` sobre el
`@@unique` incrementando `impressions`; el clic incrementa `clicks`. Reportes por
hora se derivan agrupando en la ventana del día (o, si hace falta granularidad
horaria, se agrega columna `hour`; el ADR fija día como mínimo viable).

## 3. Sección de ajustes `ads` (registerSettingSection)

```ts
// plugins/ads/src/server.ts — en register
registerSettingSection({
  key: 'ads',
  group: 'monetizacion',
  schema: { /* JsonSchema */ },
  defaults: {
    consentRequired: false,
    cmpVendorName: 'Webs Ads',
    adSensePublisherId: '',        // ca-pub-… (x-ui.secret)
    autoAdsEnabled: false,
    genericScript: '',             // paste de terceros (criptografiado)
    allowedDomains: [],            // SSRF allowlist
    defaultTargeting: {},
  },
});
```

`getSectionValue(fastify, 'ads')` (con caché Redis 60 s) alimenta el `GET
/placements` y el banner CMP. `adSensePublisherId` y `genericScript` se marcan
`x-ui.secret` para que `decryptSecretFields` los cifre en reposo (mismo patrón
que `apps/api/src/modules/settings/service.ts:45`).

## 4. Motor de entrega

```
Cliente (página)                            API /api/v1/plugins/ads/*
      │  GET /public/placements/:key
      │  ── resuelve org por Host (ADR-0017)
      │  ── AdPlacement enabled + key match
      │  ── AdCampaign status=active, startDate<=now<=endDate
      │  ── targeting match (device/geo/utm de request)
      │  ── weighted round-robin entre creatividades
      ▼
      { type, text, mediaUrl, urlDestino,
        clickUrl, trackImpressionUrl }        // JSON sin scripts third-party
      │
      │  POST /public/impression/:token      // HMAC(placement,creative,day)
      │  ── dedupe cookie ads_seen:<day> + rate-limit
      │  ── AdStat.upsert impressions++
      │
      │  GET /public/click/:token            // HMAC + dedupe + anti-fraude
      ▼  ── AdStat.clicks++ → 302 Location: urlDestino (noopener)
```

- El `token` (`statToken`) es una firma HMAC (clave `ADS_TRACKING_SECRET`) sobre
  `placementId|creativeId|day|orgId`; el frontend no puede inflar contadores ni
  forjar tokens.
- El endpoint público **nunca** devuelve el script de terceros. El script (auto
  ads o genérico) se inyecta en el cliente **solo tras consentimiento** (§6).

## 5. Conectores third-party

| Conector | Config | Emisión |
|---|---|---|
| AdSense auto ads | `adSensePublisherId` (`ca-pub-…`) + `autoAdsEnabled` | `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-…" crossorigin="anonymous">` |
| AdSense manual | `data-ad-slot` por unidad | `<ins class="adsbygoogle" data-ad-client="ca-pub-…" data-ad-slot="…">` + `<script>(adsbygoogle=…).push({})</script>` |
| Script genérico | `genericScript` (textarea) | se inyecta tal cual (saneado de `javascript:` en URLs) |

Todos condicionados a `consent === 'granted'` (fail-closed).

## 6. Consentimiento (IAB TCF v2.2)

- Banner CMP propio (sin SaaS): capas "Aceptar / Rechazar / Configurar".
- Persiste `tcString` + propósitos en `localStorage` y cookie `webs_consent`.
- `GET /public/placements/:key` devuelve además
  `consent: 'granted' | 'denied' | 'pending'`.
- `consentRequired=true` ⇒ no se inyecta ningún script third-party hasta
  `granted`; `false` ⇒ publicidad propia directa (cookies funcionales).
- EEA/UK/CH: `consentRequired` se activa por organización o por geolocalización
  del request (opcional, `defaultTargeting.geo`).

## 7. Ubicaciones y preroll

| zone | Punto de integración (frontend) |
|---|---|
| `header` | `SiteHeader` (slot `header`) |
| `sidebar` | layouts con sidebar (`AdminLayout`/públicas) |
| `in-content` | entre párrafos/bloques de `Page.layout` (slot `content`) |
| `footer` | `SiteFooter` (slot `footer`) |
| `sticky` | contenedor flotante (mobile bottom) |
| `video` | hook `preroll`/`midroll` del reproductor de videoteca M15 |

El reproductor de videoteca (M15) aún no expone el hook (verificado en
`apps/web/src`); la integración `video` se completa cuando el reproductor llame a
`GET /public/placements/:key` con `zone=video` antes del playback.

## 8. Endpoints REST

| Método | Ruta (bajo `/api/v1/plugins/ads`) | Permiso | Descripción |
|---|---|---|---|
| GET | `/public/placements/:key` | público | entrega rotativa + consent state |
| POST | `/public/impression/:token` | público (rate-limit) | beacon impresión (dedupe) |
| GET | `/public/click/:token` | público (rate-limit) | redirect 302 + clic |
| GET | `/placements` | `ads.read` | listar ubicaciones (admin) |
| POST | `/placements` | `ads.manage` | crear ubicación |
| PATCH | `/placements/:id` | `ads.manage` | editar |
| DELETE | `/placements/:id` | `ads.manage` | borrar |
| GET | `/campaigns` | `ads.read` | listar campañas |
| POST | `/campaigns` | `ads.manage` | crear campaña (self-serve) |
| PATCH | `/campaigns/:id` | `ads.manage` | editar / cambiar estado |
| DELETE | `/campaigns/:id` | `ads.manage` | borrar |
| POST | `/campaigns/:id/creatives` | `ads.manage` | subir creatividad |
| GET | `/stats?from=&to=&placementId=&campaignId=` | `ads.read` | reportes agregados (WB-175) |
| GET | `/export.csv?from=&to=` | `ads.read` | CSV de stats |

## 9. plugin.json

```json
{
  "id": "ads",
  "name": "@webs/plugin-ads",
  "category": "marketing",
  "feature": "ads",
  "permissions": ["ads.read", "ads.manage"],
  "provides": ["ads"],
  "menu": [
    { "id": "admin", "path": "/admin/ads", "section": "ventas",
      "order": 8, "target": "admin", "permissions": ["ads.read"] }
  ],
  "slots": ["header", "content", "footer"],
  "settings": { /* sección ads (ver §3) */ }
}
```

`feature:'ads'` = 11ª feature premium (área `extensions`, `core:false`) en
`apps/api/src/modules/licenses/features.ts`; gating de instalación 403 (ADR-0019).

## 10. Seguridad

- **SSRF-safe**: `mediaUrl`/`script-externo` validados contra `allowedDomains` +
  denegación de rangos privados (patrón link-preview M10 / ADR-0028 §2).
- **CSP**: al activar ads se sugieren los orígenes de AdSense en
  `security.contentSecurityPolicy` (hoy vacío; `apps/api/src/modules/settings/sections.ts:1178`).
- **Anti-fraude**: `noopener`, sin auto-clic de anunciante, rate-limit en
  beacons/clicks, dedupe por cookie + firma HMAC.
- **Scoping**: `organizationId` fail-closed vía `resolveTenant`/hostname.

## 11. Trazabilidad M18 (docs/backlog.md §3.19)

| WB | Frente | Tarea |
|---|---|---|
| WB-171 | ADR-0033 + spec | t241 |
| WB-172 | publicidad de terceros | t242 |
| WB-173 | self-serve anunciante→campaña→creatividad→slot | t243 |
| WB-174 | ubicaciones + preroll/midroll/sticky | t244 |
| WB-175 | tracking agregado + dedupe + anti-fraude | t245 |
| WB-176 | consentimiento CMP/IAB TCF v2.2 | t246 |
| WB-177 | admin `/admin/ads` | t247 |
| WB-178 | i18n | t248 |
| WB-179 | legal AdSense/consentimiento/transparencia | t249 |
| WB-180 | QA | t250 |
| WB-181 | release v2.16.0 | t251 |
