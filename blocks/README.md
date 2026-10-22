# Plugins de Webs

Este directorio contiene los **plugins** locales de la plataforma.
Cada subdirectorio es un paquete independiente con un manifiesto `plugin.json`.

## Crear un plugin nuevo

1. Copiá `example-block/` como plantilla.
2. Editá `plugin.json` (id, nombre, entradas, settings, slots, permisos, menú).
3. Implementá `src/server.ts` (lógica backend, opcional) y `src/client.ts`
   (render en el frontend, opcional).
4. Agregá el paquete al `pnpm-workspace.yaml` (ya cubierto por `blocks/*`).

## Registro en el frontend

El frontend empaqueta los plugins en tiempo de build. Registrá la entrada de
cliente en `apps/web/src/blocks/index.ts`.

## Ver también

- `packages/plugin-sdk/` — el SDK y el contrato (`definePlugin`, `defineClientPlugin`).
- `docs/guides/crear-un-bloque.md` — guía completa.
- `apps/api/src/plugins/` — el loader del backend.
