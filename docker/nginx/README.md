# nginx — allowlist de rutas y multi-sucursal (ADR-0017)

Este directorio contiene el reverse-proxy endurecido de Webs. Implementa dos
capacidades del Milestone 5 (v2.3.0):

1. **Allowlist de rutas** — el proxy solo responde a los paths declarados en el
   setting `public_routes`; el resto se dropea (`444`).
2. **Multi-sucursal por hostname** — cada `Organization` tiene su propio
   dominio/subdominio, y nginx lo enruta a la misma API preservando `Host` para
   que la API resuelva la organización (ADR-0006 + t85).

## Archivos

| Archivo | Rol |
| --- | --- |
| `nginx.conf` | Config canónica (drop-in en `/etc/nginx/conf.d/`). Allowlist con el default `['/', '/api/', '/ws', '/docs/']`. Lo usa `docker/Dockerfile.web`. |
| `multi-sucursal.conf.example` | Plantilla comentada para enrutar por `Host` (subdominio por sucursal). **No** se copia por defecto. |
| `README.md` | Este documento. |

El antiguo `docker/nginx.conf` queda **reemplazado** por `nginx.conf` (la
referencia se actualizó en `docker/Dockerfile.web`).

## Cómo funciona la allowlist

La sección `map $uri $route` clasifica cada request en una **región**:

| Región | Prefijo | Destino |
| --- | --- | --- |
| `api` | `/api/` | `proxy_pass http://api:4000` (REST) |
| `ws` | `/ws` | proxy WebSocket a `api:4000` |
| `docs` | `/docs/` | proxy Swagger a `api:4000` |
| `spa` | `/` (todo lo demás) | `try_files $uri $uri/ /index.html` |

`default` = región `spa`. Cualquier path que no coincida con una entrada
habilitada cae en `deny` y se dropea con `444` (antes de resolver locations,
vía `if ($route = deny) { return 444; }`).

### Regenerar desde `public_routes`

`public_routes` es un array de paths (settings). `*` significa prefijo.
Por defecto: `['/', '/api/', '/ws', '/docs/']`.

Para **acotar** una región, se quita su entrada y se agrega `~^PREFIJO deny;`:

```nginx
# Quitar /docs/ (no exponer Swagger) -> el default SPA ya no lo cubre:
map $uri $route {
    ~^/api/      api;
    ~^/ws($|/)   ws;
    ~^/docs/     deny;   # <- deny explícito (Swagger deshabilitado)
    default      spa;
}
```

Si además se quita `/` (frontend), se reemplaza `default spa;` por
`default deny;`.

> La generación automática desde la DB la hará la API (al editar `public_routes`
> con `setting.write`, regenera el `nginx.conf` y recarga nginx). Mientras tanto
> la receta manual de arriba produce el mismo resultado.

### Endpoints siempre denegados (`$internal_deny`)

Aunque `/api/` esté listado, estos paths se dropean **antes** de llegar a la API
(protección en el borde; RBAC sigue aplicando dentro de la API):

- `/api/v1/license/*`
- `/api/v1/roles/*`
- `/api/v1/audit/*`
- `/api/v1/system/backup/*`

Para exponerlos (p. ej. en un host interno de administración), quitar la línea
correspondiente del `map $uri $internal_deny`. El override es deliberado: no se
pueden "listar" accidentalmente en `public_routes` sin también editarlos aquí.

## Multi-sucursal por hostname

Cada sucursal publica `Organization.domain` (p. ej. `sucursal-norte.marca.ar`).
`multi-sucursal.conf.example` muestra:

1. `map $host $host_allowed` (con `hostnames;`) — whitelist generada desde
   `Organization.domain`. Host desconocido → `444`.
2. `server_name .marca.ar;` — wildcard que acepta el dominio base y cualquier
   subdominio.
3. `proxy_set_header Host $host;` + `X-Forwarded-Host $host;` — **obligatorio**
   para que la API haga `resolveTenantByHostname(host)`.

Requisitos de operación:

- **DNS**: publicar `marca.ar` + wildcard `*.marca.ar` (o un registro por
  sucursal). nginx no resuelve DNS; solo compara `$host`.
- **TLS**: un certificado por hostname (o wildcard). Ver
  `docker/nginx.ssl.conf.example` (301 → 443, HSTS).
- **Admin**: mantener `$internal_deny` y servir el panel en un host interno
  separado (p. ej. `admin.marca.ar`) con su propio allowlist.

## Verificación

### Sintaxis

```bash
docker run --rm -v "$PWD/docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t
# -> "syntax is ok" / "test is successful"
```

### Smoke (allowlist + deny)

Con un upstream mock en la red de Docker (`mock-api` escuchando en 4000):

```bash
docker network create nginx-smoke
docker run -d --rm --name mock-api --network nginx-smoke \
  node:22-alpine node -e "require('http').createServer((q,s)=>{s.writeHead(200,{'content-type':'text/plain'});s.end('ok '+q.url)}).listen(4000)"
docker run -d --rm --name nginx-smoke --network nginx-smoke -p 8080:80 \
  -v "$PWD/docker/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine

# Permitidos:
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/            # 200 (SPA)
curl -s http://localhost:8080/api/v1/health                                 # ok /api/v1/health
curl -s http://localhost:8080/docs/                                         # ok /docs/
# Denegados (444):
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/v1/license/status  # 444
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/v1/roles          # 444
```

> `444` cierra la conexión sin respuesta HTTP (drop). Para devolver `404`
> explícito en lugar de `444`, cambiar `return 444;` por `return 404;` en los
> `if` del `server`.
