# Móvil y escritorio — auditoría y plan de integración

> Estado: **M3** (app móvil nativa vía **Capacitor** integrada) · Relacionado:
> [plugin-system.md](plugin-system.md), [refactor-global.md](refactor-global.md),
> [guides/mobile-app.md](../guides/mobile-app.md),
> [guides/mobile-capacitor.md](../guides/mobile-capacitor.md).
> ADR de referencia: [0005-plugin-rename.md](../adr/0005-plugin-rename.md).

> **M3 — Capacitor integrado:** `apps/mobile` (`@webs/mobile`) es ahora un **host
> Capacitor** (Android/iOS, `@capacitor/core ^6`) que envuelve `apps/web`, además de la PWA
> de asistencia por QR. Ver la guía operativa
> [guides/mobile-capacitor.md](../guides/mobile-capacitor.md) para compilar/empaquetar y
> ejecutar las apps nativas. El companion de escritorio (`@webs/desktop`) se mantiene como
> puente WebSocket para lectores serial/keyboard-wedge.

## Resumen ejecutivo

`apps/mobile` es una PWA de **asistencia** (vanilla JS + Vite) y `apps/desktop` un
**companion de escritorio** (Node.js) que lee lectores de códigos seriales o
keyboard-wedge y los expone por WebSocket. Ambos estaban desconectados del sistema
de plugins y usaban la ruta pre-rename `/api/v1/blocks/...`, que quedó **rota** tras
la migración Bloques→Plugins.

Este documento registra la auditoría, el prototipo entregado en M1 y el plan para la
integración completa en M2.

## 1. Estado actual (auditoría)

### 1.1 `apps/mobile` (`@webs/mobile`)

PWA "Webs Asistencia" para la toma de asistencia en gimnasios por QR.

| Aspecto | Estado |
| --- | --- |
| Stack | Vanilla HTML/JS + Vite, **sin framework** (ni React ni plugin-sdk). |
| Base de la PWA | `/asistencia/` (`vite.config.js`), service worker `sw.js`. |
| Autenticación | Token manual (`localStorage.webs.mobile.token`), `Authorization: Bearer`. |
| Endpoint | `POST /api/v1/blocks/organizaciones/attendance/scan` (hardcodeado, **roto**). |
| Lectores | Solo keyboard-wedge (Enter en un input). Sin serial, sin cámara, sin normalización AIM/GS1. |
| Estado | Scaffold funcional pero sin conexión con el resto de la plataforma. |

### 1.2 `apps/desktop` (`@webs/desktop`)

Companion Node.js que convierte lecturas de hardware en eventos WebSocket.

| Aspecto | Estado |
| --- | --- |
| Fuentes | Puerto serial (`serialport`, opcional) o stdin (keyboard-wedge). |
| Salida | WebSocket `ws://localhost:4599`, eventos `ready` / `scan` / `pong`. |
| Normalización | **Ausente** (emitía el código crudo, con `\n` y posibles prefijos AIM/GS1). |
| Protocolo | Sin versión ni handshake. |
| Consumidor | Ninguno (scaffold "sin integración todavía"). |

### 1.3 Integración con el sistema de plugins

El plugin `organizaciones` expone la asistencia como **rutas propias** registradas
bajo el prefijo del plugin:

- `POST /api/v1/plugins/organizaciones/attendance/scan` — registra asistencia por QR
  (autenticado, body `{ qrcode }`).
- `POST /api/v1/plugins/organizaciones/attendance/external` — **público**, pensado para
  lectores externos: header `X-Scanner-Key` + body `{ scannerId }`.
- `GET /api/v1/plugins/organizaciones/attendance` y `/attendance/stats`.

La PWA no usa el SDK de plugins (es vanilla JS): llama directo a HTTP. Eso es correcto
para M1 (bajo costo), pero impide renderizar componentes de cliente de plugins en el móvil.

### 1.4 Lectores de códigos externos

- **Web (React)**: existe `apps/web/src/components/ui/BarcodeScanner.tsx` (de la tarea
  t4) con `normalizeBarcode()` (quita `\n`, `\t` y prefijos AIM/GS1 `]C0`/`]E0`),
  estados `idle/listening/processing/error` y slot de cámara. **No** está cableado en
  `StaffDashboard`.
- **Móvil**: sin normalización y sin soporte de serial/cámara.
- **Desktop**: sin normalización.

## 2. Hallazgos

| Id | Severidad | Hallazgo | Resolución |
| --- | --- | --- | --- |
| H1 | blocker | `apps/mobile` y `StaffDashboard`/`OrganizationsPage` (web) apuntan a `/api/v1/blocks/organizaciones/attendance/scan`, que quedó rota: el shim `/blocks` solo re-registra el **CRUD** de plugins (install/catalog/settings), no las sub-rutas de cada plugin. La ruta canónica es `/api/v1/plugins/organizaciones/attendance/scan`. | Corregido en el móvil (M1). Web queda como follow-up (fuera de alcance de t14). |
| H2 | high | Normalización de códigos duplicada/inexistente en web vs móvil vs desktop. | Unificada: `normalizeBarcode` idéntico en web (t4), `apps/mobile/src/barcode.js` y `apps/desktop/src/index.js`. |
| H3 | medium | El móvil no reutiliza el SDK: cualquier cambio en el contrato del plugin requiere tocar JS a mano. | Documentado como deuda; se resuelve en M2 con render de plugins (o clientes nativos). |
| H4 | medium | El companion de escritorio no tenía protocolo versionado. | Añadido `protocol: webs-desktop-bridge/1.0` + `version` en `ready`. |
| H5 | low | `apps/mobile` no valida el origen WS ni reconecta. | `connectDesktopBridge()` con reconexión con backoff y estado accesible. |

## 3. Prototipo entregado (M1)

### 3.1 `apps/mobile/src/barcode.js` (nuevo)

- `normalizeBarcode(raw)` — idéntico al de web/desktop.
- `connectDesktopBridge({ url, onCode, onStatus })` — cliente WebSocket con
  reconexión exponencial (1s→30s) y estados `connecting/open/closed/error`.
  Devuelve `{ close() }`.

### 3.2 `apps/mobile/src/main.js`

- Endpoint corregido a `/api/v1/plugins/organizaciones/attendance/scan`.
- `registrar()` normaliza el código antes de enviar.
- Cámara con `BarcodeDetector` (mejora progresiva, botón oculto si no hay soporte).
- Puente con `@webs/desktop`: campo `bridge-url` en Ajustes (persistido), status
  visible, los códigos del puente alimentan el mismo `registrar()`.
- `index.html` + `style.css`: botón "Cámara", indicador `#bridge-status`, campo
  `#bridge-url`.

### 3.3 `apps/desktop/src/index.js`

- `normalizeBarcode()` y `emitScan` normaliza/descarta vacíos.
- `ready` incluye `protocol` y `version`.
- `README.md` actualizado (protocolo + consumidor).

## 4. Plan de integración (M2)

### 4.1 Render de plugins en la PWA (prioridad alta)

Hoy el móvil llama al endpoint de asistencia a mano. Para que la PWA sea una base
"universal" debe renderizar componentes de cliente de plugins igual que la web:

1. Extraer el **runtime de cliente** de `@webs/plugin-sdk` para que funcione sin
   React (el `mount(ctx)` recibe `container` como `HTMLElement`; hoy la web lo usa
   con React pero el contrato es agnóstico).
2. Un mini-host en `apps/mobile` que cargue `clientEntry` de los plugins instalados
   (vía `GET /api/v1/plugins` + `GET /api/v1/public/menu`), resuelva el módulo y
   llame a `mount({ container, slot, locale, config, api, i18n, theme })`.
3. Reemplazar el endpoint hardcodeado por el slot/plugin real y su configuración.

### 4.2 Clientes nativos (opcional, M2 tardío)

- `apps/mobile` hoy es PWA; el camino nativo (Capacitor/React Native) solo se
  justifica para acceso a cámara/HID de bajo nivel. La PWA + `BarcodeDetector` +
  el companion cubren el caso de trabajadores sin store de apps.
- Mantener el protocolo `webs-desktop-bridge/1.0` como contrato estable para que
  cualquier cliente (web, PWA, nativo) consuma lectores de hardware.

### 4.3 Lectores externos sin compañero de escritorio

`POST /api/v1/plugins/organizaciones/attendance/external` ya permite que un lector
"headless" (o un kiosco) envíe directamente con `X-Scanner-Key`. Opción a validar en
M2: el companion podría firmar/reenviar a ese endpoint en vez de pasar por la PWA,
para escenarios donde el operador no tiene el navegador abierto.

## 5. Decisiones y riesgos

| Decisión | Justificación | Riesgo / mitigación |
| --- | --- | --- |
| Mantener la PWA vanilla (sin React) en M1 | Cero dependencias, corre en cualquier navegador de trabajador; la integración de plugins es M2. | Duplicación del endpoint; mitigada por `barcode.js` centralizado y doc de deuda (H3). |
| Normalizar en el **borde** (companion y PWA), no en la API | Cada lector/envío llega limpio sin depender de que la API conozca los prefijos de cada hardware. | Si un cliente olvida normalizar, la API recibe crudo; mitigado al tener la misma función en los 3 clientes. |
| Puente WebSocket local (loopback) en vez de llamada directa a la API | Evita exponer el token de la PWA al companion; un solo flujo de `registrar()` para las 3 fuentes (manual/wedge/serial/cámara). | El companion queda acotado a localhost; el endpoint `external` cubre el caso remoto (ver §4.3). |

## 6. Seguimiento fuera de alcance (t14)

- `apps/web/src/features/staff/StaffDashboard.tsx` y `OrganizationsPage.tsx` siguen
  usando `/api/v1/blocks/organizaciones/attendance/scan` (H1) y no usan
  `BarcodeScanner`. Corregir en una tarea web posterior.
- `apps/mobile/README.md` y `docs/guides/mobile-app.md` deben sincronizarse con el
  endpoint canónico y el puente.
