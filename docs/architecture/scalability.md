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

## Kubernetes (futuro)

`infra/README.md` describe el despliegue objetivo para clientes grandes, con manifiestos
en `k8s/` (aún no creados):

- **api** — `Deployment` con N réplicas + `HorizontalPodAutoscaler` + `Service` + `Ingress`.
- **web** — build estático servido por nginx o CDN.
- **postgres** — operador (CloudNativePG) o servicio gestionado.
- **redis** — clúster gestionado (o Valkey).

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

1. **Rate limiting por instancia.** El store actual de `@fastify/rate-limit` es en memoria;
   el límite (300 req/min/IP) no es global hasta conectar un store Redis, tal como
   documenta el propio plugin. En un despliegue multi-réplica sin ese store, cada instancia
   contaría por separado.
2. **Sin manifests de Kubernetes.** `infra/README.md` describe la estructura `k8s/` como
   «futuro»; no hay archivos YAML de Kubernetes en el repo.
