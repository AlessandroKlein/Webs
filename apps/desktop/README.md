# @webs/desktop — Companion de escritorio

Companion de escritorio en Node.js que lee códigos de barras/QR desde un lector
físico conectado a la máquina (por **puerto serial** o en modo **keyboard
wedge**) y expone cada lectura a la web a través de un **WebSocket** en
`ws://localhost:4599`.

## Qué hace

- Abre un servidor WebSocket (`ws`) en `ws://localhost:4599`.
- Si `serialport` está disponible y definís `PORT_NAME`, lee del puerto serial y
  emite cada lectura como evento `scan`.
- Si no hay `serialport` o no configuraste puerto, queda en modo **keyboard
  wedge**: lee líneas desde `stdin` (un lector USB que se comporta como teclado
  tipea el código y envía Enter) y emite igual.
- Todo degrada con un mensaje claro si falta alguna dependencia opcional.

## Instalación

Desde la raíz del monorepo:

```bash
pnpm install
```

Las dependencias `ws` y `serialport` están declaradas como **opcionales**
(`optionalDependencies`), así que el proyecto arranca aunque no se puedan
instalar. Para el modo serial, asegurate de que `serialport` esté instalada:

```bash
pnpm --filter @webs/desktop add serialport
```

> En Windows, `serialport` suele traer binarios precompilados; si la instalación
> falla, necesitás las herramientas de compilación de Node.

## Configuración

Variables de entorno (todas opcionales):

| Variable    | Default  | Descripción                                    |
| ----------- | -------- | ---------------------------------------------- |
| `PORT_NAME` | (vacío)  | Puerto serial, p. ej. `COM3` o `/dev/ttyUSB0`. |
| `BAUD_RATE` | `9600`   | Baudios del puerto serial.                     |
| `WS_PORT`   | `4599`   | Puerto del servidor WebSocket.                 |

### Windows (PowerShell)

```powershell
$env:PORT_NAME = "COM3"
pnpm --filter @webs/desktop start
```

### Linux / macOS

```bash
PORT_NAME=/dev/ttyUSB0 pnpm --filter @webs/desktop start
```

Sin `PORT_NAME`, el companion lee de `stdin` (keyboard wedge):

```bash
echo "CODIGO-QR-DE-PRUEBA" | pnpm --filter @webs/desktop start
```

## Protocolo WebSocket

El servidor escucha en `ws://localhost:4599` y envía mensajes JSON:

```jsonc
// Al conectarse (informa qué fuente está activa)
{ "type": "ready", "data": { "source": "serial", "port": "COM3", "server": "ws://localhost:4599" } }

// Cada lectura de código
{ "type": "scan", "data": { "code": "uuid-del-qr", "source": "serial", "port": "COM3", "at": "2026-01-01T00:00:00.000Z" } }

// Keepalive: el cliente envía "ping" y el server responde
{ "type": "pong" }
```

## Consumir desde la web

```js
const ws = new WebSocket('ws://localhost:4599');

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'scan') {
    console.log('Código leído:', msg.data.code);
    // Podrías completar el input de asistencia (o del POS) y llamar a
    // POST /api/v1/blocks/organizaciones/attendance/scan
    // con { qrcode: msg.data.code }.
  }
});
```

## Notas

- **Sin integración todavía**: este scaffold solo expone el WebSocket; la web
  puede consumirlo luego (asistencia, POS, etc.).
- El proceso se mantiene vivo aunque no haya entrada por stdin.
- En Windows, un lector «keyboard wedge» escribe en la ventana con foco; este
  companion lo captura cuando se ejecuta en una consola con el foco activo.

## Estructura

```
apps/desktop/
├── package.json     # @webs/desktop, script start, deps opcionales ws/serialport
├── src/index.js     # servidor WS + lectura serial/stdin
└── README.md
```
