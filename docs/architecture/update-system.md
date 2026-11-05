# Sistema de actualización zero-downtime (app)

Implementación del **ADR-0010** para la actualización en caliente de la **app**. La
actualización de plugins (hot-reload con cache-busting) se implementa por separado; este
documento describe el módulo de la **app**: `apps/api/src/modules/update/`.

> **Caveat zero-downtime de plugins** (ADR-0010 §4): las rutas se registran en el boot y se
> *gatean* por estado de instalación, así que **instalar/desinstalar** activa/desactiva rutas de
> inmediato (sin reiniciar). En cambio, **actualizar** un plugin (nueva versión) refresca
> **metadata** (menú/traducciones/permisos) y **hooks** en caliente, pero los **handlers de ruta**
> de la versión nueva se renuevan en el próximo reinicio (Fastify 5 no re-registra rutas tras
> `listen()`). La app sí es zero-downtime real (rolling update/reload graceful).

## Endpoints

Todos bajo `/api/v1` y autenticados (`fastify.authenticate`):

| Endpoint | Método | Permiso | Función |
|----------|--------|---------|---------|
| `/system/update/check` | `POST` | `setting.read` | Consulta la última release de GitHub y compara con `SYSTEM_VERSION`. Devuelve `{ app: { version, latest, hasUpdate, changelog, … }, plugins: [] }`. |
| `/system/update/apply` | `POST` | `setting.write` | Aplica una actualización `{ target: 'app', version?, artifactUrl?, digest?, signature? }`. Devuelve `202` + `{ updateId }` y continúa en segundo plano. |
| `/system/update/status` | `GET` | `setting.read` | Estado por `?updateId=` o listado completo. |
| `/system/update/rollback` | `POST` | `setting.write` | Restaura el build anterior preservado en `data/updates/backup`. Devuelve `202`. |

## Estructura del módulo

| Archivo | Responsabilidad |
|---------|-----------------|
| `modules/update/index.ts` | Rutas Fastify + permisos + auditoría. |
| `modules/update/service.ts` | Máquina de estados, descarga, verificación, `check`/`apply`/`status`/`rollback`. |
| `modules/update/bootloader.ts` | Swap atómico, rolling update Docker, persistencia de versión. |
| `modules/update/verify.ts` | `sha256` (archivo/buffer) + firma `Ed25519` (cero dependencias). |

## Verificación de integridad y autenticidad

Todo artefacto se valida **antes** de ejecutarse. La **app** usa el formato de `@licensify/core`
(ADR-0007/0010), implementado aquí con los built-ins de `node:crypto` (mismo formato, sustituible
por ese paquete cuando se publique):

1. **sha256** del tarball completo (`sha256File`, streaming) contra el `digest` publicado.
2. **Firma Ed25519** de la clave pública del vendor sobre el **digest hex** (no el artefacto
   crudo). Clave pública PEM SPKI configurada en `UPDATE_PUBLIC_KEY`; la privada **nunca** está
   en runtime (verificación offline, anti-tamper). La firma se codifica en **base64url** y el
   mensaje firmado es el digest sha256 en hex (`verify.ts:37-45`).

> **Dos formatos Ed25519 — no confundir.** La **app** y la **activación de licencias** usan
> `@licensify/core` (payload canónico + firma **base64url**). El **manifiesto de plugin**
> (`plugin.json`) usa otro formato: firma sobre los **raw bytes** del manifiesto codificada en
> **base64** estándar (`plugins/loader.ts:460`, mismo que `installRemotePlugin`). Usar el
> verificador de `@licensify/core` para un manifiesto de plugin rechazaría firmas válidas. El
> updater de plugins (t28) reutiliza el `verify` de `node:crypto` del loader por esa razón.

La clave pública se provee por entorno: `UPDATE_PUBLIC_KEY=<PEM SPKI>`. Sin ella, `apply`
rechaza la actualización (no puede verificar autenticidad).

## Pipeline de `apply` (fases)

```
checking → downloading → verifying → staging → applying → healthcheck → done
                                                          ↘ failed
```

1. **checking** — resuelve versión destino (por `version` o la última release) y el artefacto
   (asset `.tar.gz` del release) más los metadatos de firma (`<tarball>.sha256`, `<tarball>.sig`
   como assets compañeros; o `digest`/`signature` explícitos en el body).
2. **downloading** — descarga el tarball a `data/updates/staging/<version>/artifact.tar.gz`.
3. **verifying** — `sha256` del archivo + `verifyEd25519(digest, signature, UPDATE_PUBLIC_KEY)`.
4. **staging** — extrae el tarball (requiere `tar`); el build nuevo queda en
   `staging/<version>/dist`.
5. **applying** — swap atómico (bare) o rolling update (Docker), ver modos abajo.
6. **healthcheck** — solo en Docker: espera `/health/ready` del contenedor nuevo. En bare lo
   asume el supervisor tras el reload.
7. **done** / **failed** — persiste la versión aplicada y cierra el registro.

## Modos de aplicación (`UPDATE_MODE`)

`UPDATE_MODE` puede ser `auto` (por defecto), `bare` o `docker`. En `auto` se detecta el
entorno: `.dockerenv` o `cgroup` con `docker`/`containerd` → Docker; si no, bare.

### Bare (single-host)

Swap **atómico** del directorio del build en el mismo filesystem (dos `rename`):

```text
apps/api/dist            → data/updates/backup     (build anterior, para rollback)
staging/<v>/dist         → apps/api/dist           (build nuevo)
```

Como `rename` es atómico en el mismo volumen, un lector concurrente jamás ve el directorio
ausente o a medio copiar. Si el segundo `rename` falla, se revierte el primero. El build nuevo
ya queda en su lugar; el **reload graceful** lo realiza el supervisor (systemd/PM2/k8s) que
reinicia/balancea el proceso, de modo que el bootloader **no** mata el proceso desde dentro
del request handler (evita cortar la conexión del que disparó la actualización).

> Nota Windows: `fs.rename` no sobrescribe un directorio existente; por eso el orden es
> `live→backup` y luego `staged→live`, y `backup` y `apps/api/dist` deben estar en el mismo
> volumen (siempre lo están: `backup` vive en `data/updates/`).

### Docker / k8s (rolling update)

```text
docker compose pull <UPDATE_DOCKER_SERVICE>
docker compose up -d --no-deps <UPDATE_DOCKER_SERVICE>
```

Se despliega la imagen nueva y se drena el contenedor anterior (orquestador). El servicio a
actualizar se configura con `UPDATE_DOCKER_SERVICE` (por defecto `api`). Tras el `up`, el
módulo espera `/health/ready` antes de marcar `done`.

## Rollback

`POST /system/update/rollback` restaura el build anterior:

- **Bare** — `atomicRollback`: `rm apps/api/dist` y `rename data/updates/backup → apps/api/dist`.
  El backup lo dejó el swap atómico; tras el rollback se borra la marca de backup.
- **Docker** — redeploy de la imagen de la versión anterior (manual u orquestador); el
  endpoint lo marca e informa (no puede mover imágenes de un contenedor vivo de forma segura).

## Estado persistido

- La **versión aplicada** se persiste en `data/updates/current-version.json`
  (`{ version, appliedAt, previousVersion, backupDir }`), leída por `status`/`rollback`.
- La **cola en memoria** (`Map<updateId, UpdateRecord>`) guarda las fases de las
  actualizaciones en curso/finalizadas durante la vida del proceso.

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `UPDATE_PUBLIC_KEY` | *(vacío)* | Clave pública Ed25519 (PEM SPKI) del vendor. Sin ella `apply` falla. |
| `UPDATE_MODE` | `auto` | `auto` detecta Docker vs bare; `bare`/`docker` fuerzan. |
| `UPDATE_DOCKER_SERVICE` | `api` | Servicio de Docker Compose a actualizar. |

## Pipeline de release (firma y adjunto de artefactos)

El workflow `.github/workflows/release.yml` (dispara con cada tag `v*`) construye el artefacto
de la app, lo firma y lo adjunta al GitHub Release. El formato DEBE coincidir exactamente con
`apps/api/src/modules/update/verify.ts` (sha256 hex + Ed25519 base64url sobre el digest hex).

### Generar el par de claves (una sola vez)

```bash
# Con OpenSSL (recomendado):
openssl genpkey -algorithm ED25519 -out update_private.pem
openssl pkey -in update_private.pem -pubout -out update_public.pem

# Alternativa con Node (mismo resultado):
node -e 'const {generateKeyPairSync}=require("crypto");const {publicKey,privateKey}=generateKeyPairSync("ed25519");console.log(privateKey.export({type:"pkcs8",format:"pem"}));console.log(publicKey.export({type:"spki",format:"pem"}))'
```

- **Clave pública** (`update_public.pem`, PEM SPKI) → se pone en `UPDATE_PUBLIC_KEY`
  (docker-compose.yml y deploy/k8s/configmap.yaml). Es pública, puede commitearse.
- **Clave privada** (`update_private.pem`, PKCS#8) → se carga como secreto de GitHub Actions
  `UPDATE_PRIVATE_KEY` (Settings → Secrets and variables → Actions). **NUNCA se commitea**.

> Rotación: para reemplazar el par, regenerar y actualizar el secreto `UPDATE_PRIVATE_KEY`
> y `UPDATE_PUBLIC_KEY` (compose/configmap) al mismo tiempo, o la verificación fallará.

### Qué produce el workflow

Para un tag `v2.11.0` adjunta tres assets al release:

| Asset | Contenido |
|-------|-----------|
| `webs-2.11.0.tar.gz` | Build de la API empaquetado (`apps/api/dist` como `dist/`). |
| `webs-2.11.0.tar.gz.sha256` | `sha256` hex del tarball (ASCII). |
| `webs-2.11.0.tar.gz.sig` | Firma Ed25519 **base64url** sobre el **digest hex** (no el tarball). |

El firmado lo hace `scripts/sign-release.mjs` (`node:crypto`, cero dependencias): calcula el
sha256, firma el digest en hex (UTF-8) con `crypto.sign(null, digest, privateKey)` y escribe los
dos sidecars. El runtime los lee como `<tarball>.sha256` y `<tarball>.sig` (ver `resolveArtifactUrl`
y `resolveAppRaw` en `modules/update/`).

## Verificación

- **Typecheck**: `pnpm -r typecheck` (el módulo no añade dependencias).
- **Swap sin caída**: `node scripts/test-update-swap.mjs` levanta un servidor mínimo que lee
  `version.txt` desde `live` en cada petición y ejecuta el swap atómico en paralelo,
  comprobando que **todas** las peticiones responden la versión vieja o la nueva (nunca
  `503`/error) y que el rollback restaura la anterior.
