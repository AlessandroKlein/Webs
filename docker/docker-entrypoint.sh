#!/bin/sh
# Entrypoint del contenedor `api` de Webs (Docker Compose).
#
# Convierte el arranque en "llave en mano": aplica las migraciones, ejecuta el
# seed (permisos, roles, superadmin, organización raíz) y escribe el estado de
# instalación ANTES de levantar el servidor. Así `docker compose up --build`
# deja una instancia lista para iniciar sesión con las credenciales del seed
# (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD), sin pasar por el asistente.
#
# Requiere en el entorno: DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD,
# y (opcional) DATA_DIR. El resto (JWT_*, REDIS_URL, …) lo consume la app.
set -eu

cd /app

# 1. Migraciones. Reintenta porque el healthcheck de `depends_on` confirma que
#    PostgreSQL acepta conexiones, pero puede quedar una ventana mínima hasta
#    que la base `webs` quede operativa.
echo "[entrypoint] aplicando migraciones (prisma migrate deploy)..."
i=0
until pnpm --filter @webs/api exec prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 10 ]; then
    echo "[entrypoint] migrate deploy falló tras 10 intentos" >&2
    exit 1
  fi
  echo "[entrypoint] reintentando migrate deploy ($i/10)..."
  sleep 3
done

# 2. Seed idempotente (permisos, roles, superadmin y organización raíz).
echo "[entrypoint] ejecutando seed (prisma db seed)..."
pnpm --filter @webs/api exec prisma db seed

# 3. Marca la instalación como completada para que la API arranque en modo
#    normal (no en modo asistente) y se reconecte a esta base en cada arranque.
echo "[entrypoint] escribiendo estado de instalación..."
node -e '
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.DATA_DIR || "/app/data";
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "webs.config.json"),
  JSON.stringify(
    {
      installed: true,
      databaseProvider: "postgresql",
      databaseUrl: process.env.DATABASE_URL || null,
      installedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
'

# 4. Servidor.
echo "[entrypoint] arrancando API..."
exec node apps/api/dist/index.js
