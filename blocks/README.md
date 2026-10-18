# Bloques / Plugins de Webs

Este directorio contiene los **bloques** (plugins) locales de la plataforma.
Cada subdirectorio es un paquete independiente con un manifiesto `block.json`.

## Crear un bloque nuevo

1. Copiá `example-block/` como plantilla.
2. Editá `block.json` (id, nombre, entradas, settings, slots, permisos).
3. Implementá `src/server.ts` (lógica backend, opcional) y `src/client.ts`
   (render en el frontend, opcional).
4. Agregá el paquete al `pnpm-workspace.yaml` (ya cubierto por `blocks/*`).

## Registro en el frontend

El frontend empaqueta los bloques en tiempo de build. Registrá la entrada de
cliente en `apps/web/src/blocks/index.ts`.

## Ver también

- `packages/plugin-sdk/` — el SDK y el contrato (`defineBlock`, `defineClientBlock`).
- `docs/guides/crear-un-bloque.md` — guía completa.
- `apps/api/src/blocks/` — el loader del backend.
