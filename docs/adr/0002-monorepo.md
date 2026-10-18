# ADR-0002: Monorepo con pnpm workspaces

- **Estado:** Aceptado
- **Fecha:** 2026 (versión 0.1.0 del monorepo)
- **Decisión:** Organizar el proyecto como un único monorepo gestionado con pnpm workspaces.

## Contexto

La plataforma se compone de varias apps (`api`, `web`), varios paquetes compartidos
(`core`, `config`, `plugin-sdk`, `i18n`, `ui`) y bloques (`blocks/*`) que deben consumir
los mismos contratos y versiones sin publicar a npm.

## Decisión

- Un único repositorio `webs` (privado) con workspaces declarados en `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "blocks/*"
```

- Scope **`@webs/*`** para todos los paquetes, todos `"private": true`.
- Dependencias internas con protocolo **`workspace:*`**.
- Scripts raíz agregados con `pnpm -r` (`build`, `typecheck`, `lint`, `test`, `clean`) y
  dev en paralelo (`pnpm --parallel --stream -r dev`).
- `packageManager: pnpm@11.7.0` y `engines.node >= 22` fijados en el `package.json` raíz.

## Consecuencias

**Positivas**

- Un solo `pnpm install` y un solo lockfile (`pnpm-lock.yaml`) para todo.
- Cambios en `@webs/core` o `@webs/plugin-sdk` se propagan inmediatamente a apps y bloques.
- Tooling compartido (`@webs/config` con ESLint/Prettier) y `tsconfig.base.json` únicos.
- Los bloques son packages más del workspace: el frontend los importa estáticamente
  (`@webs/block-example/client`) en build, y el backend los descubre por directorio.

**Negativas / costes**

- El monorepo crece en tiempo de build (`pnpm -r build` compila todos los paquetes).
- La publicación a npm requiere un proceso de versionado externo (el helper
  `scripts/release.mjs` solo prepara tags git).

## Notas

- `apps/web` depende de `@webs/block-example` (`workspace:*`), lo que acopla el build del
  frontend a la compilación previa del bloque (`block.json` + `dist/server.js` +
  `dist/client.js`).
