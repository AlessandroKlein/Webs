# Asistente de instalación

Webs se instala **100% desde una interfaz gráfica**, sin tocar código ni la
terminal. Es el equivalente al instalador de WordPress: en el primer arranque
(antes de configurar la base de datos), la web muestra el asistente en lugar
del login.

## Qué configura el asistente

| Paso | Qué configura |
| ---- | ------------- |
| 1. Bienvenida | Idioma por defecto (es/en). |
| 2. Base de datos | Motor (**PostgreSQL**, **SQLite** o **MySQL/MariaDB**) y credenciales de conexión. |
| 3. Sitio | Nombre, lema, logo (claro/oscuro), icono y favicon. |
| 4. Correo (SMTP) | Servidor, puerto, usuario, contraseña, remitente y SSL/TLS (opcional). |
| 5. Administrador | Correo, nombre y contraseña de la **cuenta Super Administrador**. |
| 6. Instalar | Resumen + ejecución de la instalación. |

## Cómo funciona por dentro

1. La API arranca sin base de datos y expone `/api/v1/setup/status` con
   `installed: false`. El frontend detecta esto y muestra el asistente.
2. `POST /api/v1/setup/test-db` prueba la conexión (sin modificar nada).
3. `POST /api/v1/setup/install`:
   - Ejecuta `prisma db push` con el **esquema del motor elegido**
     (`prisma/schema.prisma`, `schema.sqlite.prisma` o `schema.mysql.prisma`).
   - Regenera el cliente Prisma para ese motor (`prisma generate`).
   - Crea roles/permisos, la cuenta admin y guarda la configuración de sitio y
     SMTP (script `scripts/setup-finish.mjs`).
   - Guarda el estado de instalación en `data/webs.config.json`.
4. Al terminar, el servidor debe **reiniciarse** (en Docker lo hace el gestor de
   contenedores; en desarrollo, reiniciá `pnpm dev`). Tras el reinicio ya se
   puede iniciar sesión.

## Motores soportados

| Motor | Cuándo usarlo | URL generada |
| ----- | ------------- | ------------ |
| PostgreSQL | Producción (recomendado) | `postgresql://user:pass@host:5432/db?schema=public` |
| SQLite | Local / sitios pequeños (archivo) | `file:./data/webs.db` |
| MySQL / MariaDB | Entornos con MySQL | `mysql://user:pass@host:3306/db` |

> Los tres comparten el mismo esquema de datos (`apps/api/prisma/`). Si editás
> `schema.prisma`, regenerá los esquemas derivados con
> `node scripts/generate-prisma-schemas.mjs`.

## SMTP

El correo se usa para **verificar el email** y **restablecer la contraseña**.
Es opcional en la instalación: si lo omitís, podés configurarlo luego en
**Ajustes → Correo (SMTP)** (o directamente en la tabla `settings`, clave `smtp`).

## Notas

- El estado de instalación vive en `data/webs.config.json` (ignorado por git).
  Incluye la URL de conexión con credenciales: protegé ese archivo en producción.
- Para reinstalar desde cero, borrá `data/webs.config.json` (y el archivo de
  SQLite si corresponde) y reiniciá.
