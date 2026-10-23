# Visión general de la plataforma Webs

## Qué es Webs

Webs es una plataforma web **modular, escalable y multitenant**. Su núcleo es una API
HTTP/WebSocket construida con **Fastify** y un panel de administración + sitio público
construido con **React** (Vite). La extensibilidad se logra mediante un sistema de
**plugins** inspirado en WordPress: piezas autocontenidas que pueden registrar
rutas, componentes de cliente, ítems de menú, esquemas de configuración y permisos
propios sin tocar el núcleo de la plataforma.

El monorepo es `private` y su versión actual es `0.1.0` (ver `package.json` raíz).

## Objetivos de diseño

1. **Extensibilidad sin código** — el cliente final configura todo desde la UI: ajustes del
   sitio, apariencia, plugins, colocaciones (placements), roles y traducciones.
2. **Modularidad** — cada dominio (auth, users, roles, settings, content, translations,
   audit, plugins) es un módulo Fastify autocontenido bajo `apps/api/src/modules/*`.
3. **Escalabilidad horizontal** — la API es *stateless*: el estado vive en PostgreSQL y
   Redis se usa para sincronizar WebSocket, caché y (en el futuro) rate limiting global.
4. **Type safety end-to-end** — TypeScript en todos los paquetes, con `strict: true` y
   validación en runtime vía JSON Schema (Ajv) y Zod.
5. **Contratos públicos estables** — errores versionados (`ErrorCode`), un prefijo de API
   fijo (`/api/v1`) y un contrato de plugins versionado (`apiVersion: "1.0.0"`).

## Decisiones de stack

| Decisión | Elección | Alternativas consideradas y motivo |
|----------|----------|------------------------------------|
| Framework HTTP | **Fastify** (v5) | *Express*: Fastify ofrece mejor rendimiento, validación de esquemas integrada, un sistema de plugins/decoradores y logging estructurado nativo (pino). |
| UI | **React 19 + Vite 6** | *Vue*: React fue elegido por su ecosistema de librerías y por el contrato de cliente de plugins, que solo exige montar un `HTMLElement` (el plugin puede ser React, Vue o DOM puro). |
| ORM / acceso a datos | **Prisma 6** | *TypeORM / Knex / SQL crudo*: Prisma aporta un cliente tipado, migraciones declarativas y soporte nativo de PostgreSQL con tipos `Json`. |
| Lenguaje | **TypeScript 5** (ES2022, `strict`) | JavaScript plano: el contrato entre plataforma y plugins depende de tipos estructurales estables. |
| Estado / data-fetching (web) | **@tanstack/react-query + zustand** | Redux/Context plano: react-query simplifica el cacheo/sincronización con la API; zustand guarda el estado de sesión. |
| i18n | **i18next + react-i18next** | FormatJS: i18next encaja con el modelo de recursos base + sobrescritura en runtime. |
| Validación | **JSON Schema (Ajv) + Zod** | Validadores manuales: JSON Schema es la base del formulario auto-generado y Zod valida el entorno y el manifiesto de plugin. |
| Monorepo | **pnpm workspaces** | npm/yarn workspaces: ver `docs/architecture/monorepo.md`. |

> El `README.md` de la raíz dice literalmente «Node.js (Vue.js)», lo cual es un resto
> desactualizado: el stack real es **React** (ver `apps/web/package.json` y
> `apps/web/src/main.tsx`). Esta discrepancia se detalla al final de este conjunto de
> documentos.

## Mapa de componentes

```
Webs (monorepo pnpm)
├── apps/
│   ├── api/          API REST + WebSocket (Fastify). Ver apps/api/src/app.ts
│   └── web/          Frontend (React + Vite): admin y sitio público
├── packages/
│   ├── core/         Tipos, errores, constantes y utilidades compartidas (@webs/core)
│   ├── config/       Configuración compartida ESLint + Prettier (@webs/config)
│   ├── plugin-sdk/   SDK de plugins: manifiesto, hooks, slots (@webs/plugin-sdk)
│   ├── i18n/         Recursos base es/en + fábrica i18next (@webs/i18n)
│   └── ui/           Sistema de temas y tokens CSS (@webs/ui)
├── plugins/          Directorio físico de plugins
│   ├── example-block/  Plugin de referencia (@webs/plugin-example)
│   └── README.md
├── docker/           Dockerfiles + docker-compose + nginx
├── infra/            Notas de infraestructura (Kubernetes futuro)
├── .github/          CI (workflows)
├── scripts/          Helpers (release)
└── docs/             Documentación (este directorio)
```

### Piezas centrales del backend

`apps/api/src/app.ts` compone la aplicación en un orden explícito:

1. **Manejador de errores** (`plugins/error-handler.ts`) — primero, para capturar todo.
2. **Infraestructura** — `config`, `db` (Prisma), `redis`, `sensible`, `cors`, `helmet`,
   `rate-limit`, `swagger`.
3. **Autenticación y tiempo real** — `auth` (JWT + cookies) y `websocket` (`/ws`).
4. **Módulos de dominio** — todos registrados bajo el prefijo `API_PREFIX` (`/api/v1`):
   `health`, `auth`, `users`, `roles`, `settings`, `content`, `translations`, `audit`, `plugins`.
5. **Plugins instalados** — `registerPlugins()` (`apps/api/src/plugins/loader.ts`).

```ts
// apps/api/src/app.ts (resumen del orden de registro)
await app.register(errorHandlerPlugin);
await app.register(configPlugin, { env });
await app.register(dbPlugin);
await app.register(redisPlugin, { redisUrl: env.REDIS_URL });
// ... cors, helmet, rate-limit, swagger
await app.register(authPlugin, { jwtSecret: env.JWT_SECRET });
await app.register(websocketPlugin);
// ... módulos de dominio bajo /api/v1
await registerPlugins(app);
```

### Piezas centrales del frontend

`apps/web/src/main.tsx` importa los estilos de `@webs/ui` y monta `<App/>`. `App.tsx`
declara las rutas con `react-router-dom`: `/login`, `/site` (público) y el panel protegido
por `RequireAuth` (dashboard, content, plugins, users, roles, settings, appearance,
translations, audit). Los plugins se registran en tiempo de build vía `apps/web/src/plugins/index.ts`.
