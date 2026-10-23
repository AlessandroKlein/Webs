# Backlog de producto — Webs v2.0.0+

> Documento de Producto / Scrum Master. Consolida el brief de reescritura de la
> plataforma **Webs** como base web universal, escalable y multi-tenant.
>
> - **Estado actual:** `apps/api/src/modules/system.ts` → `SYSTEM_VERSION = '2.0.0'`
>   (**M1 liberado como v1.58.0** · **M2 liberado como v2.0.0**). Roadmap
>   planificado hasta **v2.9.0** (M11 — escalabilidad selectable HPA/VPA).
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
| **M2 — Expansión** | Sistema de licencias local anti-reverse-engineering (repo *Licensify*, `@licensify/core`) · multi-tenant por cadenas (finanzas separadas por sucursal + consolidadas HQ) · escalabilidad k8s (HPA/stateless/auto-scaling) · mobile real Capacitor · OAuth2 real (state/PKCE) · limpieza de naming interno `block` · sistema de actualización zero-downtime (app + plugins). |
| **M3 — Consolidación** | Cierre de deuda técnica (F12/F4/F10/F17) · visual page builder (GrapesJS + página de inicio configurable) · i18n multi-idioma (ES/EN/PT) · documentos legales (ToS/Disclaimer/Privacy/Cookies) · mobile Capacitor nativo + desktop · fix de login en Docker · política "todo nativo / sin componentes de pago". |
| **M4 — Operación** | Pulido admin/UX (categorías del menú `/admin`, buscador, actualizaciones unificadas) · plugin fiscal ARCA (facturación electrónica) · comprobantes/facturas por pago + impresión térmica ESC/POS · checkout unificado + pago en sucursal. |
| **M5 — Marketplace** | Plugins con fuente remota GitHub + botón "Instalar" · nginx allowlist + multi-sucursal por subdominio · roles/permisos completos · app de claves de licencia para venta · finalización de plugins. |
| **M6 — Licencias** | Feature-gating por licencia (integración `@licensify/core` con features premium). |
| **M7 — Acceso rápido** | Generador de APIs de acceso rápido (recurso → modelo + rutas CRUD + SDK tipado web/móvil). |
| **M8 — Soporte** | Rediseño de `/admin/menu` · sistema de tickets/soporte con estados · chat de usuarios en tiempo real + ventana flotante. |
| **M9 — Inventario** | Inventario completo: variantes de producto (SKU, código de barras EAN/UPC), categorías/marcas/proveedores, multi-almacén por sucursal, movimientos de stock con ledger auditable, alertas de stock bajo, valoración (costo promedio/FIFO), reportes y export/import CSV, soporte de código de barras/QR integrable con impresoras térmicas (M4). |
| **M10 — Red social** | Compositor de publicación enriquecido en `SocialPublicPage.tsx`: galería multi-media (imágenes/video con pie, reordenar/eliminar), menciones `@usuario`, hashtags `#tema`, encuestas, selector de visibilidad (Público/Seguidores/Solo yo), selector de emoji, contador de caracteres con límite, vista previa de enlaces, autoguardado de borrador. |
| **M11 — Escalabilidad** | Escalabilidad Kubernetes selectable por el usuario desde `/admin/scaling`: elegir Horizontal (HPA) vs Vertical (VPA) por workload; VPA con modos Auto/Recommender/Initial; HPA/VPA configurables; guarda de exclusión HPA+VPA sobre la misma métrica; visibilidad de recomendaciones/réplicas/eventos; export YAML del manifiesto generado. |

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

> **M2** se libera en **v2.0.0** (bump mayor). Cubre los 4 frentes ya esbozados
> (WB-18→WB-21, ahora detallados) y 3 frentes nuevos (WB-22→WB-24). La
> trazabilidad apunta a las tareas M2 ya despachadas (`t20`–`t24`) y a tareas
> futuras (`k8s`, `mobile Capacitor`, `naming cleanup`) que se crearán al iniciar
> su desarrollo.

#### WB-18 · P0 (M2) — Sistema de licencias local anti-reverse-engineering — `t21`
- **Dado** que la plataforma se instala en el servidor del cliente (on-premise),
- **Cuando** se genera y valida una licencia,
- **Entonces** la validación es **local** (sin depender de un servicio externo),
  la clave está firmada con **Ed25519**, el payload cifrado con **AES-256-GCM**
  (split-key), con **node-locking** por fingerprint de nodo y
  **anti-tamper/anti-reloj** (rechaza código alterado y reloj retrocedido), y
  expira/invalida según sus términos (fecha, features, organizaciones).
- **Entregable:** paquete `@licensify/core` en el repo *Licensify* (ADR-0007),
  con CLI keygen/sign/verify y formato de clave de activación offline.
- **Métrica:** una licencia alterada, vencida o con reloj retrocedido es
  rechazada sin red; la librería es consumible como dependencia.

#### WB-19 · P0 (M2) — Multi-tenant por cadenas (finanzas separadas + consolidadas HQ) — `t22`
- **Dado** una cadena con casa matriz (HQ) y sucursales modeladas en
  `Organization.parentId`/`chainId`/`type` (HEADQUARTER|BRANCH),
- **Cuando** una sucursal opera su inventario, ventas y finanzas,
- **Entonces** cada sucursal ve y administra **solo** sus datos (scoping
  fail-closed por `organizationId` en los ~20 modelos de negocio), y la casa
  matriz ve la vista **consolidada** (agregación de sub-orgs), sin que una
  sucursal acceda a las finanzas de otra.
- **Además:** RBAC diferencia **admin de cadena** (HQ, ve todo) de **admin de
  sucursal** (solo su org); si no se puede resolver el tenant → 403 (nunca datos
  cruzados).
- **Métrica:** un usuario de la sucursal A no lee/escribe datos de la sucursal B,
  y HQ ve el agregado correcto de todas sus sub-orgs.

#### WB-20 · P0 (M2) — Escalabilidad k8s (HPA/stateless/auto-scaling) — `t-future-k8s`
- **Dado** que la plataforma se despliega en Kubernetes,
- **Cuando** aumenta la carga o se ejecuta un rollout,
- **Entonces** la API escala horizontalmente vía **HPA**, es **stateless**
  (sesión en Redis/JWT), el balanceo distribuye tráfico sin pérdida de estado, y
  el rate-limit es global (Redis, ADR-0008), no por instancia.
- **Métrica:** prueba de carga con N réplicas sin errores de sesión ni bypass de
  rate-limit; manifiestos HPA/Deployment/Service aplicables.

#### WB-21 · P1 (M2) — Mobile real con Capacitor — `t-future-mobile`
- **Dado** la app móvil empaquetada con Capacitor (no solo PWA),
- **Cuando** un trabajador usa la app en Android/iOS,
- **Entonces** accede a las pantallas de su rol, los lectores de código
  (QR/barcode) usan la cámara nativa, y el puente con lectores hardware externos
  funciona sin depender del endpoint hardcodeado.
- **Métrica:** build de Capacitor en verde y flujo de escaneo por cámara
  funcional en dispositivo.

#### WB-22 · P0 (M2) — OAuth2 real con state + PKCE (social-login) — `t23`
- **Dado** un proveedor OAuth2 configurado y habilitado (Google/Facebook/etc.),
- **Cuando** un usuario inicia sesión social,
- **Entonces** el flujo usa `state` (anti-CSRF) y **PKCE S256**
  (`code_challenge`/`code_verifier`), intercambia el authorization code contra el
  proveedor real (code→token→perfil) y vincula la cuenta por identidad
  verificada — nunca por email auto-afirmado (ya removido en F3).
- **Métrica:** login social end-to-end vincula la cuenta solo tras el handshake
  real; sin exponer `clientSecret` al cliente.

#### WB-23 · P1 (M2) — Limpieza de naming interno `block` — `t-future-naming`
- **Dado** el rename de cara al usuario ya completado (Plugins),
- **Cuando** se limpia la deuda interna,
- **Entonces** los modelos Prisma (`BlockInstallation`→`PluginInstallation`,
  `BlockPlacement`→`PluginPlacement`, `blockId`→`pluginId`), el directorio `blocks/`→`plugins/` y
  los paquetes npm `@webs/block-*`→`@webs/plugin-*` quedan renombrados, con
  migración de datos y aliases de retrocompatibilidad acotados.
- **Métrica:** `grep -riE '\bblock' apps/api/prisma apps/api/src packages blocks`
  sin referencias de producto (solo históricas/deprecadas documentadas);
  migración ejecutada sin pérdida de datos.

#### WB-24 · P0 (M2) — Sistema de actualización zero-downtime (app + plugins) — `t20`, `t24`
- **Dado** un botón "Actualizar" para la **app** y otro para los **plugins**,
- **Cuando** el usuario lo presiona,
- **Entonces** el sistema corrobora si hay versión nueva en GitHub Releases (vs
  `SYSTEM_VERSION` para la app, vs `plugin.json version` para plugins), descarga
  el artefacto verificando `sha256` + firma **Ed25519** (reutilizando
  `@licensify/core`), y aplica la actualización **sin que la app deje de
  funcionar**:
  - **Plugins:** stage en dir temporal → swap atómico del directorio → hot-reload
    con `import()` cache-busted (loader `loadPluginEntry`), sin reiniciar.
  - **App:** Node bare con cluster/graceful reload; Docker con rolling update.
- **Además:** endpoints `/api/v1/system/update/check|apply|status|rollback`, y
  rollback que restaura la versión previa si la actualización falla.
- **Métrica:** actualizar un plugin y la app en un entorno de prueba sin downtime
  observable ni pérdida de datos; rollback funcional ante fallo.

### 3.5 Milestone 3 (M3)

> **M3** se libera en **v2.1.0** (bump menor). Cierra la deuda técnica documentada
> en la QA de M2 (F12/F4/F10/F17) y suma producto final: **visual page builder**
> (GrapesJS + página de inicio configurable), **i18n multi-idioma**, **documentos
> legales**, **mobile Capacitor nativo + desktop**, **fix de login en Docker** y la
> **política "todo nativo / sin componentes de pago"**. La trazabilidad apunta a
> las tareas M3 (`t51`–`t65`); `t51` es este documento.

#### WB-25 · P0 (M3) — Cierre de deuda F12 (naming residual) + F10 (versión setup) — `t60`
- **Dado** el contrato público de la plataforma tras el rename a Plugins,
- **Cuando** se limpia la deuda residual,
- **Entonces** no quedan referencias de producto a `/api/v1/blocks/*`, al campo
  `blockId` ni a la prosa "bloque" en `apps/web` (el shim `/api/v1/blocks` queda
  solo como compatibilidad temporal documentada), y `GET /api/v1/setup/status`
  devuelve la versión real (`SYSTEM_VERSION`), nunca el literal `'0.2.0'`
  hardcodeado.
- **Métrica:** `grep -riE 'block|bloque|0\.2\.0' apps/web apps/api` → 0
  referencias activas (salvo shim/legado documentado).

#### WB-26 · P1 (M3) — Cierre de deuda F4: permisos de docs `block.*` → `plugin.*` — `t63`
- **Dado** la documentación publicada (Webs `docs/` y Docs.git `docs/es/webs/`),
- **Cuando** se sincroniza la doc,
- **Entonces** no quedan permisos obsoletos `block.read`/`block.manage` (se
  documentan `plugin.read`/`plugin.manage`) en `docs/api/overview.md`,
  `docs/architecture/plugin-system.md` ni `docs/guides/roles-permisos.md`.
- **Métrica:** `grep -riE 'block\.(read|manage)' docs` → 0 resultados.

#### WB-27 · P1 (M3) — Completar mobile Capacitor nativo + desktop (cierra F17) — `t61`
- **Dado** el host Capacitor existente (`apps/mobile/capacitor.config.json` +
  `@capacitor`),
- **Cuando** se agregan las plataformas nativas,
- **Entonces** `capacitor add android` y `capacitor add ios` generan los
  proyectos nativos (verificables con `npx cap build`), los scripts y la
  documentación permiten empaquetar para las stores, y `apps/desktop` funciona
  como companion de escritorio (Electron/Tauri) con su README de ejecución.
- **Métrica:** `npx cap build` en verde para Android; README de mobile y desktop
  con pasos reproducibles.

#### WB-28 · P0 (M3) — Visual page builder (GrapesJS) + página de inicio configurable — `t52`, `t56`, `t57`
- **Dado** un editor autenticado en `/admin/editor`,
- **Cuando** arrastra y edita componentes visuales (GrapesJS, self-hosted MIT,
  sin SaaS de pago) y guarda,
- **Entonces** el layout se persiste vía `POST /api/v1/pages/save` (Prisma), se
  renderiza por ruta (`GET` render) y la **página de inicio es configurable**
  (campo `homePage`); la vista en vivo refleja el contenido sin recargar.
- **Además:** ADR-0011 documenta la elección (GrapesJS frente a Builder.io/CMS
  headless) por MIT/self-hosted/sin-pago.
- **Métrica:** crear→editar→guardar→renderizar una página visualmente y fijarla
  como inicio, en un flujo end-to-end sin errores.

#### WB-29 · P0 (M3) — i18n multi-idioma (ES/EN/PT + language switcher) — `t52`, `t55`, `t58`
- **Dado** una instancia configurada con varios idiomas (mínimo ES/EN/PT),
- **Cuando** un usuario cambia de idioma con el switcher,
- **Entonces** la interfaz (menú, dashboards, ajustes de plugin, builder, login y
  páginas legales) se traduce de forma consistente, la preferencia persiste
  (localStorage/DB) y no quedan strings hardcodeadas (según la auditoría de `t55`,
  `docs/i18n/audit.md`).
- **Métrica:** cambiar de idioma no deja textos sin traducir en las pantallas
  objetivo; cobertura i18n ≥ ES/EN/PT.

#### WB-30 · P0 (M3) — Documentos legales (ToS/Disclaimer/Privacy/Cookies) — `t54`, `t59`
- **Dado** un sitio desplegado,
- **Cuando** un visitante accede a `/legal/terms`, `/legal/privacy`,
  `/legal/cookies` y `/legal/disclaimer`,
- **Entonces** ve los textos legales con placeholders configurables
  (`[NOMBRE_EMPRESA]`, `[JURISDICCIÓN]`, `[EMAIL_CONTACTO]`, `[URL]`), la Privacy
  alineada a GDPR/LGPD y el aviso de cookies, persistidos en DB (default = los
  templates de `docs/legal/`) y enlazados desde el footer.
- **Métrica:** las 4 rutas legales responden 200 y el footer las enlaza; la
  configuración del admin sobreescribe los placeholders.

#### WB-31 · P0 (M3) — Fix de login en Docker — `t53`
- **Dado** el stack levantado con `docker compose up`,
- **Cuando** un usuario intenta iniciar sesión en `http://localhost:5173` con las
  credenciales por defecto (`admin@webs.test` / `Admin12345!`),
- **Entonces** el login funciona (seed/hash/wizard correctos) sin errores de
  autenticación ni pasos rotos.
- **Métrica:** login exitoso en un entorno Docker aislado; sin fallos de seed o
  hash.

#### WB-32 · P0 (M3) — Política "todo nativo / sin componentes de pago" — `t52`, `t54`
- **Dado** la política de producto "base web universal sin componentes de pago",
- **Cuando** se auditan las dependencias y el ecosistema,
- **Entonces** el builder y los componentes usan soluciones self-hosted con
  licencias open-source (MIT/Apache/BSD), sin SaaS de pago (Builder.io, CMS
  headless comercial, etc.), y queda un anexo en `docs/legal/` que documenta la
  lista de componentes y sus licencias.
- **Métrica:** auditoría de dependencias sin licencias restrictivas/de pago;
  anexo de componentes presente.

#### WB-33 · P0 (M3) — QA de Milestone 3 + smoke e2e en Docker — `t62`, `t64`
- **Dado** el stack completo en Docker,
- **Cuando** se ejecuta la suite de QA de M3 (login, builder, i18n, legal,
  mobile/desktop, cierre F12/F10, regresión M1/M2) y el smoke e2e,
- **Entonces** el entorno es reproducible, las pruebas pasan en verde y el README
  documenta el arranque (`docker compose up` + credenciales).
- **Métrica:** `docker compose up` + QA + smoke → exit 0; veredicto **LIBERABLE**.

#### WB-34 · P1 (M3) — Release v2.1.0 + CHANGELOG + workflows verdes — `t65`
- **Dado** M3 completo y verificado (QA LIBERABLE),
- **Cuando** se bumpa `SYSTEM_VERSION` a `2.1.0`, se actualiza `CHANGELOG.md`
  (`[2.1.0]`) y se taggea `v2.1.0`,
- **Entonces** el release se publica con artefactos y los workflows (CI typecheck
  + release) quedan en verde.
- **Métrica:** tag `v2.1.0` público; workflows CI/release ✓; changelog coherente.

### 3.6 Milestone 9 (M9) — Inventario completo

> **M9** se libera en **v2.7.0** (bump menor). Convierte el inventario básico
> actual (`blocks/inventario`, modelo `InventoryItem`) en un sistema de gestión de
> stock completo. Se ancla en el **ADR-0023** (modelo de inventario + spec,
> `t126`). Trazabilidad: `t125`–`t133`; `t125` es este documento.

#### WB-35 · P0 (M9) — Variantes de producto (SKU + código de barras EAN/UPC) — `t127`, `t129`
- **Dado** un producto con atributos variables (talla/color/tamaño),
- **Cuando** el operador crea variantes y asigna SKU y código de barras
  (EAN/UPC),
- **Entonces** cada variante se registra con su `sku` único y su `barcode`, el
  stock se contabiliza **por variante** (no solo por producto), y el escaneo del
  código resuelve la variante exacta.
- **Métrica:** crear un producto con ≥2 variantes (SKU/barcode) y ver el stock
  por variante sin colisiones de SKU.

#### WB-36 · P1 (M9) — Catálogo: categorías, marcas y proveedores — `t127`, `t129`
- **Dado** la necesidad de organizar y trazar el origen de los productos,
- **Cuando** el operador administra categorías, marcas y proveedores,
- **Entonces** puede crear/editar/archivar `Category`, `Brand` y `Supplier` (con
  scoping multi-tenant), asociarlos al producto/variante y filtrar el inventario
  por cada uno de ellos.
- **Métrica:** un producto asociado a categoría + marca + proveedor se filtra
  correctamente por cada criterio.

#### WB-37 · P0 (M9) — Multi-almacén por sucursal (multi-tenant) — `t127`, `t129`
- **Dado** una cadena con sucursales, cada una con su propio almacén
  (`Warehouse` ligado a `Organization`),
- **Cuando** una sucursal consulta o mueve stock,
- **Entonces** ve y opera **solo** su almacén (scoping fail-closed por
  `organizationId`/`warehouse`), y la casa matriz ve la vista consolidada de
  todos sus almacenes.
- **Métrica:** la sucursal A no lee ni mueve stock del almacén de la sucursal B;
  HQ ve el agregado correcto.

#### WB-38 · P0 (M9) — Movimientos de stock con ledger auditable — `t128`, `t129`
- **Dado** la operación diaria del depósito,
- **Cuando** se registra una entrada, salida, ajuste o transferencia entre
  almacenes,
- **Entonces** se crea un `StockMovement` inmutable (cantidad antes/después,
  motivo, usuario, referencia a venta/compra) y el `StockLevel` se actualiza de
  forma consistente; el ledger no se edita ni borra (solo se reversa con un
  movimiento opuesto).
- **Métrica:** secuencia entrada→salida→transferencia con ledger correcto y
  stock final exacto; intento de edición del ledger rechazado.

#### WB-39 · P0 (M9) — Alertas de stock bajo por umbral — `t128`, `t129`
- **Dado** un `StockLevel` con umbral mínimo y crítico por almacén,
- **Cuando** la cantidad cae por debajo de un umbral,
- **Entonces** el sistema marca el ítem como "stock bajo/crítico", lo expone en
  un listado/endpoint de alertas y (opcional) notifica al responsable.
- **Métrica:** un movimiento que cruza el umbral genera la alerta; reponer el
  stock la elimina.

#### WB-40 · P1 (M9) — Valoración de inventario (costo promedio/FIFO) — `t128`, `t129`
- **Dado** movimientos de entrada con precio de compra,
- **Cuando** se calcula la valoración,
- **Entonces** el sistema aplica **costo promedio ponderado** (base) y permite
  **FIFO** opcional, y reporta el valor total del stock por producto/almacén.
- **Métrica:** valoración correcta en un caso de prueba con entradas a distintos
  costos (promedio y FIFO).

#### WB-41 · P1 (M9) — Reportes y export/import CSV — `t128`, `t129`
- **Dado** la necesidad de análisis y migración de datos,
- **Cuando** el operador genera reportes (niveles de stock, movimientos,
  valoración) o exporta/importa CSV,
- **Entonces** obtiene reportes filtrables (rango de fechas, almacén, categoría)
  y archivos CSV que respetan el formato del sistema (import validado, con
  errores por fila sin corromper datos).
- **Métrica:** exportar stock y re-importarlo no corrompe datos; reporte de
  movimientos por rango correcto.

#### WB-42 · P1 (M9) — Código de barras/QR + impresión térmica (integra M4) — `t129`
- **Dado** los lectores de código (M1) y la impresión térmica ESC/POS (M4),
- **Cuando** se escanea un código de barras/QR o se imprime una etiqueta,
- **Entonces** el sistema resuelve el producto/variante por `barcode`, y puede
  generar etiquetas (barcode/QR) para impresoras térmicas reutilizando el stream
  ESC/POS de M4.
- **Métrica:** escanear un barcode ubica la variante; generar una etiqueta
  produce el stream ESC/POS sin requerir hardware.

#### WB-43 · P0 (M9) — QA + i18n + documentación de M9 — `t130`, `t131`, `t132`
- **Dado** el inventario completo implementado,
- **Cuando** se ejecuta la QA en Docker aislado (CRUD variantes, movimientos,
  multi-almacén, alertas, valoración, reportes/CSV, i18n es/en/pt) y se
  documenta,
- **Entonces** el veredicto es **LIBERABLE**, los strings nuevos están traducidos
  (es/en/pt) y la guía de uso + referencia de API están publicadas.
- **Métrica:** `docker compose up` + QA → exit 0; mkdocs en verde; sin strings
  hardcodeados.

#### WB-44 · P1 (M9) — Release v2.7.0 + CHANGELOG + workflows verdes — `t133`
- **Dado** M9 completo y verificado (QA LIBERABLE),
- **Cuando** se bumpa `SYSTEM_VERSION` a `2.7.0`, se actualiza `CHANGELOG.md`
  (`[2.7.0]`) y se taggea `v2.7.0`,
- **Entonces** el release se publica y los workflows (CI typecheck + release)
  quedan en verde.
- **Métrica:** tag `v2.7.0` público; workflows CI/release ✓; changelog coherente.

### 3.7 Milestone 10 (M10) — Compositor de publicación enriquecido

> **M10** se libera en **v2.8.0** (bump menor). Enriquece el compositor "Nueva
> publicación" de la red social (`apps/web/src/features/public/SocialPublicPage.tsx`).
> Hoy el compositor acepta solo `text` + una `mediaUrl`/`mediaType` única. M10 lo
> convierte en un compositor completo. Se ancla en el **ADR-0024** (modelo de
> datos + contrato API + seguridad del unfurl, `t142`). Trazabilidad:
> `t143` (backend), `t144` (frontend), `t145` (QA). `t141` es este documento.

#### WB-45 · P0 (M10) — Galería multi-media (varias imágenes/video, reordenar/eliminar/pie) — `t143`, `t144`
- **Dado** el compositor de "Nueva publicación",
- **Cuando** el autor adjunta varias imágenes y/o un video y las reordena,
  elimina o les agrega un pie (caption),
- **Entonces** cada ítem se sube como `mediaUrls[]` (con su `type` y `caption`
  por ítem), el orden se mantiene al publicar y en el render, y eliminar/reordenar
  no deja adjuntos huérfanos.
- **Métrica:** publicar una entrada con ≥3 imágenes + 1 video (con pie) muestra
  la galería en el orden elegido; eliminar un ítem lo quita de la publicación.

#### WB-46 · P0 (M10) — Menciones `@usuario` — `t143`, `t144`
- **Dado** que el autor escribe `@` seguido de texto en el compositor,
- **Cuando** publica,
- **Entonces** el sistema detecta/autocompleta menciones a usuarios existentes,
  las guarda indexadas (resolubles y no spamean), enlaza al perfil en el render y
  notifica al mencionado; las menciones a usuarios inexistentes no rompen el post.
- **Métrica:** `@juan` enlaza al perfil y notifica a `juan`; `@noexiste` queda como
  texto plano sin error.

#### WB-47 · P1 (M10) — Hashtags `#tema` — `t143`, `t144`
- **Dado** que el autor escribe `#` seguido de texto,
- **Cuando** publica,
- **Entonces** el sistema extrae e indexa los hashtags, los resalta/enlaza en el
  render y permite filtrar el feed por hashtag (`GET /posts?tag=`).
- **Métrica:** `#webs` queda enlazado y el feed filtrado por `#webs` devuelve solo
  posts con ese tag.

#### WB-48 · P0 (M10) — Encuestas — `t143`, `t144`
- **Dado** que el autor agrega una encuesta (pregunta + opciones) a la
  publicación,
- **Cuando** los usuarios votan,
- **Entonces** la encuesta acepta un voto por usuario (`SocialPollVote`), muestra
  el conteo/porcentaje en vivo sin revelar quién votó qué, y cierra según su
  duración/estado.
- **Métrica:** una encuesta con 3 opciones registra N votos únicos (voto duplicado
  rechazado) y muestra resultados correctos.

#### WB-49 · P0 (M10) — Selector de visibilidad (Público/Seguidores/Solo yo) — `t143`, `t144`
- **Dado** el compositor,
- **Cuando** el autor elige visibilidad `public` / `followers` / `private`,
- **Entonces** la visibilidad se persiste en el post y el feed/API **filtra en
  servidor** (no leak): un post `private` solo lo ve su autor, y `followers` solo
  sus seguidores; la retrocompat (posts sin visibilidad) los trata como `public`.
- **Métrica:** un post `private` no aparece en el feed de otro usuario ni en su
  respuesta de API.

#### WB-50 · P1 (M10) — Selector de emoji — `t144`
- **Dado** el compositor,
- **Cuando** el autor abre el selector de emoji e inserta uno,
- **Entonces** el emoji se inserta en la posición del cursor sin recargar, con
  búsqueda por categoría/nombre.
- **Métrica:** insertar un emoji en medio del texto no mueve el cursor al final ni
  pierde el contenido.

#### WB-51 · P0 (M10) — Contador de caracteres con límite — `t144`
- **Dado** el compositor con un límite de caracteres definido (configurable),
- **Cuando** el autor escribe,
- **Entonces** un contador muestra `usados/límite` en tiempo real, impide
  publicar si se excede el límite y muestra estado de advertencia cerca del tope.
- **Métrica:** con límite 500, al escribir 501 caracteres el botón "Publicar" se
  deshabilita y el contador indica exceso.

#### WB-52 · P1 (M10) — Vista previa de enlaces — `t143`, `t144`
- **Dado** que el autor pega una URL en el texto,
- **Cuando** el compositor detecta el enlace,
- **Entonces** se muestra una tarjeta de vista previa (título/descripción/imagen)
  obtenida por unfurl **SSRF-safe** (deniega loopback/metadata), y el autor puede
  descartarla antes de publicar.
- **Métrica:** pegar `https://example.com` muestra la preview; una URL a
  `127.0.0.1`/`169.254.169.254` es rechazada sin fuga.

#### WB-53 · P0 (M10) — Autoguardado de borrador — `t144`
- **Dado** que el autor redacta una publicación larga,
- **Cuando** la composición cambia (o se navega/cierra el modal),
- **Entonces** el borrador se autoguarda localmente (y se restaura al reabrir el
  compositor), se descarta al publicar y no interfiere con otros borradores.
- **Métrica:** escribir, cerrar y reabrir el compositor restaura el texto/adjuntos;
  publicar limpia el borrador.

### 3.8 Milestone 11 (M11) — Escalabilidad selectable HPA/VPA

> **M11** se libera en **v2.9.0** (bump menor). Permite al usuario **elegir** el
> tipo de escalabilidad Kubernetes por workload desde un panel `/admin/scaling`.
> **Contexto ya aplicado (M2/`t26`, ADR-0008):** HPA horizontal en
> `deploy/k8s/hpa-api.yaml` (CPU/mem 70%, 2→10 réplicas) + `deployment-api.yaml`
> (requests/limits + probes + stateless con Redis pub/sub). **No se reinventa eso.**
> Se ancla en el **ADR-0025** (selector HPA/VPA + modos verticales, `t151`).
> Trazabilidad: `t152` (backend), `t153` (frontend), `t154` (QA). `t150` es este
> documento.

#### WB-54 · P0 (M11) — Selector HPA vs VPA persistido por workload (api/web) — `t152`, `t153`
- **Dado** el panel `/admin/scaling`,
- **Cuando** el operador elige para cada workload (`api`, `web`) el modo
  `horizontal` (HPA) o `vertical` (VPA),
- **Entonces** la selección se persiste (settings/ConfigMap `webs-scaling`) vía
  `PUT /api/v1/system/scaling` y se aplica al workload elegido sin afectar al
  otro; `GET /api/v1/system/scaling` devuelve la selección vigente.
- **Métrica:** elegir VPA para `api` y HPA para `web` persiste ambos y el
  manifiesto/estado de cada workload refleja su modo.

#### WB-55 · P0 (M11) — Modo vertical `Auto` (aplica recomendaciones) — `t152`
- **Dado** un workload configurado en modo VPA `Auto`,
- **Cuando** el VPA recommender calcula nuevas recomendaciones de CPU/memoria,
- **Entonces** el `VerticalPodAutoscaler` se emite con `updateMode: Auto` y aplica
  las recomendaciones (reiniciando pods cuando corresponde), actualizando
  requests/limits del workload.
- **Métrica:** el YAML generado tiene `updateMode: Auto`; un cambio de
  recomendación se refleja en el pod tras el reinicio.

#### WB-56 · P0 (M11) — Modo vertical `Recommender` (solo recomendaciones visibles) — `t152`, `t153`
- **Dado** un workload en modo VPA `Recommender`,
- **Cuando** el recommender publica recomendaciones,
- **Entonces** el VPA se emite con `updateMode: Off` (no aplica), y las
  recomendaciones se muestran en el panel sin modificar los pods.
- **Métrica:** con `updateMode: Off`, las recomendaciones aparecen en `/admin/scaling`
  y los requests/limits del workload permanecen sin cambios.

#### WB-57 · P0 (M11) — Modo vertical `Initial` (aplica en creación) — `t152`
- **Dado** un workload en modo VPA `Initial`,
- **Cuando** se crea un pod nuevo,
- **Entonces** el VPA se emite con `updateMode: Initial` y aplica las
  recomendaciones solo al crear el pod, sin reiniciar pods ya existentes.
- **Métrica:** el YAML tiene `updateMode: Initial`; pods existentes no se
  reinician por recomendaciones.

#### WB-58 · P0 (M11) — Parámetros HPA configurables (min/max, target CPU/mem) — `t152`, `t153`
- **Dado** un workload en modo HPA,
- **Cuando** el operador configura `minReplicas`, `maxReplicas`,
  `cpuTargetPct` y `memTargetPct`,
- **Entonces** el HPA del workload se genera con esos valores (persistidos y
  re-aplicables), y el escalado horizontal usa los nuevos targets.
- **Métrica:** cambiar max réplicas de 10 a 20 y target CPU de 70% a 80% se
  refleja en el HPA aplicado y en el YAML exportado.

#### WB-59 · P0 (M11) — Límites VPA configurables (min/max CPU/mem, minAllowed/maxAllowed) — `t152`, `t153`
- **Dado** un workload en modo VPA,
- **Cuando** el operador configura `minAllowed`/`maxAllowed` de CPU y memoria y
  `controlledResources: ["cpu","memory"]`,
- **Entonces** el VPA respeta esos límites (nunca recomienda/aplica fuera del
  rango) y los persiste por workload.
- **Métrica:** con `maxAllowed.memory=2Gi`, ninguna recomendación/aplicación
  excede 2Gi.

#### WB-60 · P1 (M11) — Guarda de exclusión HPA+VPA sobre la misma métrica — `t152`
- **Dado** la regla de que HPA y VPA no deben actuar a la vez sobre CPU/memoria
  del mismo workload,
- **Cuando** el operador intenta activar ambos (o la configuración lo viola),
- **Entonces** el selector impone uno u otro por workload y `PUT
  /api/v1/system/scaling` rechaza con `422` la combinación conflictiva,
  documentando la alternativa de coexistencia VPA(CPU/mem) + HPA(metrics custom,
  p. ej. KEDA por cola Redis).
- **Métrica:** una configuración HPA(CPU)+VPA(CPU) sobre `api` es rechazada con
  422 y mensaje claro; VPA(CPU/mem)+HPA(metric custom) es aceptada.

#### WB-61 · P1 (M11) — Visibilidad del estado (recomendaciones actuales, réplicas, eventos) — `t152`, `t153`
- **Dado** el panel `/admin/scaling`,
- **Cuando** el operador consulta un workload,
- **Entonces** ve las recomendaciones actuales del VPA (cuando aplica), las
  réplicas actuales/objetivo del HPA y los eventos recientes de escalado, sin
  acceder a `kubectl` manualmente.
- **Métrica:** el panel refleja el estado del workload consultado (recomendación
  VPA o réplicas HPA) en una lectura.

#### WB-62 · P1 (M11) — Export YAML del manifiesto generado según la selección — `t152`, `t153`
- **Dado** la selección de escalabilidad de un workload,
- **Cuando** el operador pide exportar el manifiesto,
- **Entonces** el sistema genera/descarga el YAML correcto (HPA `autoscaling/v2` o
  VPA `autoscaling.k8s.io/v1`) coherente con la configuración persistida, listo
  para `kubectl apply`.
- **Métrica:** exportar un workload en modo VPA `Recommender` produce un YAML con
  `updateMode: Off` y los `minAllowed`/`maxAllowed` configurados.

---

## 4. Roadmap de releases

| Release | Versión | Alcance |
|---------|---------|---------|
| **R1 — Fundación** | **v1.58.0** ✓ | WB-1→WB-17: rename Bloques→Plugins + menú nativo, CI + release en verde, bugs B1/B2 (inventario/tienda, social-login), constructor de páginas + templates, UX de pago + dashboards, lectores de código, auditorías + QA + docs + changelog. |
| **R2 — Pulido M1** | **v1.59.0** | Buffer de hardening/UX (absorbido en v2.0.0): cierre de hallazgos de QA, alias de compatibilidad `blocks`→`plugins` estable, refinamiento de templates y dashboards. |
| **R3 — Expansión** | **v2.0.0** ✓ | WB-18→WB-24: sistema de licencias (*Licensify*, `@licensify/core`), multi-tenant por cadenas (finanzas separadas + consolidadas HQ), escalabilidad k8s (HPA/stateless/auto-scaling), mobile real Capacitor, OAuth2 real (state/PKCE), limpieza de naming interno `block`, sistema de actualización zero-downtime (app + plugins). |
| **R4 — Consolidación** | **v2.1.0** | WB-25→WB-34: cierre de deuda (F12/F4/F10/F17), visual page builder (GrapesJS + página de inicio configurable), i18n ES/EN/PT, documentos legales (ToS/Disclaimer/Privacy/Cookies), mobile Capacitor nativo + desktop, fix de login en Docker, política "todo nativo / sin componentes de pago", QA + docs + release. |
| **R5 — Operación** | **v2.2.0** | M4: pulido admin/UX (categorías `/admin`, buscador, actualizaciones unificadas), plugin fiscal ARCA, comprobantes/facturas por pago + impresión térmica ESC/POS, checkout unificado + pago en sucursal. |
| **R6 — Marketplace** | **v2.3.0** | M5: plugins con fuente remota GitHub + botón "Instalar", nginx allowlist + multi-sucursal por subdominio, roles/permisos completos, app de claves de licencia para venta, finalización de plugins. |
| **R7 — Licencias** | **v2.4.0** | M6: feature-gating por licencia (integra `@licensify/core` con features premium). |
| **R8 — Acceso rápido** | **v2.5.0** | M7: generador de APIs de acceso rápido (recurso → modelo + rutas CRUD + SDK tipado web/móvil). |
| **R9 — Soporte** | **v2.6.0** | M8: rediseño de `/admin/menu`, sistema de tickets/soporte con estados, chat de usuarios en tiempo real + ventana flotante. |
| **R10 — Inventario** | **v2.7.0** | M9: WB-35→WB-44 — inventario completo (variantes/SKU/EAN-UPC, catálogo, multi-almacén por sucursal, movimientos con ledger auditable, alertas de stock bajo, valoración costo promedio/FIFO, reportes + export/import CSV, código de barras/QR + impresión térmica). |
| **R11 — Red social** | **v2.8.0** | M10: WB-45→WB-53 — compositor de publicación enriquecido (galería multi-media, menciones, hashtags, encuestas, visibilidad, emoji, contador de caracteres, vista previa de enlaces, autoguardado de borrador). |
| **R12 — Escalabilidad** | **v2.9.0** | M11: WB-54→WB-62 — escalabilidad Kubernetes selectable (HPA configurable vs VPA Auto/Recommender/Initial, guarda de exclusión, visibilidad de estado, export YAML) desde `/admin/scaling`. |
| **R13 — Backlog** | **v2.10.0+** | Backlog continuo: hardening del anti-reverse-engineering, auto-scaling fino por métricas custom (KEDA), más proveedores OAuth2, más idiomas (FR/DE/IT), empaquetado de stores (iOS/Android). |

**Criterio de corte entre R1 y R2:** R1 sale solo con P0/P1 de M1 en verde
(typecheck + release ✓) y sin bugs bloqueantes (B1, B2 corregidos). R3 es un
bump **mayor** (v2.0.0) porque introduce licenciamiento, multi-tenancy y el
sistema de actualización, que cambian el contrato de despliegue, datos y
operación (zero-downtime). **R4 es un bump menor (v2.1.0)**: consolida la deuda
técnica de M2 (F12/F4/F10/F17) y suma producto sin cambiar el contrato de datos
(builder visual, i18n, legal, mobile/desktop, login Docker). **R10 (v2.7.0) es un
bump menor** acotado al dominio de inventario: introduce un modelo de datos nuevo
(`Variant`, `Warehouse`, `StockMovement`/ledger) y migra desde el inventario
básico, manteniendo el contrato multi-tenant fail-closed y sin romper tienda/POS
(`shareInventory`).

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
| t14-mobile | WB-13 |
| t20-adr-update | WB-24 (ADR-0010) |
| t21-licensify | WB-18 |
| t22-multitenant | WB-19 |
| t23-oauth2 | WB-22 |
| t24-ux-m2 | WB-24 (UX) |
| *(futuro)* k8s | WB-20 |
| *(futuro)* mobile Capacitor | WB-21 |
| *(futuro)* naming cleanup | WB-23 |
| t51-backlog-m3 | WB-25→WB-34 (este documento) |
| t52-adr-m3 | WB-28 (ADR-0011), WB-29 (ADR-0012), WB-32 (política deps) |
| t53-devops-login | WB-31 |
| t54-legal | WB-30 (redacción), WB-32 (anexo) |
| t55-i18n-audit | WB-29 (auditoría) |
| t56-builder-back | WB-28 (backend) |
| t57-builder-front | WB-28 (frontend) |
| t58-i18n | WB-29 (implementación) |
| t59-legal-ui | WB-30 (integración) |
| t60-deuda | WB-25 |
| t61-mobile-desktop | WB-27 |
| t62-qa-m3 | WB-33 (QA) |
| t63-docs-m3 | WB-26 (F4) + docs de WB-27→WB-30 |
| t64-docker-e2e | WB-33 (smoke) |
| t65-release | WB-34 |
| t125-backlog-m9 | WB-35→WB-44 (este documento) |
| t126-adr-inventario | WB-35→WB-42 (ADR-0023 + spec) |
| t127-modelo-inventario | WB-35, WB-36, WB-37 (modelo de datos) |
| t128-operaciones-stock | WB-38, WB-39, WB-40, WB-41 (operaciones) |
| t129-ui-inventario | WB-35→WB-42 (frontend) |
| t130-i18n-m9 | WB-43 (i18n) |
| t131-docs-m9 | WB-43 (documentación) |
| t132-qa-m9 | WB-43 (QA) |
| t133-release | WB-44 |
| t141-backlog-m10 | WB-45→WB-53 (este documento) |
| t142-adr-social | WB-45→WB-53 (ADR-0024 + spec) |
| t143-backend-social | WB-45, WB-46, WB-47, WB-48, WB-49, WB-52 (backend) |
| t144-frontend-compositor | WB-45→WB-53 (frontend UI) |
| t145-qa-m10 | WB-45→WB-53 (QA) |
| t150-backlog-m11 | WB-54→WB-62 (este documento) |
| t151-adr-scaling | WB-54→WB-62 (ADR-0025 + spec) |
| t152-backend-scaling | WB-54→WB-62 (API, manifiestos, guarda, export YAML) |
| t153-frontend-scaling | WB-54, WB-56, WB-58, WB-59, WB-61, WB-62 (panel `/admin/scaling`) |
| t154-qa-m11 | WB-54→WB-62 (QA) |
