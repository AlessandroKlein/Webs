# Terminales y lectores de código (POS / inventario)

Cómo montar un punto de venta o un puesto de inventario con lectores de código de
barras/QR en Webs. Hay tres vías de entrada, más una PWA que las orquesta:

| Vía | Dónde vive | Cuándo usarla |
|-----|------------|----------------|
| HID / keyboard-wedge | `apps/web/src/components/ui/BarcodeScanner.tsx` | Lector USB que se comporta como teclado. |
| Serial / USB | `apps/desktop/src/index.js` + `ws://localhost:4599` | Lector serial que no tipea; necesita companion de escritorio. |
| Cámara | `apps/web/src/components/ui/CameraScanner.tsx` | Escaneo por cámara del dispositivo (mejora progresiva). |
| PWA móvil | `apps/mobile` | Asistencia/registro desde celular, orquesta las tres vías. |

## 1. Lector HID (keyboard-wedge)

Un lector HID se comporta como teclado: tipea el código (con o sin `Enter`) muy
rápido. El componente [`BarcodeScanner`](../../apps/web/src/components/ui/BarcodeScanner.tsx)
mantiene el foco en un `<input>`, detecta el `Enter` y, si no llega, usa un
temporizador de «asentamiento» (`settleMs`, por defecto `120` ms) para lectores que
no envían `Enter` ([líneas 44-54](../../apps/web/src/components/ui/BarcodeScanner.tsx)).

- `normalizeBarcode()` ([línea 27](../../apps/web/src/components/ui/BarcodeScanner.tsx))
  quita saltos de línea/tabulaciones y prefijos AIM/GS1 (`]C0`, `]E0`).
- Estados accesibles con `aria-live`: `idle → listening → processing → error`.
- Escritura manual como fallback; botón opcional de cámara (`allowCamera`).

## 2. Lector serial / USB (companion de escritorio)

Para lectores seriales que no emulan teclado, está el companion
[`@webs/desktop`](../../apps/desktop) (`apps/desktop/src/index.js`). Abre un
servidor WebSocket en **`ws://localhost:4599`** y emite cada lectura como evento
`scan` ([líneas 10-11 y 24](../../apps/desktop/src/index.js)).

- Fuentes ([líneas 4-17](../../apps/desktop/src/index.js)):
  - **Serial USB**: usa `serialport` (opcional) si está instalado y `PORT_NAME`
    está definido (p. ej. `COM3`, `/dev/ttyUSB0`), `BAUD_RATE` por defecto `9600`.
  - **Keyboard wedge**: lee de `stdin` si no hay puerto serial.
- Protocolo mínimo de keepalive: `ping` → `pong` ([líneas 147-152](../../apps/desktop/src/index.js)).
- `serialport` y `ws` se cargan dinámicamente; si faltan, degrada con un mensaje
  claro en lugar de fallar ([líneas 72-90](../../apps/desktop/src/index.js)).
- Variables de entorno: `PORT_NAME`, `BAUD_RATE`, `WS_PORT`.

## 3. Lector por cámara (`BarcodeDetector`)

[`CameraScanner`](../../apps/web/src/components/ui/CameraScanner.tsx) usa la API
nativa **`BarcodeDetector`** ([líneas 8-10 y 24-38](../../apps/web/src/components/ui/CameraScanner.tsx)):
soporta `qr_code`, `ean_13/8`, `upc_a/e`, `code_128/39/93`, `codabar`, `itf`,
`data_matrix`, `aztec` y `pdf417`.

- **Soporte de navegador**: Chrome/Android WebView y Safari 17+; **Firefox no**
  implementa `BarcodeDetector` ([línea 91-94](../../apps/web/src/components/ui/CameraScanner.tsx)):
  en ese caso informa el fallback manual/HID.
- Al detectar un código emite `onCode` una única vez y cierra; limpia el stream de
  cámara al cerrar/desmontar para liberar el sensor ([líneas 142-147](../../apps/web/src/components/ui/CameraScanner.tsx)).

## 4. PWA móvil (`apps/mobile`)

La PWA [`@webs/mobile`](../../apps/mobile) (`apps/mobile/src/main.js`) registra
asistencia por QR contra `POST /api/v1/plugins/organizaciones/attendance/scan`
([líneas 2-19](../../apps/mobile/src/main.js)) y orquesta las tres vías:

- **HID** desde el input (detecta `Enter`) — [`main.js` líneas 287-293](../../apps/mobile/src/main.js).
- **Cámara** con `BarcodeDetector` (mejora progresiva; botón oculto sin soporte) —
  [`main.js` líneas 190-248](../../apps/mobile/src/main.js).
- **Puente con el companion**: `connectDesktopBridge()` en
  [`apps/mobile/src/barcode.js`](../../apps/mobile/src/barcode.js) reconecta con
  backoff a `ws://localhost:4599` y re-despacha cada `scan` normalizado
  ([barcode.js líneas 28-75](../../apps/mobile/src/barcode.js)).
- Instalable (PWA): `beforeinstallprompt` + service worker
  ([`main.js` líneas 315-338](../../apps/mobile/src/main.js)).
- `normalizeBarcode` está replicado sin React en `apps/mobile/src/barcode.js` y en
  el companion, para que las tres vías compartan el criterio de normalización
  ([barcode.js líneas 4-16](../../apps/mobile/src/barcode.js)).

## 5. Limitaciones de despliegue (reales)

- **`getUserMedia` solo en contexto seguro**: el acceso a cámara requiere HTTPS o
  `localhost`. Desde una página servida por HTTP plano (sin TLS), el navegador
  bloquea la cámara; `CameraScanner` y la PWA lo capturan como error de permisos
  ([`CameraScanner.tsx` líneas 97-106](../../apps/web/src/components/ui/CameraScanner.tsx),
  [`main.js` líneas 210-214](../../apps/mobile/src/main.js)).
- **`ws://` se bloquea desde una página HTTPS**: el puente al companion usa
  `ws://localhost:4599` (no `wss://`). Si la PWA se sirve por HTTPS, el navegador
  rechaza ese WebSocket por *mixed content*. En producción habría que exponer el
  companion con `wss://` (TLS) o terminar TLS en un reverse proxy — **pendiente de
  implementar** (hoy el valor por defecto es `ws://`).

## Referencias

- [`architecture/mobile-desktop.md`](../architecture/mobile-desktop.md) — auditoría
  y plan de integración PWA/Capacitor + companion de escritorio.
- [`plugins/pos`](../../plugins/pos) — plugin de cobro contra entrega / POS
  (`@webs/plugin-pos`), que consume estos lectores en el flujo de venta.
