# App móvil con Capacitor (Android/iOS)

Este documento describe cómo empaquetar la web (`apps/web`) como app nativa
Android/iOS con [Capacitor](https://capacitorjs.com), cómo autenticarse desde el
WebView con el JWT existente y cómo queda el soporte de lectores de código para la
experiencia de trabajadores.

> El host de Capacitor vive en `apps/mobile` (envuelve `apps/web`), integrado en
> la rama principal. Los proyectos nativos `android/`/`ios/` se generan con
> `cap add` y están ignorados por git (se regeneran en cada entorno de build).
> Incluye `@capacitor/splash-screen` (configurado en `capacitor.config.json`).

## Arquitectura

```
apps/mobile/                 ← host Capacitor (proyecto nativo Android/iOS)
├── capacitor.config.json    ← appId, webDir=../web/dist, esquema https
├── package.json             ← @capacitor/{cli,core,android,ios} + scripts
├── android/                 ← proyecto Android (generado por `cap add android`)
└── ios/                     ← proyecto iOS (generado por `cap add ios`)

apps/web/                    ← la app real (React + Vite), se empaqueta tal cual
```

Capacitor carga el build de producción de `apps/web` (`apps/web/dist`) dentro de un
WebView nativo. No hay una segunda codebase: la misma web que corre en el navegador
es la app.

Configuración base (`apps/mobile/capacitor.config.json`):

```json
{
  "appId": "com.webs.app",
  "appName": "Webs",
  "webDir": "../web/dist",
  "server": { "androidScheme": "https" },
  "plugins": { "SplashScreen": { "launchShowDuration": 500 } }
}
```

## Requisitos

- Node + pnpm (para el build de la web).
- Android: Android Studio + SDK (JDK 17 para Capacitor 6).
- iOS: Xcode + CocoaPods (solo macOS).

## Build y run

Desde `apps/mobile`:

```bash
# 1. Compilar la web (genera apps/web/dist)
pnpm build:web

# 2. (solo la primera vez por plataforma) crear el proyecto nativo
pnpm add:android        # genera apps/mobile/android
pnpm add:ios            # genera apps/mobile/ios

# 3. Sincronizar la web + plugins nativos (después de cada cambio en la web)
pnpm sync

# 4. Abrir en el IDE / correr
pnpm open:android       # Android Studio
pnpm open:ios           # Xcode
```

Para correr directo en un dispositivo/emulador sin abrir el IDE se usan los comandos
nativos de Capacitor (`npx cap run android`, `npx cap run ios`).

## Autenticación (JWT + refresh cookie)

La web ya autentica con el JWT existente (`apps/web/src/lib/api.ts`):

- El **access token** se mantiene en memoria (`apps/web/src/lib/token.ts`) y se envía
  como `Authorization: Bearer <token>`.
- El **refresh token** viaja en una cookie `httpOnly`; ante un `401`, `api.ts` llama a
  `POST /api/v1/auth/refresh` con `credentials: 'include'` y obtiene un access token
  nuevo.

En Capacitor no hay que tocar la lógica de auth, pero sí hay que configurar el
**origen** para que la cookie httpOnly y las peticiones lleguen al backend:

| Modo | Configuración | Cookie/JWT |
| --- | --- | --- |
| WebView apunta al sitio desplegado (recomendado) | `server.url: "https://app.tudominio.com"` en `capacitor.config.json` | Same-origin: todo funciona como en el navegador. |
| WebView local (`androidScheme: "https"` sin `server.url`) | Buildear con `VITE_API_BASE_URL=https://api.tudominio.com` | Cross-origin: requiere CORS en la API y cookie `SameSite=None; Secure`. |

En ambos casos el access token se pide/renueva igual que en la web. La cookie de
refresh debe ser `httpOnly` + `Secure` (obligatorio para `https` en el WebView).
Ver también `docs/guides/cookies.md`.

## Sección de trabajadores + lectores de código

La sección de trabajadores es `/staff` (`StaffDashboard`), con navegación por rol
basada en RBAC: cada módulo (Asistencia, Rutinas, Reservas, Pagos, Ventas, Stock,
Tickets, …) solo aparece si el usuario tiene el permiso correspondiente
(`attendance.manage`, `course.manage`, `membership.manage`, `billing.read`,
`sales.manage`, `inventory.read`, `support.manage`, …).

El soporte de lectores externos se apoya en dos piezas:

1. **`BarcodeScanner`** (`apps/web/src/components/ui/BarcodeScanner.tsx`): entrada que
   acepta tres fuentes con el mismo flujo:
   - **Lector HID / keyboard-wedge USB**: tipea el código + `Enter`; el componente
     detecta el `Enter` o usa un temporizador de asentamiento (`settleMs`) para
     lectores que no envían `Enter`.
   - **Escritura manual** (fallback).
   - **Cámara** (slot `onRequestCamera`), normaliza prefijos AIM/GS1 (`]C0`, `]E0`).
2. **`CameraScanner`** (`apps/web/src/components/ui/CameraScanner.tsx`): visor de
   cámara que usa la API nativa `BarcodeDetector` (Android WebView / Chrome 88+,
   Safari 17+ en iOS). Al detectar un código emite `onCode` una vez y cierra,
   liberando el stream de cámara.

En Asistencia, el escáner se conecta al endpoint del plugin de organizaciones
(`POST /api/v1/plugins/organizaciones/attendance/scan` con `{ qrcode }`).

> Para lectores por **puerto serial** (no HID) existe el puente `apps/desktop`
> (WebSocket `ws://localhost:4599`), documentado en `apps/desktop/README.md`; la app
> puede consumirlo igual que el PWA de asistencia.

## Pantalla de actualizaciones

`/admin/updates` (`apps/web/src/features/updates/UpdatesPage.tsx`) reusa el contrato
de t20 (`docs/adr/0010-update-system.md`):

- `POST /api/v1/system/update/check` → versión de la app + plugins con actualización
  disponible.
- `POST /api/v1/system/update/apply` → dispara la actualización (app o plugin).

Mientras el backend no exponga `update/check`, la pantalla hace fallback a
`GET /api/v1/system/version` y muestra la versión instalada/última.

## Notas

- El service worker (`apps/web/public/sw.js`) solo se registra en producción
  (`apps/web/src/main.tsx`), para no interferir con el HMR de desarrollo.
- En Capacitor, la cámara requiere que el sistema pida permiso: en Android se
  declara en el manifest y en iOS en `Info.plist` (los plugins nativos lo añaden al
  `cap sync` cuando corresponda).
