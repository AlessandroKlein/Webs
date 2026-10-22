# Backlog de producto — Webs v1.58.0+

> Documento de Producto / Scrum Master. Consolida el brief de reescritura de la
> plataforma **Webs** como base web universal, escalable y multi-tenant.
>
> - **Estado actual:** `apps/api/src/modules/system.ts` → `SYSTEM_VERSION = '1.57.0'`
>   (próxima release = **v1.58.0**). `CHANGELOG.md` está desactualizado (último
>   asiento `[1.34.1]`), se normaliza en la tarea de release.
> - **Formato de aceptación:** Dado / Cuando / Entonces (Given/When/Then), medible.
> - **Prioridad:** P0 = bloquea el lanzamiento · P1 = esperado en el milestone ·
>   P2 = deseable / backlog continuo.
> - **Trazabilidad:** cada ítem referencia la tarea del equipo (`tN`) definida en
>   el plan de trabajo.

---

## 1. Objetivos y milestones

**Objetivo general:** reescribir Webs como base web universal, escalable y
multi-tenant: renombrar "Bloques" → "Plugins" con integración nativa al menú,
dejar en verde los workflows de CI (typecheck + release), corregir los bugs
enumerados, y sentar las bases de licenciamiento, multi-tenancy por cadenas y
escalabilidad.

| Milestone | Alcance |
|-----------|---------|
| **M1 — Fundación** | Rename Bloques→Plugins · CI + release en verde · bugs · UX · templates · páginas · lectores de código · auditorías · documentación. |
| **M2 — Expansión** | Sistema de licencias local anti-reverse-engineering (repo *Licensify*) · multi-tenant por cadenas · escalabilidad k8s (LB/stateless/auto-scaling) · mobile. |

---

## 2. Lista explícita de bugs (brief del usuario)

Estos son los defectos nombrados en el brief, con su raíz técnica identificada en
el código actual:

| # | Bug | Raíz identificada |
|---|-----|-------------------|
| B1 | **Inventario y tienda separados** (dos fuentes de stock que se desincronizan). | `Product.stock` (ecommerce/POS) vs `InventoryItem.quantity` (bloque inventario). El ajuste `POST /blocks/inventario/inventory/:id/adjust` solo toca `InventoryItem`, no `Product`. El campo `Organization.shareInventory` existe en el esquema pero no está implementado. |
| B2 | **Botones de social-login deshabilitados que siguen apareciendo.** | `blocks/social-login` y `apps/web/.../auth/LoginPage.tsx` no filtran de forma consistente los proveedores `enabled:false` entre el endpoint `/providers`, el `client.ts` del bloque y la UI de login/conexiones. |
| B3 | **Páginas no personalizables** (el constructor actual es incompleto). | `apps/web/.../pages/PagesPage.tsx` ya tiene drag & drop y tamaño de secciones, pero no expone configuración por bloque (`BlockPlacement.config`), ni bloques de contenido propio, ni ajustes por página (SEO/apariencia). |
| B4 | **Falta de templates de instalación rápida.** | `templates/` solo contiene 6: `blog`, `corporativo`, `cursos`, `gym`, `market`, `tienda`. No hay flujo de instalación en 1 clic ni preview. |
| B5 | **UX de pago deficiente.** | El flujo de pago en `StorePage`/`PaymentsPage` carece de estados claros (pendiente/aprobado/rechazado), redirección al callback del proveedor y resumen post-pago. |
| B6 | **Dashboards de usuario y trabajadores incompletos.** | `UserDashboardPage.tsx` (usuario) y `StaffDashboard.tsx` (trabajador) existen pero con UX/navegación por rol inconsistente; falta un menú de trabajador nativo. |
| B7 | **Lectores de código externos no integrados.** | Los escaneos de QR (asistencia) y código de barras (POS) son entradas de texto manuales; no capturan lectores hardware USB ni cámara. |

Los ítems B1–B7 se desglosan como historias con criterios de aceptación en la
sección 3 (WB-7 a WB-13).

---

## 3. Backlog priorizado

### 3.1 Fundación (M1)

#### WB-1 · P0 — CI: typecheck en verde — `t1`
- **Dado** un commit en `main` o un pull request,
- **Cuando** corre el workflow de typecheck (CI),
- **Entonces** termina en verde (exit 0) con la versión de Node declarada (22),
  sin errores de tipos ni de resolución de paquetes.
- **Métrica:** 0 ejecuciones rojas en `main` tras merge; job `typecheck` ✓.

#### WB-2 · P0 — Release: workflow en verde — `t1`
- **Dado** un tag semántico `v*` (p. ej. `v1.58.0`),
- **Cuando** corre el workflow de release,
- **Entonces** crea/actualiza el release en GitHub con los artefactos adjuntos,
  sin fallar en `gh release create` (permisos/token correctos).
- **Métrica:** release publicado ≤ 5 min después del tag; assets adjuntos.

#### WB-3 · P0 — Rename Bloques→Plugins (API) — `t5`
- **Dado** que la API expone rutas `/api/v1/blocks/*`,
- **Cuando** se aplica el rename,
- **Entonces** las rutas pasan a `/api/v1/plugins/*`, manteniendo alias de
  compatibilidad `/api/v1/blocks/*` (deprecados) para no romper bloques
  instalados, y todos los endpoints internos referencian el nuevo nombre.
- **Métrica:** `grep -r "/api/v1/blocks" apps/api` → 0 referencias activas
  (salvo alias documentado).

#### WB-4 · P0 — Rename Bloques→Plugins (bloques) — `t6`
- **Dado** los 40 bloques en `blocks/*` con `block.json` y `displayName`,
- **Cuando** se ejecuta la migración,
- **Entonces** el término de cara al usuario pasa a "Plugin" en `displayName`,
  `description` y categorías, sin cambiar los `id` (clave estable).
- **Métrica:** los 40 `block.json` migrados; `id` invariante.

#### WB-5 · P0 — Rename Bloques→Plugins (frontend + menú nativo) — `t7`
- **Dado** el panel de administración (`apps/web`),
- **Cuando** un administrador navega,
- **Entonces** el menú muestra "Plugins" con integración nativa (entrada propia
  en el menú, no solo desde la sección de bloques), y las pantallas
  `BlocksPage`/`BlockSettingsPage`/`BlockConfigPage` reflejan el nuevo término.
- **Métrica:** entrada "Plugins" visible en `AdminLayout`; textos UI consistentes.

#### WB-6 · P0 — Decisiones de arquitectura (ADRs) — `t2`
- **Dado** los cambios de rename, multi-tenant, licencias y escalabilidad,
- **Cuando** se registran las decisiones,
- **Entonces** existen ADRs actualizados en `docs/adr/` que documentan la
  dirección elegida y sus alternativas, consistentes con la implementación.
- **Métrica:** ADRs de rename, multi-tenant, licencias y escalabilidad presentes.

### 3.2 Bugs y UX (M1)

#### WB-7 · P0 — Bug B1: unificar inventario y tienda — `t8`
- **Dado** una organización con `shareInventory` habilitado y un producto
  vinculado a ítems de inventario (`InventoryItem.productId`),
- **Cuando** se ajusta el stock del ítem desde el bloque de inventario
  (`POST /plugins/inventario/inventory/:id/adjust`),
- **Entonces** el stock del producto en la tienda (`Product.stock`) refleja la
  suma de las cantidades de sus ítems vinculados, y una venta POS descuenta
  producto e ítems sin quedar desincronizados.
- **Además:**
  - **Dado** una organización **sin** `shareInventory`,
  - **Cuando** se administra inventario y tienda,
  - **Entonces** permanecen como fuentes independientes, sin efectos cruzados.
- **Métrica:** prueba de integración que ajusta inventario y verifica el stock
  visible en tienda/POS idéntico.

#### WB-8 · P0 — Bug B2: ocultar proveedores social-login deshabilitados — `t8`
- **Dado** que el administrador deshabilita un proveedor (p. ej. Facebook
  `enabled:false`) y guarda la configuración,
- **Cuando** un usuario carga la página de login o la sección "Conexiones" de su
  cuenta,
- **Entonces** el botón de ese proveedor **no** aparece; solo se listan
  proveedores con `enabled:true`, de forma consistente en el endpoint
  `/providers`, el `client.ts` del bloque y las UIs `LoginPage`/`AccountPage`.
- **Métrica:** con los 4 proveedores deshabilitados, no se renderiza ninguna
  fila/botón de social-login.

#### WB-9 · P1 — Bug B3: constructor de páginas completo — `t9`
- **Dado** que un editor abre el constructor de páginas,
- **Cuando** agrega, reordena y redimensiona secciones/bloques y configura cada
  bloque desde su panel de ajustes,
- **Entonces** los cambios se guardan en `Page.layout` y `BlockPlacement.config`
  y se renderizan en la vista previa y en la página pública `/slug` en el mismo
  orden/tamaño, incluyendo bloques de contenido propio (texto/hero) y ajustes
  por página (SEO/apariencia).
- **Métrica:** crear→editar→previsualizar→publicar una página con ≥2 secciones y
  config de bloque sin errores.

#### WB-10 · P1 — Feature B4: templates de instalación rápida — `t9`
- **Dado** un catálogo de templates que incluye los actuales (`blog`,
  `corporativo`, `cursos`, `gym`, `market`, `tienda`) y los nuevos
  (`centro-de-logistica`, `supermercado`, `gimnasio`),
- **Cuando** un usuario selecciona un template y confirma la instalación en un
  clic,
- **Entonces** se instalan todos los bloques del template con su `config`, se
  crean las páginas y el menú definidos, y el sitio queda funcional.
- **Métrica:** instalar `tienda` desde cero produce un sitio con tienda+carrito+
  pago+inventario navegables.

#### WB-11 · P1 — UX de pago — `t4`
- **Dado** que un usuario finaliza la compra con un proveedor de pago,
- **Cuando** elige el método de pago y confirma,
- **Entonces** el flujo muestra estados claros (pendiente/aprobado/rechazado),
  redirige al callback del proveedor cuando corresponde y muestra un resumen de
  la orden (total, método, referencia), sin pasos ambiguos ni doble cobro.
- **Métrica:** checkout exitoso muestra resumen; checkout fallido muestra error
  claro y permite reintentar.

#### WB-12 · P1 — Dashboards de usuario y trabajadores — `t4`
- **Dado** un usuario normal (cliente/miembro) que ingresa a su dashboard,
- **Entonces** ve accesos y métricas relevantes (pedidos, membresía, rutinas,
  pagos) con navegación clara.
- **Dado** un trabajador (entrenador/cajero) que ingresa a su panel,
- **Entonces** ve las secciones de su rol (asistencia, rutinas, reservas, POS,
  stock, tickets) desde un **menú de trabajador** nativo y coherente.
- **Métrica:** cada rol ve solo las secciones de su permiso, sin secciones rotas.

#### WB-13 · P1 — Lectores de código externos — `t14`
- **Dado** un lector de código de barras/QR externo (hardware USB o cámara),
- **Cuando** el lector envía el código (Enter tras escaneo),
- **Entonces** el sistema lo captura en los campos de escaneo (asistencia QR y
  POS barcode) sin pegado manual, y busca el miembro/producto correspondiente.
- **Métrica:** escaneo de QR de membresía registra asistencia; escaneo de
  barcode agrega producto al carrito POS.

### 3.3 Calidad y entrega (M1)

#### WB-14 · P0 — Auditoría de seguridad + arquitectura de licencias — `t10`
- **Dado** el alcance de M2 (licencias anti-reverse-engineering),
- **Cuando** se diseña la arquitectura,
- **Entonces** queda documentado un diseño de licencia local, firmada y
  ofuscada, con hardening de secretos, sin exponer claves en cliente.
- **Métrica:** documento de arquitectura + lista de controles de seguridad
  revisados.

#### WB-15 · P0 — QA en contenedor — `t11`
- **Dado** el entorno de la plataforma,
- **Cuando** se ejecuta la suite de QA en Docker,
- **Entonces** levanta una instancia reproducible y pasa las pruebas de
  aceptación de M1 en verde.
- **Métrica:** `docker compose up` + tests → exit 0.

#### WB-16 · P1 — Release v1.58.0 + changelog — `t12`
- **Dado** M1 completo y CI/release en verde,
- **Cuando** se taggea `v1.58.0`,
- **Entonces** `CHANGELOG.md` está actualizado (desde `1.34.1` hasta `1.58.0`)
  y el release se publica con artefactos.
- **Métrica:** changelog coherente con `git tag`; release público.

#### WB-17 · P1 — Documentación completa — `t13`
- **Dado** el repositorio de documentación,
- **Cuando** se cierra M1,
- **Entonces** la documentación refleja el rename a Plugins, los nuevos flujos
  (pago, templates, dashboards) y las guías operativas, sin contradicciones.
- **Métrica:** build de docs en verde; sin referencias obsoletas a "Bloques".

### 3.4 Milestone 2 (M2)

#### WB-18 · P0 (M2) — Sistema de licencias local anti-reverse-engineering — `Licensify`
- **Dado** que la plataforma se instala en un servidor del cliente,
- **Cuando** se valida la licencia,
- **Entonces** la validación es **local** (sin depender de un servicio externo),
  la licencia está firmada/ofuscada, es difícil de reverse-engineer, y
  expira/invalida según sus términos (fecha, features, organizaciones).
- **Métrica:** una licencia alterada o vencida es rechazada; la validación no
  requiere red.

#### WB-19 · P0 (M2) — Multi-tenant por cadenas
- **Dado** múltiples organizaciones (cadena de sucursales),
- **Cuando** se accede a datos y recursos,
- **Entonces** cada organización ve solo sus datos (aislamiento por
  `organizationId` en los modelos que hoy no lo tienen: `Product`, `Order`,
  `Payment`), con roles/membresías por organización.
- **Métrica:** un usuario de la org A no puede leer/escribir datos de la org B.

#### WB-20 · P0 (M2) — Escalabilidad k8s (LB/stateless/auto-scaling)
- **Dado** que la plataforma se despliega en Kubernetes,
- **Cuando** aumenta la carga,
- **Entonces** escala horizontalmente (auto-scaling), la API es stateless
  (sesión en Redis/JWT), y el balanceo distribuye tráfico sin pérdida de estado.
- **Métrica:** prueba de carga con N réplicas sin errores de sesión; HPA
  configurado.

#### WB-21 · P1 (M2) — Mobile
- **Dado** un usuario en dispositivo móvil,
- **Cuando** accede a la plataforma,
- **Entonces** las pantallas son responsivas y los lectores de código
  (QR/barcode) usan la cámara del dispositivo.
- **Métrica:** auditoría de `apps/mobile` y `apps/desktop` en verde; flujo de
  escaneo por cámara funcional.

---

## 4. Roadmap de releases

| Release | Versión | Alcance |
|---------|---------|---------|
| **R1 — Fundación** | **v1.58.0** | WB-1→WB-17: rename Bloques→Plugins + menú nativo, CI + release en verde, bugs B1/B2 (inventario/tienda, social-login), constructor de páginas + templates, UX de pago + dashboards, lectores de código, auditorías + QA + docs + changelog. |
| **R2 — Pulido M1** | **v1.59.0** | Buffer de hardening/UX: cierre de hallazgos de QA, alias de compatibilidad `blocks`→`plugins` estable, refinamiento de templates y dashboards. |
| **R3 — Expansión** | **v2.0.0** | WB-18→WB-21: sistema de licencias (*Licensify*), multi-tenant por cadenas, escalabilidad k8s (LB/stateless/auto-scaling), mobile. |

**Criterio de corte entre R1 y R2:** R1 sale solo con P0/P1 de M1 en verde
(typecheck + release ✓) y sin bugs bloqueantes (B1, B2 corregidos). R3 es un
bump **mayor** (v2.0.0) porque introduce licenciamiento y multi-tenancy, que
cambian el contrato de despliegue y datos.

---

## 5. Mapa tareas → backlog

| Tarea | Ítem(s) |
|-------|---------|
| t1-ci | WB-1, WB-2 |
| t2-adr | WB-6 |
| t4-ux | WB-11, WB-12 |
| t5-api | WB-3 |
| t6-blocks | WB-4 |
| t7-web | WB-5 |
| t8-bugs | WB-7, WB-8 |
| t9-pages | WB-9, WB-10 |
| t10-security | WB-14 |
| t11-qa | WB-15 |
| t12-release | WB-16 |
| t13-docs | WB-17 |
| t14-mobile | WB-13, WB-21 |
