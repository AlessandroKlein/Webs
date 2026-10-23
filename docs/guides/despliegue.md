# Guía de despliegue

Esta guía cubre cómo llevar **Webs** a producción: build, Docker Compose,
variables de entorno, escalado horizontal, reverse proxy y Kubernetes
(conceptual).

---

## 1. Build de producción

Desde la raíz del monorepo:

```bash
# 1. Generar el cliente Prisma
pnpm --filter @webs/api exec prisma generate

# 2. Compilar todos los paquetes, plugins y apps (en orden)
pnpm build
```

El build produce:

| Artefacto                        | Comando/build                                            |
| -------------------------------- | -------------------------------------------------------- |
| API (Fastify)                    | `tsup src/index.ts` → `apps/api/dist/index.js`           |
| Frontend (React + Vite)          | `vite build` → `apps/web/dist/`                          |
| Plugins (server + client)        | `tsup` → `plugins/*/dist/*.js`                            |

Para arrancar la API compilada:

```bash
node apps/api/dist/index.js
# o, dentro de apps/api: pnpm start
```

Aplicar migraciones y seed en producción:

```bash
pnpm --filter @webs/api exec prisma migrate deploy
pnpm --filter @webs/api exec prisma db seed
```

---

## 2. Docker Compose

El archivo [`docker-compose.yml`](../../docker-compose.yml) (en la raíz) define
los servicios `postgres`, `mysql`, `redis`, `api` y `web`.

```bash
docker compose up -d --build
```

Servicios:

| Servicio  | Imagen/Base                    | Puerto (host) | Notas                                            |
| --------- | ------------------------------ | ------------- | ------------------------------------------------ |
| `postgres`| `postgres:16-alpine`           | `5432`        | `POSTGRES_USER/PASSWORD/DB = webs/webs/webs`.    |
| `redis`   | `redis:7-alpine`               | `6379`        | Healthcheck con `redis-cli ping`.                |
| `api`     | `docker/Dockerfile.api`        | `4000`        | `node:22-slim`; corre migraciones + seed + server. |
| `web`     | `docker/Dockerfile.web` (nginx)| `5173` → `80` | Build estático servido por nginx.                |

El `api` se arranca con:

```sh
sh -c "pnpm --filter @webs/api exec prisma migrate deploy &&
       pnpm --filter @webs/api exec prisma db seed &&
       node apps/api/dist/index.js"
```

Y espera (`depends_on`) a que `postgres` y `redis` estén sanos.

> El `web` proxea `/api/`, `/ws` y `/docs/` hacia el servicio `api` mediante
> [`docker/nginx.conf`](../../docker/nginx.conf).

---

## 3. Variables de entorno de producción

Esquema completo en `apps/api/src/config/env.ts` (validado con Zod). En
producción **no uses los valores por defecto**:

| Variable              | Obligatoria | Producción                                                              |
| --------------------- | ----------- | ----------------------------------------------------------------------- |
| `NODE_ENV`            | no (default `development`) | `production`                                              |
| `HOST`                | no (default `0.0.0.0`) | `0.0.0.0`                                                        |
| `PORT`                | no (default `4000`) | Puerto de escucha                                               |
| `DATABASE_URL`        | **sí**      | URL de PostgreSQL (usuario/clave fuertes).                               |
| `REDIS_URL`           | no          | `redis://...` — **recomendado en producción** (WebSocket/caché/rate-limit). |
| `JWT_SECRET`          | no* (mín. 16) | Valor largo y aleatorio: `openssl rand -hex 32`.                     |
| `JWT_REFRESH_SECRET`  | no* (mín. 16) | Ídem; reservado para evolución del refresh token (ver nota abajo).     |
| `CORS_ORIGIN`         | no (default `http://localhost:5173`) | Origen(es) del frontend, separados por coma.          |
| `LOG_LEVEL`           | no (default `info`) | `info` o `warn` en producción.                                 |
| `BLOCK_DIR`           | no (default `../../plugins`) | Ruta absoluta de plugins en el contenedor (ej. `/app/plugins`). |
| `SEED_ADMIN_EMAIL`    | no          | Email del superadmin creado por el seed.                                 |
| `SEED_ADMIN_PASSWORD` | no          | Contraseña del superadmin (**cambiar el default `changeme`**).           |

> `JWT_SECRET` controla la firma del access token. El campo
> `JWT_REFRESH_SECRET` está **declarado** en el esquema/env pero el refresh
> token actual se implementa como valor aleatorio hasheado en BD (no es JWT),
> por lo que hoy no se consume; mantenerlo definido igualmente por
> compatibilidad.

### Frontend

`apps/web/.env.example` define `VITE_API_BASE_URL` (la base URL de la API).
En producción apuntá al dominio real de la API, p. ej.
`VITE_API_BASE_URL=https://api.example.com`. En Docker, el proxy de nginx
resuelve `/api` y `/ws` sin necesitar esta variable.

---

## 4. Escalado horizontal (múltiples réplicas + Redis)

La API es **stateless**: cualquier número de réplicas puede atender detrás de
un balanceador. Requisitos compartidos (ver [`infra/README.md`](../../infra/README.md)):

- **PostgreSQL** — estado persistente (una instancia, o réplicas de lectura).
- **Redis** — sincroniza WebSocket entre instancias (pub/sub), caché y rate
  limiting global.

Puntos clave:

- **WebSocket**: con `REDIS_URL` configurada, los mensajes se replican entre
  instancias vía el canal `webs:ws` (ver [`websocket.md`](../api/websocket.md)).
- **Rate limiting**: `@fastify/rate-limit` usa IP por defecto; en cluster,
  conectá un store Redis para que el límite sea **global** (el plugin lo
  permite, ver `apps/api/src/plugins/rate-limit.ts`).
- **Sesiones/refresh tokens**: viven en PostgreSQL, así que son compartidos
  entre réplicas sin configuración extra.

---

## 5. Reverse proxy

El frontend de producción (nginx) ya trae la configuración de proxy en
[`docker/nginx.conf`](../../docker/nginx.conf). Lo esencial para un proxy
genérico (nginx/Caddy/Traefik):

```nginx
# API REST
location /api/ {
    proxy_pass http://api:4000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

# WebSocket: requiere upgrade
location /ws {
    proxy_pass http://api:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

> La API arranca Fastify con `trustProxy: true` para respetar
> `X-Forwarded-For` (importante para logs, `request.ip` y rate limiting).

### CORS y cookies en producción

- `CORS_ORIGIN` debe listar el origen exacto del frontend (no `*`), porque la
  API usa `credentials: true`.
- La cookie del refresh token es `Secure` cuando `NODE_ENV=production`; por lo
  tanto, serví todo bajo **HTTPS**.

---

## 6. Kubernetes (conceptual)

La estructura objetivo está descrita en [`infra/README.md`](../../infra/README.md).
Manifiestos previstos en un directorio `k8s/`:

| Recurso             | Componente                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| `api`               | `Deployment` con `N` réplicas + `HorizontalPodAutoscaler` + `Service` + `Ingress`. |
| `web`               | Build estático servido por nginx o un CDN.                               |
| `postgres`          | Operador (CloudNativePG) o servicio gestionado.                          |
| `redis`             | Clúster gestionado (o Valkey).                                           |

La API no requiere afinidad de sesión porque es stateless; Redis y PostgreSQL
son los únicos componentes con estado compartido.

---

## Ver también

- [`docs/guides/getting-started.md`](./getting-started.md) — arranque local.
- [`docs/api/overview.md`](../api/overview.md) — referencia de la API.
- [`docs/api/websocket.md`](../api/websocket.md) — escalado del WebSocket.
