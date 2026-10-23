# ADR-0025: Escalabilidad selectable (HPA vs VPA) con modos verticales Auto / Recommender / Initial

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 11 — v2.9.0)
- **Decisión:** Permitir que el usuario elija **desde el panel de administración** el tipo de
  escalabilidad Kubernetes de cada workload (`api`, `web`): **horizontal (HPA)** o **vertical
  (VPA)**, con los modos verticales **Auto / Recommender / Initial** mapeados a `updateMode`
  `Auto` / `Off` / `Initial`, persistidos en un `ConfigMap` (`webs-scaling`). El backend expone
  `GET/PUT /api/v1/system/scaling` y `GET /system/scaling/export`, valida la **guarda de
  exclusión** (HPA y VPA no activos a la vez sobre CPU/memoria del mismo workload) y genera el
  YAML del manifiesto correspondiente. Todo **auditable** y restringido a `role=admin`, sin
  exponer secretos. Especificación en `docs/architecture/scalability.md` (§ «Escalabilidad
  selectable»).

## Contexto

El Milestone 2 (ADR-0008) ya dejó **escalado horizontal** reproducible:

- `deploy/k8s/hpa-api.yaml` — `HorizontalPodAutoscaler` `autoscaling/v2`: `minReplicas: 2`,
  `maxReplicas: 10`, métricas CPU y memoria al 70 % de utilización, con `scaleDown`
  (`stabilizationWindowSeconds: 300`, política `Percent 50` por 60 s).
- `deploy/k8s/deployment-api.yaml` — `replicas: 3`, `requests` `cpu: 250m`/`memory: 512Mi`,
  `limits` `cpu: 1`/`memory: 1Gi`, probes `/health` y `/health/ready`, `terminationGracePeriodSeconds: 30`,
  **stateless** (JWT, Redis pub/sub `webs:ws`, sin `sticky sessions`).
- `docs/architecture/scalability.md` documenta ese HPA + stateless + Redis global; ADR-0008 lo
  registra.

El límite del enfoque puro horizontal: con cargas **desparejas** (pocos pods con picos de CPU o
memoria), subir el número de réplicas no resuelve un pod que excede sus `limits`. El escalado
**vertical** (VPA) ajusta `requests`/`limits` de CPU/memoria del pod en lugar de replicarlo, y
resulta más eficiente para workloads con poca concurrencia pero alto consumo por petición (p. ej.
generación de PDF, exports, ciertos plugins). El objetivo M11 (`docs/backlog.md` §3.8, WB-54→WB-62)
es dar al operador la **elección por workload**, sin perder lo ya desplegado en M2.

## Decisión

### 1. Selector de escalabilidad por workload

- El usuario elige, **por workload** (`api`, `web`), el modo:
  - `horizontal` → se genera/aplica un `HorizontalPodAutoscaler` (`autoscaling/v2`).
  - `vertical` → se genera/aplica un `VerticalPodAutoscaler` (`autoscaling.k8s.io/v1`).
- La selección se **persiste en un `ConfigMap` `webs-scaling`** (namespace `webs`), no en la base:
  es configuración de infraestructura y debe ser visible/reconciliable por el operador sin tocar
  Postgres. El backend lee/escribe ese `ConfigMap` (clave `scaling.json` o similar) vía la API de
  Kubernetes (cliente con `ServiceAccount` limitada), o, en modo no-cluster, la persiste en
  `settings` con un campo JSON para entornos sin k8s.

### 2. VPA y mapeo de modos

- **VPA** (`apiVersion: autoscaling.k8s.io/v1`, `kind: VerticalPodAutoscaler`) requiere el
  **operador VPA** (`kubernetes/autoscaler` — componentes `recommender`, `updater` y
  `admission-controller`). Documentado como precondición de despliegue.
- Mapeo de los **tres modos de UI** a `spec.updatePolicy.updateMode`:

  | Modo UI | `updateMode` | Comportamiento |
  |---|---|---|
  | **Auto** | `Auto` | El `updater` aplica las recomendaciones (actualiza `requests`/`limits`) y **reinicia** los pods cuando hace falta. |
  | **Recommender** | `Off` | El `recommender` calcula y publica recomendaciones (visibles en `spec.recommendation` / `status`), pero **no** se aplican. |
  | **Initial** | `Initial` | Aplica recomendaciones **solo al crear** el pod (no reasigna pods en ejecución). |

- `targetRef` apunta al `Deployment` (`api`/`web`) del workload seleccionado.

### 3. Parámetros VPA

- `spec.resourcePolicy.containerPolicies` con `containerName` (`api`/`web`), `minAllowed` y
  `maxAllowed` de **CPU y memoria**, y `controlledResources: ["cpu", "memory"]`
  (`RequestsAndLimits`/`RequestsOnly`).
- Valores por defecto (consistentes con `deployment-api.yaml`): `minAllowed` `cpu: 100m`/
  `memory: 128Mi`, `maxAllowed` `cpu: 2`/`memory: 4Gi`. El usuario los configura desde el panel
  (WB-59).

### 4. Guarda de exclusión HPA vs VPA

- **HPA y VPA no pueden activarse a la vez sobre CPU/memoria del mismo workload**: el VPA basado
  en CPU/memoria reescribe `requests`/`limits` mientras el HPA decide réplicas por la utilización
  de esas mismas métricas — se pisan y producen oscilación. Por eso el selector impone **uno u
  otro por workload** (mutuamente excluyente en el `PUT`).
- `PUT /api/v1/system/scaling` **valida la guarda**: si el payload intenta `mode: "horizontal"`
  con `vpa` sobre CPU/memoria (o viceversa, HPA de CPU/mem + VPA `controlledResources` CPU/mem) en
  el mismo workload, responde **422** con un error descriptivo.
- **Alternativa documentada para querer ambos**: `VPA` sobre **CPU/memoria** + `HPA` sobre
  **métricas custom** (p. ej. `KEDA` escalando por longitud de cola Redis `webs:queue:*`). En ese
  caso el HPA no usa CPU/memoria, así que no interfiere con el VPA.

### 5. Contrato API

`GET /api/v1/system/scaling` → estado persistido + recomendaciones (si el cluster las expone):

```jsonc
{
  "workloads": [
    {
      "name": "api",
      "mode": "horizontal",            // "horizontal" | "vertical"
      "hpa": { "min": 2, "max": 10, "cpuTargetPct": 70, "memTargetPct": 70 },
      "vpa": {
        "updateMode": "Off",            // "Auto" | "Off" | "Initial"
        "minAllowed": { "cpu": "100m", "memory": "128Mi" },
        "maxAllowed": { "cpu": "2", "memory": "4Gi" },
        "controlledResources": ["cpu", "memory"]
      }
    },
    { "name": "web", "mode": "vertical", "hpa": null, "vpa": { /* … */ } }
  ],
  "appliedAt": "2026-…",
  "recommendations": { "api": { "cpu": "300m", "memory": "640Mi" } }   // solo si VPA Recommender/Auto publica
}
```

`PUT /api/v1/system/scaling` acepta el mismo cuerpo (sin `appliedAt`/`recommendations`), valida la
guarda de exclusión (422 si viola), escribe el `ConfigMap` y devuelve el estado resultante.

### 6. Generación de manifiestos

- `GET /api/v1/system/scaling/export?workload=api&format=yaml` devuelve el **YAML** del manifiesto
  (`HorizontalPodAutoscaler` o `VerticalPodAutoscaler`) según la selección persistida, para que el
  operador pueda revisarlo o aplicarlo con `kubectl apply -f`.
- `format` admite `yaml` (default) y `json`. El backend renderiza desde el mismo template que se
  aplicaría al `ConfigMap` (una sola fuente de verdad).

### 7. Seguridad

- Endpoints restringidos a `role=admin` (permiso `scaling.read`/`scaling.write`, patrón
  `<recurso>.<accion>` de ADR-0004).
- Toda escritura es **auditable** vía `audit()` (`AuditLog`): `action = scaling.update`,
  `resource = 'scaling'`, `metadata` con workload/modo. No se exponen **secretos** (el export YAML
  referencia `secretKeyRef` a `webs-secret`, nunca literales).
- El `ServiceAccount` del backend para leer/escribir el `ConfigMap` usa el menor privilegio
  posible (`get/list/watch/update` solo sobre `webs-scaling`), sin acceso a `Secret`.

## Consecuencias

**Positivas:**

- El operador elige la estrategia que mejor se adapta a cada workload (réplicas para tráfico
  parejo, recursos para picos de CPU/memoria), sin perder el HPA de M2.
- Los modos VPA `Auto`/`Recommender`/`Initial` cubren el ciclo completo: recomendar sin tocar,
  aplicar solo al crear, o aplicar con reinicio.
- La guarda de exclusión evita la configuración inválida HPA+VPA que genera oscilación; el export
  YAML da revisabilidad antes de aplicar.

**Negativas / costes:**

- **Precondición operativa**: el operador VPA (`recommender` + `updater` + `admission-controller`)
  debe instalarse en el cluster; no es un recurso core de Kubernetes.
- En modo `vertical`, el reinicio de pods para aplicar `requests`/`limits` es inherente (salvo
  `updateMode: Initial`/`Off`); hay que coordinar con `PodDisruptionBudget` y `graceful shutdown`.
- Dos fuentes de configuración (ConfigMap k8s y, en entornos sin cluster, `settings`) exigen
  reconciliación; se centraliza en el servicio de escalabilidad para evitar divergencia.

## Notas

- Especificación técnica (contrato de endpoints, estructura del `ConfigMap`, templates YAML de
  HPA/VPA y regla de exclusión): `docs/architecture/scalability.md` (§ «Escalabilidad selectable»).
- Implementación en `t152`/`t153` (backend/panel), QA + i18n en `t154`; trazabilidad en
  `docs/backlog.md` §3.8 (WB-54→WB-62).
- Relación con ADR-0008 (HPA + stateless + k8s base, que esto **extiende** sin reemplazar),
  ADR-0004 (permisos `scaling.*`) y la guarda de exclusión documenta la alternativa
  VPA(CPU/mem) + HPA(metrics custom / KEDA) para coexistencia.
