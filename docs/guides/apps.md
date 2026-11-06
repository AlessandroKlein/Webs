# Apps de escritorio y Android — guía de build

Pasos exactos para compilar y empaquetar las apps de Webs. La app **Android** se
genera con Capacitor envolviendo `apps/web`; la de **escritorio** (Windows/Linux)
con Electron, también sobre `apps/web`.

## Requisitos

| App | Requisitos |
| --- | --- |
| Android | Android Studio + Android SDK; **JDK 17** (obligatorio para Capacitor 6). |
| Escritorio | Node 22 + pnpm; `electron`/`electron-builder` (devDeps de `@webs/desktop`). |

## Android (Capacitor)

`apps/mobile` es el **host Capacitor** que envuelve `apps/web` (`capacitor.config.json`
`webDir: ../web/dist`). El flujo:

```bash
# 1) Compilar la web admin (genera apps/web/dist):
pnpm --filter @webs/web build

# 2) (una sola vez) generar la plataforma android/:
pnpm --filter @webs/mobile add:android

# 3) Sincronizar dist/ + plugins nativos en la plataforma:
pnpm --filter @webs/mobile sync:android

# 4) Abrir en Android Studio (o compilar directo):
pnpm --filter @webs/mobile open:android
# alternativas:
#   npx cap open android
#   npx cap run android        (device/emulador conectado)
```

Compilar el APK/AAB sin abrir Android Studio:

```bash
pnpm --filter @webs/mobile build:android   # = cap sync android && cap build android
```

### Configuración relevante

- `server.androidScheme: https` (ya estaba): Capacitor sirve la web como `https://`
  en el WebView, requisito para APIs modernas (cámara, crypto).
- `android.allowMixedContent: false` (nuevo): no se permite mezclar contenido
  `http://` sobre `https://`. Si en **desarrollo** apuntás a una API `http://`
  local, configuralo a `true` solo para ese build (no en producción).
- `server.url`: se usa **solo en desarrollo** (live reload apuntando al dev server
  de Vite). En producción se omite y Capacitor sirve `webDir` local.

### Qué NO está (no prometer)

- **Firma de Play Store** (keystore de release) — falta configurarla.
- **Push nativo** (FCM/APNs) — no integrado.
- **Offline / sincronización** — la app requiere conectividad a la API.

## Escritorio (Electron)

`apps/desktop` es la app Electron. Requiere `pnpm install` primero (devDeps
`electron`/`electron-builder`; **no instalado aún**, sin red al escribir esto).

```bash
# Dev: carga http://localhost:5173 (corré el dev server de apps/web aparte):
pnpm --filter @webs/desktop electron:dev

# Producción local: carga apps/web/dist:
pnpm --filter @webs/web build
pnpm --filter @webs/desktop electron:start

# Empaquetar instaladores (nsis .exe en Windows, .AppImage/.deb en Linux):
pnpm --filter @webs/desktop dist
```

### Qué NO está

- **Firma de código** (Authenticode Windows / firma Linux).
- **Auto-update** (`electron-updater`) — requiere firma, no instalado.
- **`serialport` en Electron** — módulo nativo; requiere `electron-rebuild`.
- **API autocontenida**: `apps/web/dist` por `file://` no llega a la API; usá
  `WEB_URL` (sitio desplegado) o compilá la web con `VITE_API_BASE_URL`.

## Estructura de la integración

```
apps/web/dist          -> base de las dos apps (PWA instalable + Capacitor + Electron)
apps/mobile/           -> host Capacitor (Android/iOS)
apps/desktop/electron  -> shell Electron (main + preload)
apps/desktop/src/      -> companion de lectores (bridge.js reutilizado por Electron)
```
