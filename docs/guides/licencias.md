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

## Límites conocidos (siguientes fases)

- La verificación es **offline** con firma; el binario on-prem siempre es
  parcheable. Las capas de refuerzo (binding a instalación, reloj monótono,
  activaciones y telemetría) están diseñadas en
  `.agent-teams/research/11-licensify-anti-bypass.md` y se implementan en fases.
- La UI todavía no oculta los ítems de menú de módulos sin licencia: los muestra
  y el API responde `404`. Se resuelve exponiendo el estado de features al shell.
