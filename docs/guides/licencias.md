# Licencias y modo de pruebas

Webs separa el **núcleo** (siempre disponible) de los **módulos premium**, que solo
se montan si la licencia activa incluye su feature. Esto es lo que hace que una
instalación sin licencia no pueda usar lo premium sin modificar código.

## Cómo funciona el gate

1. Al arrancar, `apps/api/src/plugins/license.ts` carga la licencia y expone
   `app.license` (`hasFeature(feature)`, `status()`).
2. `apps/api/src/app.ts` registra cada módulo premium solo si su feature está
   licenciada; si no, el módulo **no se monta** y sus rutas responden `404`. El
   arranque informa en el log qué quedó deshabilitado.
3. El loader de plugins (`apps/api/src/plugins/loader.ts`) omite los plugins cuyo
   `manifest.feature` no esté licenciado (fail-closed).

Módulos gateados en la API: `templates`, `payments`, `expenses` (feature
`payments`), `scaling` (`multitenant`), `generated` (`generator`), `inventory` y
el plugin `crm` (`crm`).
Los plugins declaran su feature en `plugin.json` (20 manifiestos hoy: pagos,
envíos, IA, analytics, inventario y multitenant).

El núcleo (auth, usuarios, settings, páginas, público, health y licencia) siempre
se registra, para que la instancia pueda arrancar, mostrar el estado y permitir
cargar una licencia.

## Variables

| Variable | Valores | Efecto |
| --- | --- | --- |
| `LICENSE_MODE` | `auto` (default), `dev`, `production` | `auto` = `dev` si `NODE_ENV !== production`, si no `production`. |
| `LICENSE_PUBLIC_KEY` | PEM/base64 de la clave pública | Verifica la licencia. En producción sin clave la instancia arranca **solo con el núcleo**. |
| `NODE_ENV` | `development` \| `production` | Con `production`, `LICENSE_MODE=dev` **no arranca** (error explícito). |

## Probar todo en Docker

`docker-compose.yml` fija `NODE_ENV: development` y `LICENSE_MODE: dev` para el
servicio `api`. En ese modo `hasFeature()` devuelve `true` para todas las features
y `status()` informa `dev`, así que se puede probar tienda, pagos, inventario,
envíos y plugins sin emitir una licencia.

Ese modo **no puede activarse en producción**: `loadEnv()` lanza
`Configuración de licencia inválida: modo dev en producción` si
`NODE_ENV=production` y `LICENSE_MODE=dev`.

Para verificar el comportamiento real de una instalación sin licencia:

```bash
docker compose run --rm -e NODE_ENV=production -e LICENSE_MODE=production \
  -e LICENSE_PUBLIC_KEY= api node apps/api/dist/server.js
# o, con la imagen ya construida:
docker compose exec -e NODE_ENV=production -e LICENSE_MODE=production api ...
```

Con `NODE_ENV=production`, `LICENSE_MODE=production` y sin clave, la API arranca
con el núcleo y las rutas premium responden `404`. El log lista los módulos
omitidos.

`docker-compose.yml` trae un **par de desarrollo** (`LICENSE_PUBLIC_KEY` /
`LICENSE_PRIVATE_KEY`, Ed25519 en PEM) para probar la compra y activación de
una licencia de punta a punta en el stack local. **No va a producción**: la
privada de ese par es pública (está en el repo) y emite claves que cualquiera
podría generar; en producción hay que reemplazarlo por el par propio y cargar la
privada como secreto, nunca embebida en la app del cliente.

## Venta por checkout

Una licencia se puede vender como cualquier producto del checkout: al crear el
pago, el front envía `metadata: { kind: 'license', fingerprint: '…' }`. Cuando
llega el evento `payment.approved`, el módulo de licencias:

1. Si `metadata.kind === 'license'` (o trae `licensePlanId`), intenta emitir.
2. Es **idempotente por `paymentId`**: si ya existe un `licenseSale` con ese
   pago, no vuelve a emitir (un webhook repetido no duplica claves).
3. Requiere `LICENSE_PRIVATE_KEY` (la del vendedor) **y** `metadata.fingerprint`
   (la máquina destino). Si falta alguno, registra un warning y no emite.
4. Emite la clave con `createActivationKey` de `@licensify/core` (firma Ed25519
   + cifrado atado al fingerprint, node-locked) y crea el `licenseSale` + la
   `licenseKey` (`status: active`).

## Activar una clave (`activate-key`)

`POST /api/v1/license/activate-key` (sin sesión), cuerpo
`{ "activationKey": "…", "fingerprint": "…" }`. La activación se valida por
máquina:

| Resultado | Código | Motivo |
|-----------|--------|--------|
| Sin `LICENSE_PUBLIC_KEY` | `400` | `Licencias no configuradas` |
| `verifyActivationKey` falla | `400` | `Clave inválida para esta máquina` (firma no corresponde al fingerprint) |
| Clave no registrada | `404` | `Clave no registrada` |
| `status !== 'active'` | `409` | `Clave revocada o inactiva` |
| `activations` ya incluye el fingerprint | `200` | `{ ok, alreadyActive: true, activationsUsed, max }` |
| `activations.length >= limits.activations` | `409` | `Límite de activaciones alcanzado` + `{ activationsUsed, max }` |
| OK | `200` | `{ ok, alreadyActive: false, activationsUsed, max }` (agrega el fingerprint) |

`limits.activations` vale `1` por defecto (una máquina por clave); la clave
queda `node-locked` al primer fingerprint. Otras rutas: `GET/POST /sales`,
`POST /keys` (emitir o registrar una clave CLI), `POST /keys/validate`,
`POST /keys/:id/revoke`, `POST /activate`, `POST /deactivate`, `GET /`,
`GET /features`, `GET /fingerprint`.

## Límites conocidos (siguientes fases)

- La verificación es **offline** con firma; el binario on-prem siempre es
  parcheable. Las capas de refuerzo (binding a instalación, reloj monótono,
  activaciones y telemetría) están diseñadas en
  `.agent-teams/research/11-licensify-anti-bypass.md` y se implementan en fases.
- La UI todavía no oculta los ítems de menú de módulos sin licencia: los muestra
  y el API responde `404`. Se resuelve exponiendo el estado de features al shell.
