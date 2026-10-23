# Webs — Despliegue Kubernetes (ADR-0008)

Manifiestos de producción para la plataforma Webs (Fastify + React/Vite), alineados
con el multi-tenant por cadenas (ADR-0006, t22). Diseñados para ser **estateless**,
con **auto-scaling** (HPA) y **load balancing** sin sticky sessions.

> Los manifiestos son la entrega de la tarea t26. No se pushearon al repo remoto
> (la integración final corresponde a la release v2.0.0).

## Arquitectura desplegada

| Recurso | Manifiesto | Notas |
|---|---|---|
| Namespace | `namespace.yaml` | `webs` |
| Config no sensible | `configmap.yaml` | `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `UPDATE_MODE`, … |
| Secretos | `secret.yaml` | `DATABASE_URL`, `REDIS_URL`, `JWT_*` (≥32), `ENCRYPTION_KEY` |
| PVC uploads | `pvc.yaml` | Solo subidas/media + estado de instalación (ver nota) |
| API | `deployment-api.yaml` + `service-api.yaml` | `replicas: 3`, probes, `maxUnavailable: 0` |
| Web (nginx) | `deployment-web.yaml` + `service-web.yaml` | Estáticos + reverse proxy a `api` |
| Ingress | `ingress.yaml` | NGINX + TLS + security headers + WebSocket |
| HPA | `hpa-api.yaml` | CPU/memoria 70 %, 2→10 réplicas |
| PDB | `pdb.yaml` | `minAvailable: 1` (api y web) |
| Migración | `migration-job.yaml` | `prisma migrate deploy` (schema t22) |

El estado de datos (PostgreSQL, Redis) queda **fuera del cluster de aplicación**:
usar servicios gestionados (RDS/Cloud SQL, ElastiCache/Memorystore) o un operador
dedicado. Los manifiestos de app no despliegan Postgres ni Redis.

## Modo stateless (verificación)

- **Sesión = JWT** (access en memoria + refresh httpOnly cookie). No hay
  server-side session store ⇒ **no se requiere sticky session** en el Ingress.
- **WebSocket multi-instancia** vía Redis pub/sub (canal `webs:ws`,
  `apps/api/src/plugins/websocket.ts`): un mensaje se entrega en cualquier réplica.
- **Rate-limit global** en Redis (`rate-limiter-flexible`, ADR-0008) con fallback
  en memoria solo para mononodo sin `REDIS_URL` (no-global).
- **Graceful shutdown**: la API escucha `SIGTERM`, deja de aceptar conexiones,
  drena in-flight y cierra Prisma/Redis (`terminationGracePeriodSeconds: 30`).
- **Único estado local** = PVC `webs-uploads` montado en `/app/data` (subidas de
  media y `webs.config.json` de la instalación). Para multi-AZ real, usar el
  plugin `storage-s3` (S3/R2/MinIO) y prescindir del PVC.

## Flujo de despliegue

1. **Requisitos previos**: cluster con NGINX Ingress Controller, un StorageClass
   que provea `ReadWriteMany` (NFS/EFS/CephFS) si se usa el PVC, y Postgres + Redis
   externos con sus URLs.

2. **Secretos** (no commitear literales — ADR-0008): generar y sellar con
   sealed-secrets o external-secrets. `JWT_SECRET`/`JWT_REFRESH_SECRET` ≥ 32 chars,
   `ENCRYPTION_KEY` = `openssl rand -hex 32`.

   ```bash
   kubectl create secret generic webs-secret --dry-run=client -o yaml \
     --from-literal=DATABASE_URL=postgresql://... \
     --from-literal=REDIS_URL=redis://... \
     --from-literal=JWT_SECRET="$(openssl rand -base64 48)" \
     --from-literal=JWT_REFRESH_SECRET="$(openssl rand -base64 48)" \
     --from-literal=ENCRYPTION_KEY="$(openssl rand -hex 32)" | kubeseal -o yaml
   ```

3. **Aplicar base** (namespace, config, secret, PVC):

   ```bash
   kubectl apply -f deploy/k8s/namespace.yaml
   kubectl apply -f deploy/k8s/configmap.yaml
   kubectl apply -f deploy/k8s/secret.yaml
   kubectl apply -f deploy/k8s/pvc.yaml
   ```

4. **Migrar la base de datos** (schema multi-tenant de t22) antes del rollout:

   ```bash
   kubectl apply -f deploy/k8s/migration-job.yaml
   kubectl wait --for=condition=complete job/prisma-migrate -n webs --timeout=300s
   ```

5. **Desplegar servicios** (API + web):

   ```bash
   kubectl apply -f deploy/k8s/deployment-api.yaml
   kubectl apply -f deploy/k8s/service-api.yaml
   kubectl apply -f deploy/k8s/deployment-web.yaml
   kubectl apply -f deploy/k8s/service-web.yaml
   ```

6. **Auto-scaling y disponibilidad**:

   ```bash
   kubectl apply -f deploy/k8s/hpa-api.yaml
   kubectl apply -f deploy/k8s/pdb.yaml
   ```

7. **Exponer** (TLS + security headers):

   ```bash
   # Crear el Secret TLS (cert-manager lo hace automáticamente si está instalado)
   kubectl apply -f deploy/k8s/ingress.yaml
   ```

8. **Instalación de la plataforma**: abrir `https://webs.example.com` y completar
   el asistente (`/api/v1/setup/*`) una sola vez. El `webs.config.json` resultante
   queda en el PVC compartido, por lo que todas las réplicas lo ven.

## Verificación

```bash
# Sintaxis de todos los manifiestos
kubectl apply --dry-run=client -f deploy/k8s/

# Estado del rollout
kubectl -n webs get deploy,rs,pods,hpa,pdb,svc,ingress

# Auto-scaling en acción (escalar bajo carga)
kubectl -n webs get hpa api --watch

# Health de una réplica (liveness/readiness)
kubectl -n webs exec deploy/api -- wget -qO- http://localhost:4000/health
kubectl -n webs exec deploy/api -- wget -qO- http://localhost:4000/health/ready
```

## Notas de operación

- **Redis es hard-dependency** en producción (rate-limit global, pub/sub, cola):
  si cae, la app debe degradar de forma controlada (circuit-breaker documentado en
  `docs/architecture/scalability.md`), no colgar.
- **`X-Forwarded-For`** confiable: detrás del Ingress NGINX, la API ya confía en
  `X-Forwarded-For` (`trustProxy: true` en `apps/api/src/app.ts`); revisar umbrales
  de rate-limit para no bloquear IPs compartidas (NAT/proxy).
- **Actualización de la app** (t29): en k8s usar `UPDATE_MODE=docker` → el flujo
  `docker compose` no aplica; el camino de actualización en Kubernetes es el
  **rolling update del Deployment** (cambiar la imagen y `kubectl rollout`), que ya
  es zero-downtime por construcción (`maxUnavailable: 0`, probes de readiness).
