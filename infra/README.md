# Infraestructura de despliegue

Este directorio contiene los artefactos de infraestructura de la plataforma
Webs. El arranque local más simple se hace con Docker Compose (ver `docker/`).

## Escalado horizontal (clúster)

La API es **stateless**: cualquier número de réplicas puede atender peticiones
detrás de un balanceador. Los únicos requisitos compartidos son:

- **PostgreSQL** — estado persistente (una única instancia o réplicas de lectura).
- **Redis** — pub/sub para sincronizar WebSocket entre instancias, caché y
  rate limiting global.

## Kubernetes (futuro)

Cuando el cliente final sea una empresa grande, el despliegue objetivo es
Kubernetes. La estructura recomendada (manifiestos en `k8s/`):

- `api` — Deployment con `N` réplicas + HorizontalPodAutoscaler + Service + Ingress.
- `web` — build estático servido por nginx o CDN.
- `postgres` — operador (CloudNativePG) o servicio gestionado.
- `redis` — un clúster gestionado (o Valkey).

Ver `docs/architecture/scalability.md` y `docs/guides/despliegue.md`.
