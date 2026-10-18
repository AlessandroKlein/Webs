# Versionado (SemVer)

Webs usa **Semantic Versioning**: `MAJOR.MINOR.PATCH` (`v1.4.2`).

| Posición | Nombre | Cuándo incrementar |
| -------- | ------ | ------------------ |
| MAJOR | Mayor | Cambios rompedores (*breaking changes*) que quiebran compatibilidad. |
| MINOR | Menor | Nuevas funcionalidades compatibles con lo anterior. |
| PATCH | Parche | Correcciones, optimizaciones o refactor sin añadir ni romper nada. |

**Reglas de reinicio:**
- Al subir **MINOR** → `PATCH` vuelve a `0`.
- Al subir **MAJOR** → `MINOR` y `PATCH` vuelven a `0`.

## Fase actual: `v0.x.x` (desarrollo inicial)

- Empezamos en `v0.1.0`; hoy estamos en **v0.32.0**.
- En la rama `0.x.x` la API/arquitectura **no se considera estable**: los cambios
  estructurales o rompedores se publican **incrementando MINOR** (no MAJOR).
- Convención aplicada hasta ahora: **cada feature = +MINOR**, cada fix = +PATCH.

## Criterio para pasar a `v1.0.0`

Declaramos **`v1.0.0`** (primer lanzamiento estable) cuando:

- [ ] El build de **Docker** (compose + Dockerfiles) está validado.
- [ ] La app se **ejecutó en producción** (o al menos en una VPS real) sin errores.
- [ ] La API pública (rutas REST/WebSocket, SDK de bloques, contrato de
      `block.json`) se considera estable para terceros.

A partir de `v1.0.0`, SemVer se aplica de forma estricta (MAJOR solo para cambios
rompedores).

## Pre-releases

Para probar un cambio grande antes del lanzamiento oficial, usar sufijo con
guión: `v1.0.0-alpha.1`, `v1.0.0-beta.2`, `v1.0.0-rc.1`.

## Flujo de release (convención del repo)

1. `pnpm -r build` + `pnpm -r typecheck` en verde.
2. Commit + `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
3. `git branch -f develop main` (mantener `develop` alineado) + push de ramas y tags.
4. `gh release create vX.Y.Z --latest` (release de GitHub, no solo tag).
