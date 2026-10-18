# Contribuir a Webs

Gracias por contribuir. Este documento describe el flujo de trabajo del
monorepo y las convenciones para mantener el proyecto consistente.

## Requisitos

- Node.js ≥ 22, pnpm ≥ 9.
- PostgreSQL (y Redis opcional para desarrollo local).

## Configuración local

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d postgres redis
cp apps/api/.env.example apps/api/.env
pnpm --filter @webs/api exec prisma migrate dev
pnpm build
pnpm dev
```

## Estrategia de ramas

| Rama      | Propósito                                              |
| --------- | ------------------------------------------------------ |
| `main`    | Estable. Solo recibe merges de `develop` o hotfixes.   |
| `develop` | Integración del trabajo en curso.                      |
| `feature/*` | Trabajo aislado (ej. `feature/web`, `feature/mobile`, `feature/block-store`). |

Flujo habitual:

1. Crear rama desde `develop`: `git checkout -b feature/...`.
2. Desarrollar y commitear con mensajes claros.
3. Abrir PR hacia `develop` (el CI ejecuta typecheck, lint y build).
4. Al cerrar una versión, mergear `develop` → `main` y etiquetar el release.

## Commits

Usá mensajes descriptivos en presente: `feat:`, `fix:`, `docs:`, `chore:`,
`refactor:`, `test:`. Ejemplo:

```
feat(blocks): permitir colocar bloques en el slot de footer
```

## Releases

1. Actualizá `CHANGELOG.md` si aplica.
2. `node scripts/release.mjs patch|minor|major` (sugiere el tag).
3. Etiquetá y pusheá: `git tag -a vX.Y.Z -m "Release vX.Y.Z" && git push origin vX.Y.Z`.

## Convenciones de código

- TypeScript estricto en todo el monorepo.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` deben pasar antes de un PR.
- Formato con Prettier: `pnpm format`.
- Los errores de negocio usan `AppError` de `@webs/core` (nunca `throw new Error` genérico en la API).

## Desarrollar un bloque

Ver [docs/guides/crear-un-bloque.md](docs/guides/crear-un-bloque.md). Usá
`blocks/example-block` como plantilla.

## Reportar problemas

Seguí [SECURITY.md](SECURITY.md) para vulnerabilidades. Para el resto, abrí un
issue describiendo el problema y los pasos para reproducirlo.
