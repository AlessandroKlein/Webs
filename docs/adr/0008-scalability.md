# ADR-0008: Cierre de gaps de escalabilidad (Redis global, k8s, stateless, auto-scaling)

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 2)
- **Decisión:** Cerrar los gaps de escalabilidad documentados en
  `docs/architecture/scalability.md`: rate-limit **global en Redis** (`rate-limiter-flexible`),
  garantizar **stateless** total, y proveer **manifiestos Kubernetes** reproducibles
  (`k8s/`) con **auto-scaling** (HPA) y probes de liveness/readiness.

## Contexto

El estado actual (`docs/architecture/scalability.md`) ya es mayormente stateless y orientado a
escala horizontal, con huecos concretos:

- La API es **stateless** (JWT, estado en Postgres/Redis); WebSocket multi-instancia vía Redis
  pub/sub canal `webs:ws` (`apps/api/src/plugins/websocket.ts`); cliente `ioredis` con fallback
  `null` sin `REDIS_URL` (`apps/api/src/lib/redis.ts`).
- **Rate-limit en memoria por proceso**: `@fastify/rate-limit` (max 300, 1 min, por IP). Con N
  réplicas, cada una permite 300 → el límite efectivo es N×300. Necesita store Redis para ser
  global.
- **Kubernetes es «futuro»**: `infra/README.md` lo menciona, pero el directorio `k8s/` **no
  existe**. Solo hay `docker/docker-compose.yml` (postgres:16-alpine, mysql:8.4, redis:7-alpine,
  api, web/nginx), `Dockerfile.api`, `Dockerfile.web` y `nginx.conf`.
- Observabilidad ya cubierta: pino (redacta authorization/cookie/password/refreshToken), health
  `/health` (liveness) y `/health/ready` (readiness, `SELECT 1` → 503), audit no-bloqueante,
  paginación (`DEFAULT_PAGE_SIZE=20`, `MAX_PAGE_SIZE=100`).

## Decisión

### 1. Rate-limit global en Redis

- Sustituir `@fastify/rate-limit` (in-memory) por **`rate-limiter-flexible`** con backend
  **Redis** (`RateLimiterRedis`, ventana fija/deslizante), clave `webs:rl:<ip>` con TTL, para
  que el límite sea **global al cluster** independientemente del número de réplicas.
- Conservar fallback **en memoria** solo para ejecución mononodo sin `REDIS_URL` (dev),
  documentado como no-global.
- Política base: mantener el contrato actual (p. ej. 300 req/min por IP) pero con umbrales por
  endpoint (auth más estricto), y clave por IP + (opcional) tenant en rutas autenticadas.

### 2. Stateless garantizado

- Formalizar: **ninguna** sesión/estado en proceso. Todo estado mutuable en Postgres o Redis;
  la sesión es el JWT (sin server-side session store).
- WebSocket no requiere afinidad de sesión: el fan-out por pub/sub (`webs:ws`) entrega en
  cualquier réplica. Documentar `sticky sessions` como **no requerido**.
- Definir **graceful shutdown**: ante `SIGTERM` → dejar de aceptar conexiones, drenar
  in-flight (grace period), cerrar Prisma/Redis. Es precondición del auto-scaling.
- Probes: `livenessProbe` → `/health`; `readinessProbe` → `/health/ready` (que ya hace
  `SELECT 1`).

### 3. Manifiestos Kubernetes (`k8s/`)

Crear el directorio `k8s/` (base + overlays `dev`/`prod`), con:

| Recurso | Contenido |
|---|---|
| `namespace.yaml` | Namespace `webs`. |
| `configmap.yaml` | Config no sensible (URL pública, paginación, feature flags). |
| `secret.yaml` | Referencia a secretos (external-secrets/sealed-secrets; nunca literales en repo): `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `JWT_*`. |
| `deployment-api.yaml` | `replicas: 3`, `resources.requests/limits`, `envFrom` configmap/secret, `livenessProbe`/`readinessProbe`, `terminationGracePeriodSeconds`, `readinessGates` opcionales. |
| `service-api.yaml` | `ClusterIP` (puerto interno). |
| `deployment-web.yaml` + `service-web.yaml` | nginx sirviendo estáticos de `apps/web` + reverse-proxy a `service-api` (reutiliza `nginx.conf`). |
| `ingress.yaml` | Ingress (TLS) hacia `service-web`. |
| `hpa-api.yaml` | HorizontalPodAutoscaler: `minReplicas: 2`, `maxReplicas: 10`, CPU/memoria 70 %. |
| `pdb.yaml` | PodDisruptionBudget (`minAvailable: 1`). |
| `migration-job.yaml` | `prisma migrate deploy` como `initContainer`/`Job` antes de escalar el rollout. |

- Estado (Postgres/Redis) **fuera del cluster** de aplicación: servicios gestionados
  (RDS/Cloud SQL, ElastiCache/Memorystore) o un operador dedicado; no en los manifests de app.

### 4. Auto-scaling

- **HPA** por CPU/memoria (métrica base) sobre `deployment-api`.
- Escalado por **eventos/cola** (opcional, KEDA) sobre longitud de cola Redis para trabajos
  asíncronos (email, export, etc.).
- El límite de concurrencia de Prisma/Postgres (pool) y de Redis se dimensiona por réplica;
  el auto-scaling añade réplicas, no hilos dentro de un proceso.

## Consecuencias

**Positivas**

- Límites de tasa coherentes en cluster; escala horizontal reproducible y self-healing.
- Stateless + probes + graceful shutdown hacen seguro el auto-scaling y los despliegues
  rolling.
- Redis queda como dependencia explícita (no opcional) para los invariantes de cluster.

**Negativas / costes**

- **Redis se vuelve hard-dependency** en producción (rate-limit global, pub/sub, cache): si cae,
  la app debe degradar de forma controlada (circuit-breaker/fallback documentado), no colgar.
- Complejidad operativa (manejo de secretos, HPA, migraciones como Job).
- Migración del rate-limit exige revalidar umbrales y evitar lock-outs por IP compartida
  (NAT/proxy) — revisar cabeceras `X-Forwarded-For` confiables detrás del ingress.

## Notas

- Baseline sync requerida: actualizar `docs/architecture/scalability.md` (rate-limit Redis,
  k8s, stateless garantizado) y crear `k8s/` en la tarea de implementación.
- Coherencia con ADR-0006: el scoping multi-tenant por filas no requiere particionar la base;
  la escalabilidad horizontal se logra con réplicas stateless de la API contra Postgres/Redis
  compartidos.
