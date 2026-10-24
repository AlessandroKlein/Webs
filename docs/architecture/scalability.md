# Escalabilidad

## Principio rector: API stateless

La API de Webs está diseñada para ser **stateless**. El proceso no guarda estado de
negocio en memoria: todo el estado persistente vive en **PostgreSQL** y el estado efímero
compartido (pub/sub de WebSocket, caché, rate limiting en cluster) se apoya en **Redis**.

`apps/api/src/index.ts` lo deja explícito:

> «…se puede escalar horizontalmente (múltiples procesos con `node dist/index.js` detrás
> de un balanceador, o en Kubernetes con N réplicas); Redis se encarga de sincronizar
> WebSocket y caché.»

## Escalado horizontal

Cualquier número de réplicas de la API puede atender peticiones detrás de un balanceador.
Requisitos compartidos (según `infra/README.md`):

- **PostgreSQL** — estado persistente (instancia única o réplicas de lectura).
- **Redis** — pub/sub para sincronizar WebSocket entre instancias, caché y rate limiting
  global.

### Sincronización de WebSocket entre instancias

`apps/api/src/plugins/websocket.ts` expone un WebSocket JSON en `/ws` (mensajes
`subscribe` / `unsubscribe` / `publish` / `ping`). Sin Redis, `broadcast` es local al
proceso. Con `REDIS_URL` configurada, se crean conexiones `pub`/`sub` duplicadas y se
publica en el canal `webs:ws`:

```ts
const pub = redis.duplicate();
const sub = redis.duplicate();
void sub.subscribe('webs:ws');
sub.on('message', (_ch, message) => {
  const { channel, payload } = JSON.parse(message);
  broadcast(channel, payload);           // re-broadcast local
});
broadcast = (channel, payload) => {
  localBroadcast(channel, payload);      // entrega local
  void pub.publish('webs:ws', JSON.stringify({ channel, payload })); // replica
};
```

Así, un mensaje publicado en una instancia llega a los suscriptores de **todas** las
instancias.

### Redis como caché y store de rate limiting

`apps/api/src/lib/redis.ts` crea un cliente `ioredis` (opcional, `null` sin `REDIS_URL`):

```ts
export function createRedis(url?: string): Redis | null {
  if (!url) return null;
  const client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  void client.connect().catch((err) => console.warn('[redis] no se pudo conectar:', err?.message));
  return client;
}
```

El cliente se expone como `fastify.redis` (`apps/api/src/plugins/redis.ts`) y también a
los plugins como `services.cache` / `services.events`.

`apps/api/src/plugins/rate-limit.ts` usa `@fastify/rate-limit` con un store **en memoria
por proceso** (`max: 300`, `timeWindow: '1 minute'`, clave por IP). El propio plugin
documenta que, en cluster, debe conectarse un store Redis para que el límite sea **global**:

> «En un despliegue en cluster, conectar un store Redis (`@fastify/rate-limit` acepta
> `redis` como store) para que el límite sea global y no por instancia.»

### Rate limiting global en Redis (ADR-0008)

El [ADR-0008](../adr/0008-scalability.md) decide sustituir el store en memoria por
**`rate-limiter-flexible`** con backend **Redis** (`RateLimiterRedis`, ventana fija/deslizante,
clave `webs:rl:<ip>` con TTL), de modo que el límite sea **global al cluster**
independientemente del número de réplicas (hoy, con N réplicas, cada una permite 300 req/min →
límite efectivo N×300).

- Se conserva un fallback **en memoria** solo para ejecución mononodo sin `REDIS_URL` (dev),
  documentado como no-global.
- Política base: mantener el contrato actual (300 req/min por IP) con umbrales por endpoint
  (auth más estricto) y clave por IP + (opcional) tenant en rutas autenticadas.
- Detrás del ingress se respeta `X-Forwarded-For` (`trustProxy: true`) para evitar lock-outs por
  IP compartida (NAT/proxy).

## Contenedores

`docker/` contiene los artefactos de contenedorización:

| Archivo | Propósito |
|---------|-----------|
| `docker-compose.yml` | Orquesta `postgres:16-alpine`, `mysql:8.4`, `redis:7-alpine`, `api` y `web` (nginx). |
| `docker/Dockerfile.api` | Multi-etapa: `pnpm install --frozen-lockfile`, `prisma generate`, `pnpm -r build`, `CMD node apps/api/dist/index.js`. |
| `docker/Dockerfile.web` | Build estático (`vite build`) y servido por `nginx:alpine`. |
| `docker/nginx.conf` | SPA fallback, proxy `/api/`, `/ws` (upgrade WebSocket) y `/docs/` al servicio `api`. |

El `api` arranca migraciones y seed en su `command`:

```text
pnpm --filter @webs/api exec prisma migrate deploy
pnpm --filter @webs/api exec prisma db seed
node apps/api/dist/index.js
```

## Kubernetes (ADR-0008)

El [ADR-0008](../adr/0008-scalability.md) define el despliegue objetivo reproducible con
manifiestos en el directorio `k8s/` (base + overlays `dev`/`prod`):

| Recurso | Contenido |
|---|---|
| `namespace.yaml` | Namespace `webs`. |
| `configmap.yaml` | Config no sensible (URL pública, paginación, feature flags). |
| `secret.yaml` | Referencia a secretos (external-secrets/sealed-secrets; **nunca** literales): `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `JWT_*`, `LICENSE_PUBLIC_KEY`, `UPDATE_PUBLIC_KEY`. |
| `deployment-api.yaml` | `replicas: 3`, `resources.requests/limits`, `envFrom` configmap/secret, `livenessProbe`/`readinessProbe`, `terminationGracePeriodSeconds`. |
| `service-api.yaml` | `ClusterIP` (puerto interno). |
| `deployment-web.yaml` + `service-web.yaml` | nginx sirviendo estáticos de `apps/web` + reverse-proxy a `service-api` (reutiliza `docker/nginx.conf`). |
| `ingress.yaml` | Ingress (TLS) hacia `service-web`. |
| `hpa-api.yaml` | HorizontalPodAutoscaler: `minReplicas: 2`, `maxReplicas: 10`, CPU/memoria 70 %. |
| `pdb.yaml` | PodDisruptionBudget (`minAvailable: 1`). |
| `migration-job.yaml` | `prisma migrate deploy` como `initContainer`/`Job` antes de escalar el rollout. |

El estado (Postgres/Redis) vive **fuera del cluster** de aplicación: servicios gestionados
(RDS/Cloud SQL, ElastiCache/Memorystore) o un operador dedicado; no en los manifests de app.

### Stateless garantizado y auto-scaling

- **Ninguna** sesión/estado en proceso: todo estado mutuable en Postgres o Redis; la sesión es
  el JWT (sin server-side session store). WebSocket no requiere afinidad de sesión (fan-out por
  pub/sub `webs:ws`), por lo que **`sticky sessions` no es requerido**.
- **Graceful shutdown** (precondición del auto-scaling): ante `SIGTERM` → dejar de aceptar
  conexiones, drenar in-flight (grace period) y cerrar Prisma/Redis.
- **Probes**: `livenessProbe` → `/health`; `readinessProbe` → `/health/ready` (que ya hace
  `SELECT 1`).
- **HPA** por CPU/memoria sobre `deployment-api`; escalado por eventos/cola (opcional, KEDA)
  sobre longitud de cola Redis para trabajos asíncronos (email, export, etc.).
- El límite de concurrencia de Prisma/Postgres (pool) y de Redis se dimensiona **por réplica**;
  el auto-scaling añade réplicas, no hilos dentro de un proceso.

### Redis como dependencia de producción

Con el rate-limit global, el pub/sub de WebSocket y la caché, Redis se vuelve **hard-dependency**
en producción. Si cae, la app debe degradar de forma controlada (circuit-breaker/fallback
documentado), no colgar.

## Escalabilidad selectable (ADR-0025)

El [ADR-0025](../adr/0025-scalable-selectable.md) extiende el HPA de M2 para que el usuario
elija, **desde el panel y por workload** (`api`, `web`), entre escalado **horizontal (HPA)** y
**vertical (VPA)**, con los modos verticales **Auto / Recommender / Initial**.

> **Estado (M11, implementado)**: módulo `apps/api/src/modules/scaling.ts` (registrado bajo
> `/api/v1`), panel `/admin/scaling` (`apps/web`), manifiestos `deploy/k8s/vpa-api.yaml` +
> `vpa-web.yaml`, y `deploy/k8s/configmap.yaml` con las 20 claves `SCALING_*` (10 por workload).

### Selector por workload

| Workload | Modo | Efecto |
|---|---|---|
| `api` | `horizontal` | `HorizontalPodAutoscaler` (`autoscaling/v2`, CPU/mem 70 %, 2→10). |
| `api` | `vertical` | `VerticalPodAutoscaler` (`autoscaling.k8s.io/v1`) con `updateMode` Auto/Off/Initial. |
| `web` | `horizontal` / `vertical` | Ídem para el deployment de nginx. |

La selección se **persiste en la tabla `settings`** (clave `scaling`, JSON) vía
`PUT /api/v1/system/scaling`, por lo que **sobrevive al reinicio** de la API. Los manifiestos de
`deploy/k8s/configmap.yaml` exponen el equivalente como claves `SCALING_*` (10 por workload) para
arranques en cluster; el panel y la API son la fuente de verdad en runtime.

```jsonc
{
  "workloads": [
    { "name": "api",  "mode": "horizontal", "hpa": { "min": 2, "max": 10, "cpuTargetPct": 70, "memTargetPct": 70 } },
    { "name": "web",  "mode": "vertical",
      "vpa": { "updateMode": "Off", "minAllowed": { "cpu": "100m", "memory": "128Mi" },
               "maxAllowed": { "cpu": "2", "memory": "4Gi" }, "controlledResources": ["cpu", "memory"] } }
  ]
}
```

### Modos verticales (VPA)

El VPA requiere el **operador VPA** (`kubernetes/autoscaler`: `recommender`, `updater`,
`admission-controller`) instalado en el cluster.

| Modo UI | `updateMode` | Comportamiento |
|---|---|---|
| **Auto** | `Auto` | Aplica recomendaciones y reinicia pods cuando hace falta. |
| **Recommender** | `Off` | Calcula y publica recomendaciones (visibles), no las aplica. |
| **Initial** | `Initial` | Aplica recomendaciones solo al crear el pod. |

Parámetros configurables (`spec.resourcePolicy.containerPolicies`): `minAllowed`/`maxAllowed`
CPU y memoria + `controlledResources: ["cpu", "memory"]` por contenedor.

### Regla de exclusión HPA vs VPA

**HPA y VPA no pueden activarse a la vez sobre CPU/memoria del mismo workload** (se pisan: el VPA
reescribe `requests`/`limits` que son la base de la métrica del HPA). El selector impone **uno u
otro por workload**.

- `PUT /api/v1/system/scaling` valida la guarda y responde **422** si la viola.
- **Coexistencia** (cuando se quieren ambos): `VPA` sobre **CPU/memoria** + `HPA` sobre
  **métricas custom** (p. ej. `KEDA` por longitud de cola Redis `webs:queue:*`), de modo que el
  HPA no usa las métricas que el VPA controla.

### Panel `/admin/scaling` y generación del manifiesto

La UI (`apps/web`, ruta `/admin/scaling`) consume `GET/PUT /api/v1/system/scaling` y
`GET /api/v1/system/scaling/export?workload=api|web&format=yaml`:

1. El operador elige **HPA** (modo `horizontal`, con `min`/`max` réplicas y target CPU/mem) o
   **VPA** (modo `vertical`, con `updateMode` Auto/Off/Initial y `minAllowed`/`maxAllowed` CPU/mem)
   por workload.
2. Al guardar, el backend valida la regla de exclusión (422 si conflicto) y persiste en `settings`.
3. El botón **Export YAML** descarga el manifiesto `HorizontalPodAutoscaler` (`autoscaling/v2`) o
   `VerticalPodAutoscaler` (`autoscaling.k8s.io/v1`) según el modo elegido, listo para `kubectl apply`.

> Aplicar el VPA requiere el **operador VPA** instalado en el cluster (prerrequisito). Sin el CRD,
> `kubectl apply -f deploy/k8s/vpa-api.yaml` falla — ver §6 de
> [`docs/guides/despliegue.md`](../guides/despliegue.md).

### Contrato de endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/v1/system/scaling` | admin (`scaling.read`) | Estado persistido + `recommendations` (si el VPA publica). |
| PUT | `/api/v1/system/scaling` | admin (`scaling.write`) | Actualiza selección/parámetros; valida exclusión (422 si viola). |
| GET | `/api/v1/system/scaling/export?workload=api&format=yaml` | admin (`scaling.read`) | Exporta el YAML del manifiesto (`HPA` o `VPA`) según la selección. |

Respuesta `GET /api/v1/system/scaling`:

```jsonc
{
  "workloads": [
    { "name": "api", "mode": "horizontal",
      "hpa": { "min": 2, "max": 10, "cpuTargetPct": 70, "memTargetPct": 70 },
      "vpa": null },
    { "name": "web", "mode": "vertical", "hpa": null,
      "vpa": { "updateMode": "Off", "minAllowed": { "cpu": "100m", "memory": "128Mi" },
               "maxAllowed": { "cpu": "2", "memory": "4Gi" }, "controlledResources": ["cpu", "memory"] } }
  ],
  "appliedAt": "2026-…",
  "recommendations": { "web": { "cpu": "300m", "memory": "640Mi" } }
}
```

### Template VPA (generado)

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api
  namespace: webs
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api
  updatePolicy:
    updateMode: Off            # Auto | Off | Initial
  resourcePolicy:
    containerPolicies:
      - containerName: api
        controlledResources: ["cpu", "memory"]
        minAllowed:
          cpu: 100m
          memory: 128Mi
        maxAllowed:
          cpu: "2"
          memory: 4Gi
```

El HPA generado reutiliza el `hpa-api.yaml` existente (con los parámetros configurables
`min`/`max`/`cpuTargetPct`/`memTargetPct`).

### Seguridad

Solo `role=admin`; toda escritura auditable (`AuditLog`, `action = scaling.update`). El export YAML
referencia `secretKeyRef` a `webs-secret` (nunca literales). El `ServiceAccount` del backend tiene
el menor privilegio (`get/list/watch/update` solo sobre `webs-scaling`), sin acceso a `Secret`.

## Observabilidad

### Logging estructurado (pino)

`apps/api/src/lib/logger.ts` crea el logger y Fastify lo reutiliza internamente:

```ts
export function createLogger(level = 'info'): Logger {
  return pino({
    level,
    base: { service: 'webs-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie',
              'password', 'passwordHash', 'refreshToken'],
      censor: '[REDACTED]',
    },
  });
}
```

El nivel se controla con `LOG_LEVEL` (`apps/api/src/config/env.ts`). `trustProxy: true`
está habilitado en `app.ts` para respetar `X-Forwarded-*` detrás del balanceador/nginx.

### Health checks

`apps/api/src/modules/health/index.ts` (sin autenticación):

```text
GET /health        → { status: 'ok', uptime }                       (liveness)
GET /health/ready  → 200 { status: 'ready' } o 503 si falla SELECT 1 (readiness, chequea DB)
```

### Auditoría

`apps/api/src/lib/audit.ts` registra acciones de forma **no bloqueante**:

```ts
export function audit(fastify, request, entry): void {
  void fastify.prisma.auditLog.create({ data: {...} }).catch(...);
}
```

Cada entrada (`AuditLog`) captura `actorId`, `action`, `resource`, `resourceId`,
`metadata`, `ip` y `createdAt` (índices en `actorId` y `createdAt`). Los módulos la usan
en acciones sensibles (login, cambios de settings, plugins, roles, contenido,
traducciones).

### Errores y request-id

`apps/api/src/plugins/error-handler.ts` serializa `AppError` y errores de validación en un
`ErrorBody` consistente (`code`, `message`, `details`, `requestId`), ocultando detalles
internos en los errores 500. Los códigos de error son estables y versionados
(`packages/core/src/errors.ts`).

### Paginación y límites

`apps/api/src/lib/pagination.ts` normaliza `page` (base 0) y `pageSize`
(`DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`), devolviendo un envoltorio `Page<T>`
(`items`, `total`, `page`, `pageSize`, `totalPages`).

## Discrepancias observadas

Estas discrepancias documentan el estado **actual** del código; el
[ADR-0008](../adr/0008-scalability.md) las resuelve como objetivo de Milestone 2:

1. **Rate limiting por instancia.** El store actual de `@fastify/rate-limit` es en memoria;
   el límite (300 req/min/IP) no es global hasta conectar un store Redis. **Resuelto por
   ADR-0008** (`rate-limiter-flexible` + Redis).
2. **Sin manifests de Kubernetes.** `infra/README.md` describe la estructura `k8s/` como
   «futuro»; no hay archivos YAML de Kubernetes en el repo. **Resuelto por ADR-0008** (crear
   `k8s/`).
