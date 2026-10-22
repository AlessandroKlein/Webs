# @webs/mobile — Asistencia por QR (PWA)

App web progresiva (PWA) instalable para registrar asistencia por QR en el
gimnasio. Es una SPA ligera (HTML + JS + Vite, **sin** React Native ni
frameworks pesados) que reutiliza el backend existente de Webs.

## Qué hace

- Pantalla única de asistencia: campo para pegar el `access token` y campo para
  escanear/pegar el `qrcode`.
- Botón **Registrar** → `POST /api/v1/plugins/organizaciones/attendance/scan`
  con cuerpo `{ "qrcode": "..." }` y encabezado `Authorization: Bearer <token>`.
- Muestra el resultado `{ ok, organization, membership }` (éxito) o el error.
- Guarda en `localStorage` el token, la URL de la API y el historial de los
  últimos registros.
- Un lector «keyboard wedge» que tipea el código y envía `Enter` dispara el
  registro automáticamente.
- Escaneo por **cámara** (API `BarcodeDetector`, mejora progresiva).
- Puente con el **companion de escritorio** (`@webs/desktop`) vía WebSocket para
  lectores seriales/keyboard-wedge: campo `bridge-url` en Ajustes.

## Requisitos

- Node.js + pnpm (el monorepo ya usa `pnpm`).
- `vite` (única dependencia, declarada como `devDependency`).

## Build

Desde la raíz del monorepo:

```bash
pnpm --filter @webs/mobile build     # genera dist/ con base /asistencia/
pnpm --filter @webs/mobile preview   # sirve dist/ en http://localhost:4173/asistencia/
```

O entrando al directorio:

```bash
cd apps/mobile
pnpm build
pnpm preview
```

Para desarrollo con hot reload:

```bash
pnpm --filter @webs/mobile dev       # http://localhost:5173/asistencia/
```

## Servirla en producción

La PWA está pensada para servirse bajo la ruta **`/asistencia/`** (ver `base`
en `vite.config.js` y `start_url`/`scope` en `public/manifest.webmanifest`).
Serví la carpeta `apps/mobile/dist` detrás del mismo host que la API, por
ejemplo con nginx:

```nginx
location /asistencia/ {
    alias /ruta/a/webs/apps/mobile/dist/;
    try_files $uri $uri/ /asistencia/index.html;
}
```

Así la app llama a `/api/v1/...` en el **mismo origen** que la API.

### API en otro origen

Si la PWA se sirve en un host distinto a la API, apuntá el frontend a la API de
dos maneras:

1. Al compilar: `VITE_API_BASE=https://api.tudominio.com pnpm build`.
2. En runtime: abrí **Ajustes → Servidor API** y pegá la URL base.

(En ese caso la API debe tener CORS habilitado para ese origen, que el backend
de Webs ya soporta con `@fastify/cors`.)

## PWA

- `public/manifest.webmanifest`: nombre «Webs Asistencia», `display: standalone`,
  `start_url: /asistencia/`, iconos placeholder (`public/icons/`).
- `public/sw.js`: service worker con cache del shell (offline básico).

Para instalar: abrí la app en Chrome/Edge (Android o escritorio) y usá
«Instalar aplicación» o el botón «Instalar» que aparece en pantalla. Recordá que
el service worker requiere **HTTPS** (o `localhost`).

## Estructura

```
apps/mobile/
├── index.html
├── vite.config.js
├── package.json
├── public/
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── icons/            # iconos placeholder (192 / 512 / maskable)
└── src/
    ├── main.js           # lógica de la app + llamada a la API
    ├── barcode.js        # normalizeBarcode + puente WebSocket con @webs/desktop
    └── style.css
```
