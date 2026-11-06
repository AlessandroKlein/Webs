# @webs/desktop — App de escritorio + companion de lectores

Dos cosas en un paquete:

1. **App Electron** (`electron/`): shell de escritorio (Windows/Linux) que envuelve
   `apps/web` y arranca el puente de lectores dentro de la propia app.
2. **Companion standalone** (`src/index.js`): proceso Node sin GUI que lee
   códigos de barras/QR desde un lector físico (puerto **serial** o **keyboard
   wedge**) y los expone por WebSocket en `ws://localhost:4599`.

Ambos comparten la lógica de lectura en `src/bridge.js` (no duplicada).

## Requisitos

- Node.js 22 + pnpm (monorepo).
- Para la app Electron: `electron` + `electron-builder` (devDeps; se instalan con
  `pnpm install`).
- Para lectura serial: `serialport` (opcional, instalación manual).

> ⚠️ **Pendiente de instalación**: este paquete declara `electron` y
> `electron-builder` como devDependencies pero **no se ejecutó `pnpm install`**
> (sin red/ancho de banda al escribir esto). Antes de correr Electron, hacé
> `pnpm install` desde la raíz (actualiza `pnpm-lock.yaml`).

## Companion standalone (sin GUI)

```bash
pnpm --filter @webs/desktop start
```

Variables de entorno (todas opcionales):

| Variable    | Default  | Descripción                                    |
| ----------- | -------- | ---------------------------------------------- |
| `PORT_NAME` | (vacío)  | Puerto serial, p. ej. `COM3` o `/dev/ttyUSB0`. |
| `BAUD_RATE` | `9600`   | Baudios del puerto serial.                     |
| `WS_PORT`   | `4599`   | Puerto del servidor WebSocket.                 |

Sin `PORT_NAME` lee de `stdin` (keyboard wedge):

```bash
echo "CODIGO-QR-DE-PRUEBA" | pnpm --filter @webs/desktop start
```

### Protocolo WebSocket

```jsonc
{ "type": "ready", "data": { "protocol": "webs-desktop-bridge/1.0", "version": "<SYSTEM_VERSION>", "source": "serial", "port": "COM3", "server": "ws://localhost:4599" } }
{ "type": "scan",  "data": { "code": "uuid-del-qr", "source": "serial", "port": "COM3", "at": "2026-01-01T00:00:00.000Z" } }
{ "type": "pong" }
```

## App Electron

```bash
# Dev (carga el dev server de Vite en http://localhost:5173):
pnpm --filter @webs/desktop electron:dev

# Producción local (carga apps/web/dist/index.html):
pnpm --filter @webs/web build
pnpm --filter @webs/desktop electron:start

# Empaquetar instaladores (.exe NSIS, .AppImage, .deb):
pnpm --filter @webs/desktop dist
```

Variables de entorno:

| Variable       | Default | Descripción                                                    |
| -------------- | ------- | -------------------------------------------------------------- |
| `ELECTRON_DEV` | —       | `=1` equivalente a pasar `--dev` (carga localhost:5173).       |
| `WEB_URL`      | (vacío) | URL remota del panel (p. ej. el sitio desplegado).             |
| `KIOSK`        | —       | `=1` abre en modo kiosco.                                      |
| `PORT_NAME`    | (vacío) | Puerto serial del lector (el puente lo lee dentro de la app).  |

La ventana usa `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
una sola instancia (`requestSingleInstanceLock`) y un preload (`electron/preload.cjs`)
que expone `window.websDesktop = { version(), onScan(cb) }`. El main arranca el
WebSocket `4599` con la misma `src/bridge.js` del companion y reenvía cada lectura
por IPC (`webs:scan`).

## Qué falta (pendiente)

- **`pnpm install`**: resolver `electron`/`electron-builder` y regenerar
  `pnpm-lock.yaml`.
- **Firma de código**: Windows Authenticode (`.exe` sin firmar muestra aviso de
  SmartScreen) y firma de paquetes Linux. No configurada.
- **Auto-update**: requiere `electron-updater` + firma; **no instalado a propósito**.
- **`serialport` dentro de Electron**: es un módulo nativo y necesita
  `electron-rebuild` para el ABI de Electron (hoy solo se usa en el companion
  standalone, no en la app empaquetada).
- **Offline / API base**: cargar `apps/web/dist` por `file://` no llega a la API
  (rutas `/api/v1` relativas). Para una app autocontenida hay que compilar `apps/web`
  con `VITE_API_BASE_URL` apuntando al servidor, o usar `WEB_URL` al sitio desplegado.

## Estructura

```
apps/desktop/
├── package.json         # @webs/desktop: scripts start/electron:dev/electron:start/dist + build (electron-builder)
├── src/
│   ├── index.js         # companion standalone (entrada de consola)
│   └── bridge.js        # lógica compartida: WS 4599 + serial/stdin + normalizeBarcode
├── electron/
│   ├── main.js          # shell Electron (ESM): BrowserWindow + puente + IPC
│   └── preload.cjs      # preload seguro (CommonJS por sandbox)
└── README.md
```
