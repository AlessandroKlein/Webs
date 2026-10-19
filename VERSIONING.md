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

## Fase actual: `v1.0.0` (estable)

- Primer lanzamiento estable declarado en **v1.0.0** (datos persistentes + sistema
  de versiones/actualización de bloques y del sistema).
- A partir de `v1.0.0`, SemVer se aplica de forma estricta:
  - **MAJOR** solo para cambios rompedores.
  - **MINOR** para features compatibles.
  - **PATCH** para fixes.

## Historial `v0.x.x` (desarrollo inicial)

- Desde `v0.1.0` hasta `v0.40.0`: en `0.x.x` los cambios estructurales se publicaron
  incrementando MINOR (sin garantizar compatibilidad).

## Criterio para futuros saltos MAJOR

- **2.0.0** si hay un cambio rompedor en la API pública (rutas, SDK de bloques,
  contrato `block.json`) o en el modelo de datos.
- La validación de **Docker/producción en VPS** queda como verificación operativa
  (no bloquea el versionado estable).

## Pre-releases

Para probar un cambio grande antes del lanzamiento oficial, usar sufijo con
guión: `v1.0.0-alpha.1`, `v1.0.0-beta.2`, `v1.0.0-rc.1`.

## Flujo de release (convención del repo)

1. `pnpm -r build` + `pnpm -r typecheck` en verde.
2. Commit + `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
3. `git branch -f develop main` (mantener `develop` alineado) + push de ramas y tags.
4. `gh release create vX.Y.Z --latest` (release de GitHub, no solo tag).
