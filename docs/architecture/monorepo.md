# Monorepo (pnpm workspaces)

Webs se organiza como un **monorepo** gestionado con **pnpm workspaces**. Todas las apps,
paquetes compartidos y plugins viven en un único repositorio y comparten dependencias,
tooling y convenciones.

## Configuración

- **`pnpm-workspace.yaml`** declara tres globs de workspace:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "plugins/*"
```

- **`package.json` raíz** define el paquete `webs` (privado), el gestor de paquetes
  (`packageManager: pnpm@11.7.0`), el runtime mínimo (`node >= 22.0.0`) y los scripts
  agregados.
- **`.npmrc`** fija `auto-install-peers=true`, `strict-peer-dependencies=false` y
  `save-workspace-protocol=rolling`.
- **`tsconfig.base.json`** concentra las opciones de compilación (ES2022, ESM,
  `strict: true`, `declaration`, `sourceMap`, `incremental`). Cada paquete tiene su propio
  `tsconfig.json` que lo extiende.

## Estructura de directorios

| Directorio | Contenido | Rol |
|------------|-----------|-----|
| `apps/api/` | API Fastify (`@webs/api`) | Backend REST + WebSocket. |
| `apps/web/` | Frontend React + Vite (`@webs/web`) | Panel de administración y sitio público. |
| `packages/core/` | `@webs/core` | Tipos, errores (`AppError`), constantes (`Permission`, `SystemRole`, `API_PREFIX`) y utilidades. |
| `packages/config/` | `@webs/config` | Configuración compartida de ESLint (`/eslint`) y Prettier (`/prettier`). |
| `packages/plugin-sdk/` | `@webs/plugin-sdk` | SDK y contrato de plugins (`definePlugin`, `defineClientPlugin`, manifiesto, hooks, slots, menú). |
| `packages/i18n/` | `@webs/i18n` | Locales base `es`/`en` y fábrica `createI18n()`. |
| `packages/ui/` | `@webs/ui` | `ThemeProvider`, `useTheme` y tokens CSS (`styles.css`). |
| `plugins/example-block/` | `@webs/plugin-example` | Plugin de referencia que demuestra el contrato completo. |
| `docker/` | `Dockerfile.api`, `Dockerfile.web`, `docker-compose.yml`, `nginx.conf` | Contenedores locales y de producción. |
| `infra/` | `README.md` | Notas de infraestructura (escalado, Kubernetes futuro). |
| `.github/workflows/` | `ci.yml` | CI (install → prisma generate → typecheck → lint → build). |
| `scripts/` | `release.mjs` | Helper para preparar releases semver. |
| `docs/` | Documentación | Arquitectura y ADRs (este directorio). |

## Convenciones de paquetes (`@webs/*`)

- Todos los paquetes y apps usan el scope **`@webs/*`** y son `"private": true` (no se
  publican a npm).
- Los paquetes de librería (core, plugin-sdk, i18n, ui) compilan con **tsup** a
  `dist/` (ESM + `.d.ts`) y exponen su superficie pública mediante el campo `exports`.
- `@webs/ui` añade un export de estilos: `./styles.css` → `./src/styles/styles.css`.
- Las dependencias entre paquetes usan el protocolo **`workspace:*`** (por ejemplo,
  `apps/api` depende de `@webs/core`, `@webs/i18n`, `@webs/plugin-sdk`).
- Los **plugins** son paquetes que viven en `plugins/*` (directorio físico) y exponen
  entradas `./server` y `./client` (ver `plugins/example-block/package.json`).

```jsonc
// packages/ui/package.json (fragmento)
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./styles.css": "./src/styles/styles.css"
  },
  "peerDependencies": { "react": "^18.0.0 || ^19.0.0" }
}
```

## Flujo de trabajo

Los scripts raíz agregan el ciclo de vida completo con `pnpm -r` (recursivo):

| Comando | Qué ejecuta | Origen |
|---------|-------------|--------|
| `pnpm install` | Instala dependencias de todos los workspaces (respeta `pnpm-lock.yaml`). | — |
| `pnpm dev` | `pnpm --parallel --stream -r dev` — levanta todos los paquetes en modo watch. | `package.json` raíz |
| `pnpm dev:api` / `pnpm dev:web` | Dev server de API (`tsx watch`) o de web (`vite`), por separado. | `package.json` raíz |
| `pnpm build` | `pnpm -r build` — compila todo (tsup en librerías y api; `tsc -b && vite build` en web). | `package.json` raíz |
| `pnpm typecheck` | `pnpm -r typecheck` — `tsc --noEmit` en cada paquete. | `package.json` raíz |
| `pnpm lint` | `pnpm -r lint` — ESLint (flat config base de `@webs/config/eslint`). | `package.json` raíz |
| `pnpm test` | `pnpm -r test` — reservado; no hay suites definidas en el estado actual del repo. | `package.json` raíz |
| `pnpm clean` | `pnpm -r clean` — elimina `dist` de cada paquete. | `package.json` raíz |
| `pnpm format` / `format:check` | Prettier sobre todo el repo (write / check). | `package.json` raíz |

Scripts específicos de la API (`apps/api/package.json`):

```text
db:generate   prisma generate
db:migrate    prisma migrate dev
db:deploy     prisma migrate deploy
db:seed       prisma db seed          (tsx prisma/seed.ts)
```

### Pipeline de CI

`.github/workflows/ci.yml` ejecuta, sobre `main`/`develop` y PRs:

```text
pnpm install --frozen-lockfile
pnpm --filter @webs/api exec prisma generate
pnpm typecheck
pnpm lint
pnpm build
```

## Tooling compartido

- **ESLint** — flat config base en `packages/config/eslint.config.js` (ignore de `dist`,
  `build`, `node_modules`; reglas de `typescript-eslint` con `consistent-type-imports`).
  Cada paquete la extiende con su propio `eslint.config.js`.
- **Prettier** — `packages/config/prettier.config.js` (single quotes, trailing commas,
  `printWidth: 100`), re-exportado en `prettier.config.js` raíz.
- **TypeScript** — `tsconfig.base.json` con `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax` y `moduleResolution: "Bundler"`.
