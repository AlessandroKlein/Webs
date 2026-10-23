# nginx reverse-proxy: allowlist de rutas + multi-sucursal por hostname

Webs endurece el borde HTTP con **nginx** (ADR-0017) en dos planos que se
combinan:

1. **Allowlist de rutas** — solo se expone el conjunto de paths definido en el
   setting `public_routes`; cualquier otro path se *dropea* con `444` antes de
   llegar a la API.
2. **Multi-sucursal por hostname** — cada sucursal (`Organization`) tiene un
   `domain` único y una URL propia (subdominio). nginx valida el hostname y
   reenvía `Host`/`X-Forwarded-Host` para que la API resuelva la organización.

Ambos planos son **defensa en profundidad**: el allowlist limita la superficie
expuesta y el hostname resuelve el tenant, pero la seguridad real de datos
sigue en la API (RBAC + `resolveTenant` fail-closed).

---

## 1. Archivos

| Archivo | Rol |
|---------|-----|
| `docker/nginx/nginx.conf` | Config **por defecto** (allowlist de rutas). Drop-in para `/etc/nginx/conf.d/*.conf`; lo copia `docker/Dockerfile.web`. |
| `docker/nginx/multi-sucursal.conf.example` | **Plantilla** multi-sucursal por hostname (ejemplo comentado, NO se copia por defecto). |
| `docker/nginx/README.md` | Receta completa de generación y operación. |
| `docker/nginx.ssl.conf.example` | Bloque TLS de referencia (301→443 + HSTS). |

---

## 2. Allowlist de rutas (`public_routes`)

El `map $uri $route` se **genera** a partir del setting `public_routes` (array
de paths; `*` = prefijo). Por defecto:

```yaml
public_routes: ['/', '/api/', '/ws', '/docs/']
```

| Entrada | Región | Destino |
|---------|--------|---------|
| `/` | SPA | Assets estáticos + rutas client-side (`try_files … /index.html`). |
| `/api/` | API | `proxy_pass http://api:4000` (REST). |
| `/ws` | WebSocket | `proxy_pass http://api:4000` con upgrade. |
| `/docs/` | Swagger | `proxy_pass http://api:4000`. |

Reglas del `map`:

- `default` es la región SPA (`/`). Si `/` **no** está en `public_routes`, se
  reemplaza por `default deny;` para dropear también el frontend.
- Para **acotar** una región (p. ej. quitar `/docs/`), se quita su entrada del
  `map` y se agrega `~^PREFIJO deny;`.
- Todo path sin región asignada cae en `$route = deny` → `return 444`.

### Endpoints internos siempre denegados

Independientemente de `public_routes`, un segundo `map $uri $internal_deny`
dropea (444) los endpoints internos antes de llegar a la API:

```nginx
map $uri $internal_deny {
    default 0;
    ~^/api/v1/license($|/)         1;
    ~^/api/v1/roles($|/)           1;
    ~^/api/v1/audit($|/)           1;
    ~^/api/v1/system/backup($|/)   1;
}
```

Siguen protegidos por RBAC en la API; quitarlos de esta lista es un *override
explícito* (p. ej. para un host interno de administración).

---

## 3. Multi-sucursal por hostname

Cada sucursal tiene un `domain` único (`Organization.domain`, agregado en t85).
La cadena de resolución es:

1. **nginx** compara `$host` contra el allowlist de dominios y dropea (`444`) los
   hostname no conocidos (`if ($host_allowed = 0)`).
2. **nginx reenvía** `Host` y `X-Forwarded-Host` sin tocar.
3. **La API** (`resolveTenantByHostname`) resuelve la organización por ese
   hostname (minúsculas + sin puerto, cache 60 s) **antes** de la resolución por
   credencial. El usuario igual debe tener membresía activa en esa org
   (fail-closed → 403).

```nginx
# Allowlist por hostname (generada desde Organization.domain)
map $host $host_allowed {
    hostnames;
    default 0;

    .marca.ar                  1;   # dominio base + *.marca.ar (wildcard)
    sucursal-norte.marca.ar    1;   # generado desde Organization.domain
    sucursal-sur.marca.ar      1;   # generado desde Organization.domain
}

server {
    listen 80;
    server_name .marca.ar;          # coincide con marca.ar y *.marca.ar

    if ($host_allowed = 0) { return 444; }

    location /api/ {
        proxy_pass http://api:4000;
        proxy_set_header Host              $host;   # <- la API resuelve la org por esto
        proxy_set_header X-Forwarded-Host  $host;
        # … (X-Real-IP, X-Forwarded-For, X-Forwarded-Proto)
    }
}
```

Reglas de resolución del tenant (en la API):

- **`super_admin`**: puede anular la org del hostname con `X-Org-Id` /
  `X-Chain-Id`; si no, se usa `hostname → membresía → org`.
- **Usuario no-super** con hostname resuelto: debe tener membresía activa en esa
  org (las cabeceras `X-Org-Id`/`X-Chain-Id` se ignoran).
- **Host sin `domain`** registrado: flujo previo (JWT + cabeceras).

---

## 4. Activación y verificación

**Verificación de sintaxis:**

```bash
nginx -t -c docker/nginx/nginx.conf
nginx -t -c docker/nginx/multi-sucursal.conf.example
# → "syntax is ok" / "test is successful"
```

**Smoke del allowlist** (con nginx arriba y la API real como upstream):

| Petición | Resultado esperado |
|----------|--------------------|
| `GET /` , `/admin`, `/api/v1/system/version`, `/docs/` | `200` |
| `GET /api/v1/license/status`, `/roles`, `/audit`, `/system/backup` | `444` (drop) |

**Smoke multi-sucursal:**

| `Host` | Resultado esperado |
|--------|--------------------|
| `sucursal-norte.marca.ar`, `marca.ar` | `200` |
| `evil.example.com` | `444` (drop) |

---

## 5. Notas de operación (DNS / TLS / admin)

- **DNS**: publicar el dominio base + wildcard `*.marca.ar` (o un registro
  A/CNAME por sucursal) apuntando al host de nginx. nginx **no resuelve DNS**;
  solo compara `$host`.
- **TLS**: un certificado por hostname (o wildcard `*.marca.ar`). Ver
  `docker/nginx.ssl.conf.example` para el bloque 301→443 + HSTS.
- **Admin interno**: mantener `roles`/`license`/`audit`/`system/backup` en
  `$internal_deny` y servir el panel en un **host interno aparte**
  (`server_name admin.marca.ar`) con su propio allowlist menos estricto.

---

## Ver también

- [`docs/adr/0017-nginx-allowlist-multi-sucursal.md`](../adr/0017-nginx-allowlist-multi-sucursal.md) — decisión completa.
- [`docs/architecture/multi-tenant.md`](../architecture/multi-tenant.md) — modelo de cadenas y scoping por filas.
- [`docs/guides/despliegue.md`](./despliegue.md) — despliegue Docker/Kubernetes.
