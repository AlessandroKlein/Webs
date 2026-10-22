# Refactorización global de Webs — Documento de diseño

> **Estado:** diseño objetivo (target-state). Este documento describe **hacia dónde** va la
> plataforma y enlaza las decisiones durables (ADRs). Los docs de arquitectura existentes
> (`block-system.md`, `scalability.md`, etc.) describen el estado **actual**; la sincronización
> de cada baseline se ejecuta en las tareas de implementación correspondientes (ver
> [Baseline sync](#baseline-sync)).

## 1. Objetivo

Convertir Webs en una **base web universal, escalable y multi-tenant**, cerrando:

1. El rename de la unidad de extensión **«Bloques» → «Plugins»** con integración **nativa al
   menú** (sin categoría separada).
2. El **multi-tenant por cadenas** (organización padre/hija, finanzas separadas, vista
   consolidada).
3. El sistema de **licencias/activación local anti-reverse-engineering** (repo Licensify).
4. Los **gaps de escalabilidad** (rate-limit global en Redis, manifiestos k8s, stateless,
   auto-scaling).
5. El criterio de estilos **Tailwind CSS + Shadcn UI**.

El trabajo se organiza en dos milestones:

- **Milestone 1 — Fundación + rename + CI + bugs + UX + auditorías**:
  ADR-0005 (rename + menú) y ADR-0009 (UI) se ejecutan aquí, junto con dejar en verde los
  workflows de CI (typecheck + release) y la corrección de bugs/UX.
- **Milestone 2 — Licencias + multi-tenant + escalabilidad + mobile**:
  ADR-0006 (cadenas), ADR-0007 (Licensify) y ADR-0008 (escalabilidad) se ejecutan aquí.

## 2. Pilares de diseño

### 2.1 Plugins (ex «Bloques») con menú nativo — ADR-0005

La unidad de extensión pasa a llamarse **plugin** en todo el contrato público (manifiesto
`plugin.json` con `type: "plugin"`, SDK `definePlugin`, rutas `/api/v1/plugins/*`, permisos
`plugin.read`/`plugin.manage`, modelos `PluginInstallation`/`PluginPlacement`, directorio
`plugins/*`).

La UX cambia de una **categoría separada** («Bloques instalados» en el sidebar) a un **menú
unificado**: los plugins declaran ítems de menú en su manifiesto (`menu: PluginMenuItem[]`) y
el backend los fusiona con los del núcleo en `GET /menu` y `GET /public/menu`. El `AdminLayout`
deja de tener `coreNav`/`blockNav` hardcodeados y consume el menú de la API, filtrando por
permisos del usuario. Ver detalle en [ADR-0005](../adr/0005-plugin-rename.md).

### 2.2 Multi-tenant por cadenas — ADR-0006

Se añade jerarquía a `Organization` (`parentId`, `chainId` denormalizado a la raíz, `type`:
`standalone|chain|branch`) y se scopa **todos** los modelos de negocio con `organizationId`
obligatorio. Las finanzas son **separadas por organización** (cada `Order`/`Payment`/`Invoice`
lleva su `organizationId`) y la **vista consolidada** agrega por cadena (solo lectura). El
acceso se fuerza fail-closed mediante un middleware de scoping de tenant. Ver
[ADR-0006](../adr/0006-multi-tenant.md).

### 2.3 Licencias local anti-RE — ADR-0007

Se crea **Licensify** (`github.com/AlessandroKlein/Licensify`, paquete `@licensify/core`):
licencia firmada Ed25519 + **clave de activación** offline ligada a un **fingerprint de
hardware**, con defensa en profundidad (AES-256-GCM, clave partida, ofuscación de la rutina de
verificación, anti-tamper/anti-reloj). Webs integra Licensify para licenciar plugins comerciales
(`commercial`/`productId` en el manifiesto). Ver [ADR-0007](../adr/0007-licensing.md).

### 2.4 Escalabilidad — ADR-0008

Se cierra la brecha de escalabilidad: rate-limit **global en Redis**
(`rate-limiter-flexible`), **stateless garantizado** (sin sesión en proceso, WebSocket por
pub/sub sin sticky sessions, graceful shutdown), **manifiestos k8s** (`k8s/` con deployment,
service, ingress, HPA, PDB, migración como Job) y **auto-scaling** (HPA + KEDA opcional). Ver
[ADR-0008](../adr/0008-scalability.md).

### 2.5 Estilos — ADR-0009

**Tailwind CSS v4** como único motor de estilos (tokens `--ws-*` en `@theme`) y **Shadcn UI**
como primitivas (Radix, copiadas a `components/ui/`), con migración progresiva del CSS a medida
del admin y sustitución de Bootstrap Icons por `lucide-react`. Ver
[ADR-0009](../adr/0009-ui-styling.md).

## 3. Secuencia y dependencias

```
Milestone 1
  ADR-0009 (UI) ──► base de primitivas shadcn ──► migración progresiva del admin
  ADR-0005 (rename+menú) ──► rename contrato ──► registro de menú ──► AdminLayout data-driven
  CI/typecheck+release en verde  ──►  bugs/UX (inventario, social-login, páginas, templates, pago)

Milestone 2  (depende de la base estable del M1)
  ADR-0006 (cadenas)  ──► migración schema + scoping de tenant
  ADR-0007 (Licensify) ──► repo Licensify ──► módulo licenses + plugin comercial
  ADR-0008 (escalabilidad) ──► rate-limit Redis ──► k8s/ ──► HPA
  mobile
```

Puntos de acoplamiento clave:

- **ADR-0005 ↔ ADR-0007**: los campos `commercial`/`productId` se definen sobre el manifiesto
  renombrado `plugin.json`.
- **ADR-0005 ↔ ADR-0009**: los ítems de menú se renderizan con `NavigationMenu`/`DropdownMenu`
  shadcn.
- **ADR-0006 ↔ ADR-0008**: el multi-tenant por filas no requiere particionar la base; la escala
  se logra con réplicas stateless contra Postgres/Redis compartidos.
- **ADR-0007 ↔ ADR-0005**: la verificación de firma del marketplace (`catalog.ts`, Ed25519)
  sigue garantizando integridad de distribución y **complementa** (no sustituye) la licencia.

## 4. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Rename «bloque→plugin» rompe rutas/permisos/manifiestos (30+ bloques). | Shim `/api/v1/blocks/*` + aceptación de `block.json` durante M1; retirada en M2. Migración scriptada del directorio y de la base. |
| Migración de `organizationId` obligatorio exige backfill de datos existentes. | Crear «organización raíz por defecto» y asignar filas existentes en script de migración/seed. |
| Fuga de datos multi-tenant por query sin filtro. | Middleware de scoping central + tests de aislamiento (fail-closed). |
| Anti-RE no es absoluto (DRM en cliente). | Comunicar el límite; firma Ed25519 no falsificable + node-locking + ofuscación; opcional checks server-side. |
| Migración de UI/estilos a gran escala rompe funcionalidad. | Migración incremental por componente; mantener fallback del menú actual durante la transición. |
| Redis como hard-dependency (rate-limit/pub-sub/cache). | Circuit-breaker/fallback degradado documentado; mononodo sin Redis solo en dev. |

## 5. Baseline sync

Este documento y los ADR-0005…0009 definen el estado objetivo. La sincronización de baselines
se ejecuta en las tareas de implementación (no en este documento de diseño):

| Baseline actual | Acción al implementar |
|---|---|
| `docs/architecture/block-system.md` | Renombrar a `plugin-system.md` y actualizar (manifiesto `plugin.json`, `menu`, `commercial`/`productId`). |
| `docs/architecture/scalability.md` | Actualizar (rate-limit Redis, k8s, stateless garantizado, auto-scaling). |
| `docs/architecture/nucleo-plugins.md` | Renombrar «bloque»→«plugin» y reflejar el registro de menú. |
| `docs/architecture/overview.md`, `monorepo.md` | Reflejar `plugins/*`, módulo `licenses`, jerarquía de `Organization`. |
| `docs/architecture/settings-theming.md` | Documentar Tailwind v4 + shadcn como sistema de estilos. |
| Guías (`crear-un-bloque.md`, `marketplace-de-bloques.md`, `plantillas.md`, …) | Renombrar «bloque»→«plugin» y añadir el campo `menu`/licencias. |
| Repo `Licensify` | Documentar su propio ADR/README (clave de activación, fingerprint, anti-RE). |
| `docs/README.md` | Índice de ADRs 0001–0009 y enlace a este documento. |

## 6. Referencias

- [ADR-0005 — Plugins (rename + menú nativo)](../adr/0005-plugin-rename.md)
- [ADR-0006 — Multi-tenant por cadenas](../adr/0006-multi-tenant.md)
- [ADR-0007 — Licencias local anti-RE](../adr/0007-licensing.md)
- [ADR-0008 — Escalabilidad](../adr/0008-scalability.md)
- [ADR-0009 — Tailwind + Shadcn UI](../adr/0009-ui-styling.md)
- Documentos de estado actual: `docs/architecture/block-system.md`, `scalability.md`,
  `nucleo-plugins.md`, `auth-rbac.md`, `overview.md`, `monorepo.md`; esquema
  `apps/api/prisma/schema.prisma`.
