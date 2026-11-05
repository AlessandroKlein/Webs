# ADR-0033: Plugin de publicidad (ads) — entrega, tracking y consentimiento

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 18, v2.16.0)
- **Decisión:** Plugin `ads` (`@webs/plugin-ads`) como motor de publicidad nativo con modelo de datos agregado, entrega server-side rotativa, conectores third-party (AdSense/script genérico) condicionados a consentimiento IAB TCF v2.2, y tracking anti-fraude con dedupe.

## Contexto

Webs necesita monetizar (publicidad propia + de terceros) sin depender de una
pasarela de pago ni de SaaS externo, coherente con `docs/architecture/base-universal.md`
y `docs/architecture/politica-dependencias.md`. El M18 (v2.16.0, `docs/backlog.md`
§3.19, WB-171→WB-181) cubre: anuncios de terceros, self-serve de anunciantes,
ubicaciones (header/sidebar/in-content/footer/preroll/sticky), tracking agregado,
consentimiento GDPR/ePrivacy, admin y legal.

Anclas verificadas hoy:

- `apps/api/prisma/schema.prisma` NO tiene modelos de publicidad (sin colisión).
- `plugins/` NO tiene el directorio `ads` (se crea en t242+).
- `apps/api/src/modules/settings/registry.ts` expone `registerSettingSection({key,group,schema,defaults})`
  para que el plugin registre su sección `ads` (el `loader` invoca el `register`
  del plugin; ver `apps/api/src/plugins/loader.ts`).
- `apps/api/src/modules/settings/service.ts:29` `getSectionValue(fastify, key)` →
  `SettingSectionValue {key,group,schema,defaults,value}` con caché Redis 60 s y
  descifrado de secretos.
- `apps/api/src/plugins/helmet.ts:8` `contentSecurityPolicy: false` (desactivado);
  `apps/api/src/modules/settings/sections.ts:1178-1185` expone `security.contentSecurityPolicy`
  (vacío = desactivado) — el CSP del plugin ads se integra ahí.
- `apps/api/src/plugins/loader.ts:197` monta las rutas del plugin bajo
  `/api/v1/plugins/<id>`; `registerPluginPermissions` (:213) siembra
  `manifest.permissions`.
- Reproductor de videoteca (M15): aún no implementado en `apps/web/src`
  (verificado — sin `VideoPlayer`/preroll); el slot `zone:'video'` se integra
  cuando el reproductor exponga un hook de preroll/midroll.

## Decisión

### 1. Modelo de datos agregado

Cuatro tablas en `apps/api/prisma/schema.prisma` (migración nueva), scoped a
`organizationId` (ADR-0006, fail-closed):

| Modelo | Campos clave | Nota |
|---|---|---|
| `AdPlacement` | `id`, `organizationId`, `key` (`@unique([organizationId,key])`), `zone` (`header|sidebar|in-content|footer|video|sticky`), `type` (`third-party|propia`), `label`, `enabled` | una ubicación por zona |
| `AdCampaign` | `id`, `organizationId`, `advertiserId`, `name`, `startDate`, `endDate`, `budget`, `status` (`draft|active|paused|ended`), `targeting Json`, `schedule Json` | self-serve anunciante |
| `AdCreative` | `id`, `campaignId`, `type` (`image|text|html|script-externo`), `mediaUrl`, `assetId?`, `text`, `urlDestino`, `width`, `height` | la creatividad concreta |
| `AdStat` | `id`, `placementId`, `creativeId`, `organizationId`, `day`, `impressions`, `clicks`, `@@unique([organizationId,placementId,creativeId,day])` | contadores AGREGADOS por día |

Decisión: **una fila por día** (no una por impresión). El beacon de impresión
hace un `upsert` que incrementa el contador; los reportes leen pocas filas y
ocupan un espacio acotado (varios órdenes de magnitud menos que el log crudo).

### 2. Motor de entrega server-side

- `GET /api/v1/plugins/ads/public/placements/:placementKey` → resuelve la
  organización por hostname (ADR-0017) → campañas `active` dentro de ventana de
  fechas + targeting → rotación (weighted round-robin) → JSON:

  ```json
  { "type": "image", "text": null, "mediaUrl": "…", "urlDestino": "…",
    "clickUrl": "/api/v1/plugins/ads/public/click/:statToken",
    "trackImpressionUrl": "/api/v1/plugins/ads/public/impression/:statToken" }
  ```

- Beacon de impresión: `POST …/impression/:statToken` (token = HMAC firmado del
  placement+creative+day, para que el frontend no invente contadores). Dedupe por
  cookie `ads_seen:<day>` + firma; rate-limit (`createRateLimiter`, ver
  `apps/api/src/lib/rate-limiter.ts`).
- Clic: `GET …/click/:statToken` → registra clic (dedupe, anti-fraude) → `302`
  a `urlDestino` (con `rel="noopener"`). Nunca se renderiza un enlace directo
  al destino (siempre pasa por el redirect, para contar).

### 3. Conectores third-party

- **AdSense**: `publisherId` (`ca-pub-…`) + auto ads (script
  `pagead2.googlesyndication.com/pagead/js/adsbygoogle.js`) + unidades manuales
  (`<ins class="adsbygoogle" data-ad-slot="…">`).
- **Script genérico paste**: un textarea donde el administrador pega el bloque
  HTML/script de la red publicitaria (Ad Manager, etc.).
- Regla dura: **solo se emiten tras consentimiento** (ver §4). Sin consentimiento
  no se inyecta ningún script de terceros (ni auto ads ni manuales).

### 4. Consentimiento GDPR/ePrivacy (IAB TCF v2.2)

- Banner CMP propio (sin depender de una CMP SaaS) que implementa el protocolo
  IAB Transparency & Consent Framework v2.2 — requisito de Google para EEA/UK/CH
  vigente desde enero de 2024.
- `consentRequired: boolean` por organización (sección `ads`), por defecto
  `false` para orgs fuera de EEA/UK/CH.
- Semántica fail-closed: `consentRequired=true` ⇒ ningún script de terceros se
  carga hasta que el usuario consiente; la publicidad propia (`type:'propia'`) no
  requiere consentimiento (solo cookies funcionales).
- Almacena la cadena TC (`tcString`) y los propósitos en `localStorage` +
  cookie; el `GET /placements` devuelve `consent: 'granted'|'denied'|'pending'`.

### 5. Multi-tenant scoping

`organizationId` obligatorio en los 4 modelos; resolución fail-closed por
hostname (`Organization.domain`, ADR-0017) con `resolveTenant`/`requireTenant`
(`apps/api/src/lib/tenant.ts`). Un placement de una sucursal jamás resuelve en
otra.

### 6. Seguridad

- **SSRF-safe**: las creatividades `script-externo` y `mediaUrl` externas pasan
  por el validador de URLs (deniega rangos privados — mismo patrón de link-preview
  M10 / ADR-0024 §3 / ADR-0028) y allowlist de dominios por placement.
- **CSP**: el script de terceros se integra con `security.contentSecurityPolicy`
  (hoy vacío = desactivado); al habilitar ads se sugieren los orígenes exactos
  (`pagead2.googlesyndication.com`, `*.googlesyndication.com`, `tpc.googlesyndication.com`).
- **Anti-fraude**: sin clics propios/incentivados (el anunciante no puede
  auto-clickear su campaña), rate-limit en beacons, dedupe por cookie+firma HMAC,
  `noopener` en todos los enlaces salientes.
- Permisos: `ads.read` / `ads.manage` (catálogo, `registerPluginPermissions`),
  sección admin `/admin/ads` (WB-177) con `ads.manage`.

## Consecuencias

### Positivas

- Publicidad de primera clase (propia + terceros) sin SaaS ni pasarela de pago.
- Tracking barato (agregado por día) y resistente a fraude básico.
- Consentimiento correcto desde el día uno (TCF v2.2) — requisito de AdSense.
- Scoping multi-tenant fail-closed coherente con el resto de la plataforma.

### Negativas

- El banner CMP propio es más trabajo que integrar una CMP SaaS (se asume a
  propósito por la política "sin modo de pago").
- El tracking agregado pierde granularidad por impresión (aceptado: suficiente
  para métricas por hora/día WB-175).
- La rotación weighted round-robin es más simple que un motor de subasta; el
  self-serve (WB-173) arranca con targeting por `targeting JSON` (device/geo/utm)
  y no puja en tiempo real.

## Notas

- Trazabilidad M18 (`docs/backlog.md` §3.19): WB-171→t241 (este ADR), WB-172→t242
  (terceros), WB-173→t243 (self-serve), WB-174→t244 (ubicaciones), WB-175→t245
  (tracking), WB-176→t246 (consentimiento), WB-177→t247 (admin), WB-178→t248
  (i18n), WB-179→t249 (legal), WB-180→t250 (QA), WB-181→t251 (release v2.16.0).
- El `zone:'video'` (preroll/midroll) queda pendiente del hook del reproductor de
  videoteca M15; el modelo y la entrega ya lo contemplan, solo falta el punto de
  integración en el reproductor.
- Relación con ADR-0019 (feature-gating): el plugin `ads` declara
  `feature:'ads'` (nueva 11ª feature premium, área `extensions`, `core:false`),
  gating de instalación igual que el resto.
