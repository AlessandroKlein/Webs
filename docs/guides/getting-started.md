# Guía de inicio (Getting Started)

Esta guía te lleva desde cero hasta tener la plataforma **Webs** corriendo en
local, con la API (Fastify), el frontend (React/Vite), la base de datos
(PostgreSQL) y, opcionalmente, Redis.

## Requisitos

| Herramienta | Versión mínima | Notas                                              |
| ----------- | -------------- | -------------------------------------------------- |
| Node.js     | `>= 22`        | Declarado en `engines.node` del `package.json` raíz |
| pnpm        | `>= 9`         | Repo usa `pnpm@11.7.0` (ver `packageManager`)      |
| PostgreSQL  | 16             | Se levanta con Docker Compose                      |
| Redis       | 7 (opcional)   | Necesario para WebSocket en cluster / caché         |
| Docker      | —              | Para levantar PostgreSQL/Redis sin instalarlos      |

Verifica las versiones:

```bash
node --version   # v22.x o superior
pnpm --version   # 9.x o superior
```

> Si no tenés pnpm, activalo con Corepack (incluido en Node ≥ 16.9):
> `corepack enable && corepack prepare pnpm@11.7.0 --activate`.

---

## 1. Clonar e instalar dependencias

```bash
git clone <url-del-repo> webs
cd webs

pnpm install
```

El repo es un **monorepo pnpm** (workspace). `pnpm-workspace.yaml` incluye
`apps/*`, `packages/*` y `blocks/*`.

---

## 2. Configurar variables de entorno

Cada app tiene su propio `.env.example`. Copiá el de la API:

```bash
cp apps/api/.env.example apps/api/.env
```

El archivo `apps/api/.env.example` contiene (resumen):

```dotenv
NODE_ENV=development
HOST=0.0.0.0
PORT=4000

# PostgreSQL
DATABASE_URL=postgresql://webs:webs@localhost:5432/webs?schema=public

# Redis (opcional en dev)
# REDIS_URL=redis://localhost:6379

# JWT (en producción usar: openssl rand -hex 32)
JWT_SECRET=dev-secret-change-me-please-0123456789
JWT_REFRESH_SECRET=dev-refresh-secret-change-me-0123456789

# CORS
CORS_ORIGIN=http://localhost:5173

# Logging
LOG_LEVEL=info

# Directorio de bloques locales
BLOCK_DIR=../../blocks

# Seed del primer superadmin
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=changeme
```

Para desarrollo local con Docker Compose, los valores por defecto de
`DATABASE_URL` ya coinciden con el servicio `postgres` (usuario `webs`,
password `webs`, base `webs`).

> El frontend también tiene `apps/web/.env.example` con `VITE_API_BASE_URL=`
> (en dev el proxy de Vite resuelve la API, por lo que puede quedar vacía).
> Copialo si necesitás apuntar a otra API: `cp apps/web/.env.example apps/web/.env`.

---

## 3. Crear la base de datos

El archivo `docker/docker-compose.yml` define `postgres` (y `redis`). Como el
compose está en `docker/`, ejecutá desde la raíz:

```bash
docker compose -f docker/docker-compose.yml up -d postgres
```

O bien, entrando al directorio:

```bash
cd docker
docker compose up -d postgres
cd ..
```

Para levantar también Redis (opcional, recomendado):

```bash
docker compose -f docker/docker-compose.yml up -d postgres redis
```

Verifica que PostgreSQL esté listo (el compose incluye un healthcheck con
`pg_isready`).

---

## 4. Migrar y sembrar la base de datos

Primero generá el cliente Prisma y aplicá las migraciones:

```bash
pnpm --filter @webs/api exec prisma generate
pnpm --filter @webs/api exec prisma migrate dev
```

> Equivalentes abreviados definidos como scripts en `apps/api/package.json`:
> `pnpm --filter @webs/api db:generate` y `pnpm --filter @webs/api db:migrate`.

Luego ejecutá el **seed**, que crea los permisos, los roles por defecto y el
primer superadmin:

```bash
pnpm --filter @webs/api exec prisma db seed
```

O con el script: `pnpm --filter @webs/api db:seed`.

---

## 5. Compilar

Compila todos los paquetes y apps del workspace (incluidos los bloques):

```bash
pnpm build
```

Esto ejecuta `pnpm -r build` en orden: `packages/*`, `blocks/*` y `apps/*`.

---

## 6. Levantar en desarrollo

```bash
pnpm dev
```

Esto arranca API y frontend en paralelo:

| Servicio  | URL                                      |
| --------- | ---------------------------------------- |
| API       | `http://localhost:4000`                  |
| Swagger   | `http://localhost:4000/docs`             |
| Health    | `http://localhost:4000/health`           |
| Frontend  | `http://localhost:5173`                  |

También podés levantarlos por separado:

```bash
pnpm dev:api    # solo la API (tsx watch)
pnpm dev:web    # solo el frontend (vite)
```

---

## 7. Credenciales del superadmin por defecto

El seed crea el primer superadministrador con:

| Campo     | Valor                |
| --------- | -------------------- |
| Email     | `admin@example.com`  |
| Password  | `changeme`           |
| Rol       | `super_admin`        |

**Cambiá la contraseña inmediatamente**, especialmente si vas a compartir el
entorno. Podés hacerlo de dos formas:

1. **Antes del seed** (recomendado): definí `SEED_ADMIN_EMAIL` y
   `SEED_ADMIN_PASSWORD` en `apps/api/.env`.
2. **Después del seed**: iniciá sesión y actualizá la contraseña vía API
   (`PATCH /api/v1/users/:id` con `{ "password": "nueva-clave" }`) o desde la
   pantalla de administración.

---

## Siguientes pasos

- [`docs/guides/configuracion-desde-ui.md`](./configuracion-desde-ui.md) —
  configura el sitio sin tocar código.
- [`docs/guides/crear-un-bloque.md`](./crear-un-bloque.md) — crea tu primer bloque.
- [`docs/guides/despliegue.md`](./despliegue.md) — lleva la plataforma a producción.
