# @webs/mobile — App móvil (futuro)

Este directorio alojará la **aplicación móvil** de la plataforma Webs (React
Native / Expo), que consumirá la misma API REST y el mismo WebSocket que el
frontend web.

## Estado

Pendiente. Se implementará cuando el proyecto avance y se definan los requisitos
de la app (por ahora, solo la base web + API están desarrolladas).

## Integración prevista

- **Auth**: JWT de acceso + refresh token opaco guardado en almacenamiento
  seguro (Keychain/Keystore), no cookie httpOnly (que es para web).
- **Datos**: React Query (misma capa de cliente que la web, adaptada a fetch nativo).
- **Tiempo real**: WebSocket `/ws` con token.
- **Paquetes compartidos**: `@webs/core` (tipos/errores/constantes) y
  `@webs/plugin-sdk` (contrato de bloques).

Ver `docs/guides/mobile-app.md`.
