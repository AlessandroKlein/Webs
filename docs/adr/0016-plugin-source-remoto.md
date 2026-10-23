# ADR-0016: Fuente de plugins — registro remoto (GitHub) y descarga al instalar

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 5 — v2.3.0)
- **Decisión:** Eliminar el estado «local» engañoso de los plugins del repositorio. El catálogo debe
  **marcar el origen real** de cada plugin (`git`/`npm` con su `url` de GitHub) y la instalación
  debe **descargar y verificar** el código desde ese origen (sha256 + firma Ed25519), en lugar de
  tratar los paquetes presentes en `plugins/` como si ya estuvieran «disponibles localmente».

## Contexto

El catálogo actual (`apps/api/src/plugins/catalog.ts`) distingue dos listas:

- **`local`**: `pluginRegistry.getAvailable()`, que devuelve **todos** los plugins descubiertos en el
  directorio físico `plugins/` (42 paquetes, entre ellos `example-block`, `ecommerce`, `inventario`,
  `mercadopago`…). Cada uno se expone como `source: 'local'`.
- **`remote`**: las entradas del índice de registro (`BLOCK_REGISTRY_URL` o `plugins/catalog.json`),
  con `source: 'git' | 'npm'`, `url`, `downloadUrl`, `sha256`, `publicKey`, `signature`, `verified`.

El problema es semántico y de seguridad:

1. **«local» es engañoso**: esos paquetes **no** son instalaciones locales del cliente — son artefactos
   del monorepo (primera parte) que viven en `plugins/` por conveniencia de desarrollo y CI. La UI del
   marketplace los muestra como si el cliente ya los tuviera, cuando en realidad su origen es GitHub.
2. **Doble vía de instalación**: `installPlugin()` exige que el manifiesto esté en
   `pluginRegistry.getAvailableManifest()` (descubrimiento local), mientras que `installRemotePlugin()`
   (que **sí** descarga de `git`/`npm`/tarball y verifica sha256 + firma Ed25519) se usa hoy solo en la
   ruta de *actualización* (`updatePlugin`). Resultado: instalar un plugin del repo **salta** la
   verificación de origen e integridad que sí aplica el marketplace remoto.
3. **Incoherencia con el marketplace**: el catálogo ya define `RegistryPluginEntry.source`/`url`/
   `sha256`/`signature`, pero los plugins del repo no pasan por ese contrato.

El flujo de descarga/verificación ya existe y es correcto (`stageRemotePlugin`, loader.ts:517-591):
clona/descarga, exige `sha256` del manifiesto y firma Ed25519 (`verifySignature`), y deja el paquete
*staged* sin ejecutar código no verificado. La decisión es **generalizar ese flujo** como única vía de
instalación y corregir el etiquetado de origen.

## Decisión

### 1. Origen real marcado en el catálogo

- `CatalogItem.source` deja de emitir `'local'` como origen visible. Todo plugin del catálogo lleva
  `source: 'git' | 'npm'` y `url` (repositorio GitHub o paquete npm) + `sha256`/`publicKey`/`signature`
  del manifiesto, **incluidos los plugins de primera parte** que hoy viven en `plugins/`.
- `PluginSource` conserva el literal `'local'` **solo** como marcador interno de «paquete ya presente en
  disco» (para distinguir «instalado» de «descargable»), nunca como origen de catálogo de cara al usuario.
- El índice de registro es la **única fuente de verdad de origen**: `plugins/catalog.json` (por defecto)
  o `BLOCK_REGISTRY_URL` (JSON remoto). Cada entrada declara `source`, `url`, `subdir?`, `sha256`,
  `publicKey`, `signature`, `verified`.

### 2. Instalación = descarga + verificación (única vía)

- `POST /api/v1/plugins/install` con un `id` de catálogo **siempre** resuelve la entrada del registro y
  ejecuta `stageRemotePlugin()` → `installRemotePlugin()`. El código se descarga (git clone `--depth 1`
  o tarball/npm), se verifica `sha256` + firma Ed25519 del `plugin.json`, y recién entonces se copia a
  `plugins/<id>` y se instala.
- `installPlugin()` queda como paso **interno** («instalar un paquete ya *staged* y verificado»), no como
  vía pública. Nunca se instala un paquete del repo por el mero hecho de estar en `plugins/`.

### 3. Descubrimiento de arranque (boot) sin falsos «instalados»

- `discoverPlugins()` sigue escaneando `plugins/` para **registrar las rutas** de los paquetes presentes
  (requisito de Fastify 5: registrar rutas antes de `listen()`), pero el **estado de instalación** lo
  decide exclusivamente la tabla `PluginInstallation`. Un paquete en disco sin fila `PluginInstallation`
  **no** aparece como «instalado» en el catálogo.
- Los plugins de primera parte conservan su directorio en el monorepo por conveniencia de build, pero su
  entrada de catálogo apunta a GitHub (`source: 'git'`, `url: github.com/AlessandroKlein/Webs`, `subdir:
  plugins/<id>`), de modo que el marketplace refleja el origen verdadero.

### 4. Nomenclatura del registro

- La variable canónica pasa a ser `PLUGIN_REGISTRY_URL`; `BLOCK_REGISTRY_URL` se conserva como alias
  `@deprecated` (mismo valor) por retrocompatibilidad, igual que `BLOCK_DIR` → `pluginsDir()`.

## Consecuencias

### Positivas

- **Origen honesto**: el marketplace muestra «de GitHub/npm», no «local».
- **Única vía de instalación** con integridad (sha256) y autenticidad (Ed25519) **siempre** aplicadas:
  se cierra el hueco por el que los plugins del repo se instalaban sin verificación.
- **Coherencia total** con el contrato `RegistryPluginEntry` ya definido en `catalog.ts`.

### Negativas

- Cada plugin de primera parte debe publicar una entrada de registro con `sha256`/`signature` vigentes por
  versión (el CI de release debe regenerar el índice firmado al publicar).
- La instalación requiere acceso a GitHub (o a un `downloadUrl`); sin red, el marketplace solo instala lo
  que ya esté *staged*/instalado. Se mitiga con un `catalog.json` precargado con tarballs autohospedados.
- `discoverPlugins` debe dejar de inferir «instalado» por presencia en disco: un cambio de semántica que
  hay que coordinar con el loader y los tests de arranque.

## Notas

- Contrato de registro y flujo de verificación: `apps/api/src/plugins/catalog.ts` y
  `apps/api/src/plugins/loader.ts` (`stageRemotePlugin`, `installRemotePlugin`, `updatePlugin`).
- Complementa ADR-0005 (rename) y ADR-0010 (actualizaciones, que ya reutiliza `stageRemotePlugin` para el
  swap atómico). La política de «todo nativo, sin modo de pago» sigue intacta: el registro es un JSON
  autohospedado (GitHub/HTTP), no un SaaS.
