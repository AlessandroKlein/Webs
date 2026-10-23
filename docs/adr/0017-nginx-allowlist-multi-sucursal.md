# ADR-0017: Reverse-proxy con allowlist y multi-sucursal por hostname

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 5 — v2.3.0)
- **Decisión:** (1) Endurecer el `nginx` de despliegue con una **allowlist de rutas** por tenant — el
  proxy solo responde a las URLs/paths definidos en settings y rechaza (404/444) el resto; y (2) dar a
  **cada sucursal una URL propia** (subdominio/hostname) con **resolución de organización por `Host`**
  en la API, sobre la jerarquía multi-tenant ya existente (ADR-0006).

## Contexto

### nginx actual (allowlist)

`docker/nginx.conf` (36 líneas) es un proxy abierto:

- `server_name _` (catch-all) acepta cualquier host.
- `location /` sirve el SPA, `/api/` y `/ws` hacen proxy a `api:4000`, `/docs/` a Swagger.

No hay allowlist de rutas ni de hosts: cualquier path válido de la API o del frontend es alcanzable
desde cualquier dominio que resuelva al contenedor. Para un despliegue multi-sucursal esto expone toda
la superficie de la plataforma a cada tenant.

### Resolución de tenant actual (hostname)

`apps/api/src/lib/tenant.ts` resuelve la organización **exclusivamente** por credencial:

- JWT `orgId` + cabeceras `X-Org-Id`/`X-Chain-Id` (super_admin elige; los demás necesitan membresía
  activa sobre la org pedida, si no → `null` → 403 fail-closed).
- No hay resolución por `Host`/dominio. El modelo `Organization` (`schema.prisma:422-443`) tiene `slug`
  único pero **no** un campo `domain`/hostname.

Consecuencia: dos sucursales comparten la misma URL; la «sucursal activa» es una elección de sesión
(cabecera), no una propiedad del hostname. El objetivo M5 es que cada sucursal tenga su URL y que la
org se infiera del dominio, manteniendo el fail-closed.

## Decisión

### 1. Allowlist de rutas (nginx)

- Las rutas públicas se declaran en settings con clave `public_routes` (array de paths, con `*` para
  prefijos): por defecto `['/', '/api/', '/ws', '/docs/']`. El `nginx.conf` de despliegue se **genera**
  a partir de esa lista (o usa un `map $uri`/`location` por entrada) y devuelve `444` (drop) o `404`
  para cualquier path no listado.
- La lista se puede acotar por tenant: una sucursal puede habilitar solo `['/', '/api/', '/ws']` (sin
  `/docs/`), o exponer únicamente las rutas públicas de sus plugins. El `nginx` se re-genera/recarga al
  editar `public_routes` (`setting.write`).
- Los paths **siempre** denegados por defecto (no listables): endpoints internos de administración,
  `/api/v1/license/*`, `/api/v1/roles/*`, etc., salvo que el tenant los incluya explícitamente (y aun
  así siguen protegidos por RBAC en la API).

### 2. Multi-sucursal por hostname

- **`Organization` gana `domain String? @unique`** (hostname/subdominio, p. ej. `sucursal-norte.marca.ar`).
  Es opcional: una org sin `domain` no se resuelve por hostname (sigue por cabecera/JWT).
- **Resolución por `Host`**: nuevo paso `resolveTenantByHostname(host)` que, antes de `resolveTenant`,
  busca la `Organization` por `domain` (normalizado a minúsculas, sin puerto). Usa el header `Host` (o
  `X-Forwarded-Host` tras el proxy). Resultado:
  - Host con `domain` conocido → fija la `organizationId` base de la resolución. El usuario **aún** debe
    tener membresía activa sobre esa org (fail-closed); si no, 403.
  - `super_admin` puede **anular** la org del hostname con `X-Org-Id`/`X-Chain-Id` (privilegio global).
  - Host sin `domain` conocido y no raíz → se rechaza (la org raíz usa su `domain` o el dominio base).
- La consulta por `domain` se cachea (Redis, TTL corto) para no añadir una query por request.

### 3. nginx enruta por hostname

- El `nginx.conf` se genera con un `server` (o `map $host`) por dominio conocido, apuntando todos al
  mismo `api` y **preservando** `proxy_set_header Host $host` (la API lo necesita para resolver la org).
- Wildcard/DNS: el operador publica los `domain` en DNS (o wildcard `*.marca.ar`); nginx no resuelve
  DNS, solo compara `$host` con los dominios conocidos generados desde la tabla `Organization.domain`.

## Consecuencias

### Positivas

- **Aislamiento por sucursal**: cada tenant expone solo sus rutas públicas; se reduce la superficie de
  ataque y la confusión de «qué sucursal estoy viendo».
- **URL propia por sucursal** sin duplicar la API: un único despliegue sirve N hostnames, resolviendo la
  org por `Host` (escalable, stateless — coherente con ADR-0008).
- **Fail-closed conservado**: la resolución por hostname no baja la exigencia de membresía/RBAC.

### Negativas

- Requiere DNS (o wildcard) + TLS por hostname (certificados). Operación más compleja.
- El allowlist puede romper rutas de plugins si el operador no actualiza `public_routes` al instalar un
  plugin nuevo (se mitiga con default amplio + validación al guardar).
- Resolución por hostname añade una indirección (mitigada con cache) y un nuevo campo (`Organization.domain`)
  con migración + unicidad.

## Notas

- Base multi-tenant y fail-closed: ADR-0006 y `apps/api/src/lib/tenant.ts` (`resolveTenant`,
  `requireTenant`, `resolveScope`). La resolución por `Host` es un **paso previo** a `resolveTenant`.
- `docker/nginx.conf` actual es el punto de partida; `deploy/k8s/` (ingress) deberá reflejar la misma
  allowlist/hostname en su `ingress.yaml` (ADR-0008).
- La generación del `nginx.conf` desde settings es coherente con el sistema de settings/`x-ui.secret` ya
  documentado en `docs/architecture/settings-theming.md`.
