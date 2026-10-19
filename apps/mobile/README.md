# Webs Mobile (Android / iOS)

App móvil de Webs construida con **Capacitor**, que envuelve la web existente
(`apps/web`, React + Vite). Es la opción recomendada porque reutiliza **todo** el
código web (panel de administración + los 25 bloques) y la web ya es responsiva/PWA.

## Por qué Capacitor

| Opción | Cuándo |
| ------ | ------ |
| **Capacitor** (elegida) | Ya tenés una web React/Vite responsive + PWA. Reutiliza todo el código. |
| React Native / Expo | Si querés una UI 100% nativa separada (rehacer pantallas). |
| Flutter | Si preferís Dart y una app nativa desde cero. |

## Requisitos

- Node + pnpm (mismo del monorepo).
- Android: Android Studio + SDK. iOS: macOS + Xcode.

## Uso

```bash
cd apps/mobile
pnpm install
pnpm build:web          # compila apps/web → dist/
pnpm add:android        # genera la carpeta android/ (una vez)
pnpm sync               # copia el bundle web + plugins a las plataformas
pnpm open:android       # abre en Android Studio
# iOS (solo macOS):
pnpm add:ios
pnpm open:ios
```

## Integración con la API

La app apunta al backend en la URL configurada en `apps/web` (proxy `/api` y
`/ws`). Para producción, definí la URL del backend en `capacitor.config.json`
(`server.url`) o en las variables de entorno de `apps/web`.

## Notas

- `webDir: "../web/dist"` apunta al build de la web.
- El esquema `androidScheme: "https"` evita restricciones de `file://`.
- Para notificaciones push nativas, cámara, etc., agregá plugins de Capacitor
  (`@capacitor/push-notifications`, `@capacitor/camera`, …) y usalos desde el
  bloque correspondiente (`push`, `social`, `media`).
