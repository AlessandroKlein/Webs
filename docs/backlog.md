# Backlog de producto — Webs v2.6.0+

> Documento de Producto / Scrum Master. Consolida el brief de reescritura de la
> plataforma **Webs** como base web universal, escalable y multi-tenant.
>
> - **Estado actual:** `apps/api/src/modules/system.ts` → `SYSTEM_VERSION = '2.6.0'`
>   (**M1 v1.58.0** · **M2 v2.0.0** · **M3 v2.1.0** · **M4 v2.2.0** · **M5 v2.3.0**
>   · **M6 v2.4.0** · **M7 v2.5.0** · **M8 v2.6.0** liberados). Roadmap planificado
>   hasta **v2.13.0** (M15 — videoteca/streaming: series y películas).
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
| **M7 — Acceso rápido** | Generador de APIs de acceso rápido (recurso → modelo + rutas CRUD + SDK tipado web/móvil) con validación/sanitización, permisos RBAC, scoping multi-tenant y feature-gating por licencia (premium). |
| **M8 — Soporte** | Rediseño de `/admin/menu` (elementos reales core+plugins) · sistema de tickets/soporte con estados (pendiente/en curso/terminado) · chat de usuarios en tiempo real + ventana flotante · retirar `/admin/chat`. |
| **M9 — Inventario** | Inventario completo: variantes de producto (SKU, código de barras EAN/UPC), categorías/marcas/proveedores, multi-almacén por sucursal, movimientos de stock con ledger auditable, alertas de stock bajo, valoración (costo promedio/FIFO), reportes y export/import CSV, soporte de código de barras/QR integrable con impresoras térmicas (M4). |
| **M10 — Red social** | Compositor de publicación enriquecido en `SocialPublicPage.tsx`: galería multi-media (imágenes/video con pie, reordenar/eliminar), menciones `@usuario`, hashtags `#tema`, encuestas, selector de visibilidad (Público/Seguidores/Solo yo), selector de emoji, contador de caracteres con límite, vista previa de enlaces, autoguardado de borrador. |
| **M11 — Escalabilidad** | Escalabilidad Kubernetes selectable por el usuario desde `/admin/scaling`: elegir Horizontal (HPA) vs Vertical (VPA) por workload; VPA con modos Auto/Recommender/Initial; HPA/VPA configurables; guarda de exclusión HPA+VPA sobre la misma métrica; visibilidad de recomendaciones/réplicas/eventos; export YAML del manifiesto generado. |
| **M12 — Actualizaciones** | Vista RAW/Code de los datos de actualización en `/admin/updates`: endpoint de datos crudos (manifest + changelog + archivos cambiados + checksums + firma Ed25519) en JSON/YAML; toggle Code/RAW con resaltado de sintaxis autohospedado + copiar + descargar; redacción de campos sensibles (sin secretos), permiso `update.manage` (solo admin). |
| **M13 — IoT** | Serie temporal local (ThingSpeak-like, 100% local) con base de datos separada `webs_iot` + modelo genérico de mediciones, retención/downsampling y consultas con agregación; plugins `invernadero` (IP/URL + Bearer, control de actuadores) y `sema` (IP/URL + X-API-Key) con conexión mínima + test, dashboards con gráficos de históricos; multi-tenant por organización, token cifrado + SSRF-safe, i18n, docs, QA y release. |
| **M14 — Experiencia pública** | Página de inicio (/) totalmente editable (hero/CTA como secciones del layout + mejora de estilo) · editor de bloques (GrapesJS) más intuitivo (paleta/preview/acciones/edición inline) · header público configurable (menú `main` + dropdown `user`) · selector de idioma en la cuenta del usuario (`/account`). |
| **M15 — Videoteca** | Plugin `videoteca` (`@webs/plugin-videoteca`, categoría "contenido") para catálogo de series y películas: título, sinopsis, portada, año, géneros, reparto, temporadas/episodios; embed de video multi-plataforma vía oEmbed (YouTube/Vimeo/Dailymotion/Twitch/TikTok) + video propio (mp4/HLS); botón ver/descargar con enlaces oficiales (Netflix/Prime/Apple TV/YouTube Movies + archivos propios, nunca rip); metadatos opcionales TMDB (clave por tenant) + Wikipedia/Wikidata + IDs externos como links salientes (sin scraping). |

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

### 3.6 Milestone 4 (M4) — Operación

> **M4** se libera en **v2.2.0** (bump menor). Cubre 4 frentes: pulido admin/UX,
> fiscal ARCA, comprobantes/facturas y pagos. Se ancla en los **ADR-0013** (arca),
> **ADR-0014** (comprobantes), **ADR-0015** (checkout) + spec de categorías del
> menú (`t68`). Trazabilidad: `t68`–`t79`; `t67` es este documento.

#### WB-63 · P0 (M4) — Categorías del menú `/admin` (taxonomía) — `t70`, `t68`
- **Dado** el panel `/admin` con un menú plano,
- **Cuando** se aplica la taxonomía de `t68` (Apariencia / Configuración /
  Contenido / Integraciones / …),
- **Entonces** los ítems del menú se agrupan en categorías coherentes (todo lo de
  aspecto en Apariencia, configuraciones en Configuración, etc.), sin ítems
  huérfanos ni duplicados.
- **Métrica:** el menú `/admin` muestra categorías y cada ítem está en exactamente
  una categoría según la spec.

#### WB-64 · P1 (M4) — Fix CSS/estilos de `/admin/templates` — `t70`
- **Dado** la pantalla `/admin/templates` con elementos desalineados,
- **Cuando** se corrigen los estilos,
- **Entonces** la grilla de plantillas queda alineada y responsive usando los
  tokens `--ws-*` del proyecto.
- **Métrica:** revisión visual de `/admin/templates` sin desalineaciones en
  desktop y mobile.

#### WB-65 · P1 (M4) — Buscador en plantillas y catálogo de plugins — `t70`
- **Dado** la lista de plantillas (`/admin/templates`) y el catálogo de plugins
  (`/admin/plugins/install`),
- **Cuando** el operador escribe en el buscador,
- **Entonces** filtra por nombre/descripción en tiempo real, con estado vacío
  claro cuando no hay resultados.
- **Métrica:** buscar un término en plantillas y en plugins filtra correctamente
  ambas listas.

#### WB-66 · P1 (M4) — Actualizaciones unificadas (app + plugins en un solo lugar) — `t70`
- **Dado** que hoy las actualizaciones de la app y de los plugins aparecen en dos
  lugares distintos,
- **Cuando** el operador abre la pantalla de actualizaciones,
- **Entonces** ve una sola pantalla con sección "app" y sección "plugins"
  (versión actual, disponible y acción de actualizar), coherente con el sistema
  de actualización zero-downtime (ADR-0010).
- **Métrica:** una sola entrada de menú lleva a app + plugins; ambos muestran
  versión actual/disponible.

#### WB-67 · P1 (M4) — Limpieza de plugins (legacy + ocultar sección sin instalados) — `t70`
- **Dado** plugins anteriores/legacy y el caso de un sitio sin plugins,
- **Cuando** se limpia el catálogo y se visita `/admin`,
- **Entonces** los plugins legacy que ya no corresponden se eliminan, y la
  categoría/sección "Plugins" del menú **se oculta** cuando no hay plugins
  instalados.
- **Métrica:** sitio sin plugins instalados no muestra "Plugins" en el menú; con
  plugins instalados sí.

#### WB-68 · P0 (M4) — Plugin `arca`: facturación electrónica ARCA/AFIP (WSFE, CAE) — `t71`, `t68`, `t69`
- **Dado** un contribuyente argentino configurado (CUIT, punto de venta,
  certificado X.509, modo homologación/producción),
- **Cuando** se solicita un CAE para un comprobante,
- **Entonces** el plugin `arca` autentica con el WSFE (ticket de acceso firmado),
  solicita el CAE/CAEA y devuelve el resultado, con modo homologación para
  pruebas y errores controlados (sin certificado válido → error claro, sin
  romper el flujo).
- **Métrica:** `POST /api/v1/arca/cae` en homologación responde con CAE de prueba
  o error controlado; `GET /api/v1/arca/estado` devuelve la configuración.

#### WB-69 · P0 (M4) — Comprobante por cada pago (numeración + datos fiscales + CAE) — `t72`, `t68`, `t69`
- **Dado** un pago/comprar completado,
- **Cuando** el flujo de pago dispara la generación del comprobante,
- **Entonces** se crea una factura/receipt con numeración correlativa, datos
  fiscales obligatorios (CUIT, punto de venta, número, fecha, importes neto/IVA/
  total, condición IVA, datos del receptor) y campo para el CAE (aportado por
  `arca`), enlazada al pago y al usuario.
- **Métrica:** cada pago exitoso produce exactamente un comprobante con numeración
  correlativa y datos fiscales completos.

#### WB-70 · P1 (M4) — Template de factura editable (editor gráfico) — `t72`, `t74`
- **Dado** el aspecto por defecto del comprobante,
- **Cuando** el operador edita el template (logo, colores, textos, campos
  visibles/ocultos) desde el editor gráfico,
- **Entonces** la configuración se persiste y todos los comprobantes se renderizan
  con el template actualizado (preview incluido).
- **Métrica:** cambiar logo + color + ocultar un campo se refleja en la preview y
  en el comprobante generado.

#### WB-71 · P1 (M4) — Impresión térmica ESC/POS + "Mis comprobantes" por usuario — `t72`, `t74`
- **Dado** un comprobante generado,
- **Cuando** se solicita la impresión térmica o el usuario consulta "Mis
  comprobantes",
- **Entonces** `GET /api/v1/invoices/:id/escpos` genera el stream ESC/POS
  (80mm/58mm, sin requerir hardware) y el usuario ve su listado con búsqueda por
  fecha/rango y descarga (PDF/HTML).
- **Métrica:** el stream ESC/POS se genera sin hardware; "Mis comprobantes" filtra
  por fecha y permite descarga/preview.

#### WB-72 · P0 (M4) — Suscripción → pago (navegar al checkout) — `t73`, `t75`
- **Dado** que un usuario elige una suscripción,
- **Cuando** confirma,
- **Entonces** se crea una intención de pago y se redirige al checkout unificado
  (método + datos de facturación), completando el flujo suscripción→pago sin
  pasos muertos.
- **Métrica:** elegir suscripción → checkout → pago → comprobante, de extremo a
  extremo, sin pantallas rotas.

#### WB-73 · P0 (M4) — Pago físico en sucursal (POS/caja) — `t73`, `t75`
- **Dado** una sucursal con caja/POS,
- **Cuando** se registra un pago presencial (efectivo o tarjeta por terminal),
- **Entonces** `POST /api/v1/payments/pos` registra el pago con el método elegido
  y dispara el comprobante (igual que un pago online).
- **Métrica:** un pago POS registrado produce comprobante y queda trazado en el
  resumen de pagos de la sucursal.

#### WB-74 · P0 (M4) — Checkout unificado (tienda + suscripciones) — `t75`, `t73`
- **Dado** el flujo de compra (tienda) y el de suscripción,
- **Cuando** el usuario llega al checkout,
- **Entonces** una única página bien diseñada muestra resumen, selección de método
  (online + pago físico), datos de facturación, confirmación y pantalla de éxito
  con el comprobante; reutilizable por tienda y suscripciones, responsive y
  accesible.
- **Métrica:** el mismo checkout sirve a tienda y suscripción; checkout exitoso
  muestra el comprobante y checkout fallido muestra error con reintento.

#### WB-75 · P0 (M4) — i18n de M4 (ES/EN/PT) — `t76`
- **Dado** las nuevas superficies de M4 (checkout, comprobantes, editor de
  template, categorías del menú, pago en sucursal, plugin `arca`),
- **Cuando** se auditan los strings,
- **Entonces** todas las cadenas están traducidas en `es`/`en`/`pt` con paridad de
  claves y sin strings hardcodeados.
- **Métrica:** `es`/`en`/`pt` tienen el mismo set de claves; grep de strings
  hardcodeados = 0.

#### WB-76 · P0 (M4) — QA + documentación de M4 — `t77`, `t78`
- **Dado** M4 implementado,
- **Cuando** se ejecuta la QA en Docker aislado (login, categorías del menú,
  buscador, actualizaciones, suscripción→checkout→pago→comprobante, pago POS,
  `arca` homologación, comprobantes + template + impresión, i18n) y se documenta,
- **Entonces** el veredicto es **LIBERABLE** y la documentación (facturación
  electrónica, comprobantes, checkout/pagos, menú admin) está publicada con
  `mkdocs build` en verde.
- **Métrica:** QA → exit 0 sin findings bloqueantes; mkdocs en verde.

#### WB-77 · P1 (M4) — Release v2.2.0 + CHANGELOG + workflows verdes — `t79`
- **Dado** M4 completo y verificado (QA LIBERABLE),
- **Cuando** se bumpa `SYSTEM_VERSION` a `2.2.0`, se actualiza `CHANGELOG.md`
  (`[2.2.0]`) y se taggea `v2.2.0`,
- **Entonces** el release se publica y los workflows (CI typecheck + release)
  quedan en verde.
- **Métrica:** tag `v2.2.0` público; workflows CI/release ✓; changelog coherente.

### 3.7 Milestone 5 (M5) — Marketplace / plugin-source / multi-sucursal

> **M5** se libera en **v2.3.0** (bump menor). Cubre 5 prioridades del usuario:
> (1) los plugins dejan de mostrarse "local" y pasan a **fuente remota GitHub**
> con descarga al instalar, renombrando el botón "Crear"→"Instalar"; (2) **nginx**
> (o similar) con allowlist de URLs permitidas definidas en un cuadro + cada
> sucursal con **URL propia (subdominio)** sin usar la URL principal; (3) apartado
> de **roles completo** con TODOS los permisos + patrón "crear" (botón → página/
> modal con todos los campos) en toda la app; (4) **app de claves de licencia**
> para venta del proyecto + pruebas E2E en local; (5) **terminar todos los
> plugins**. Se ancla en **ADR-0016** (plugin-source remoto), **ADR-0017**
> (nginx allowlist + multi-sucursal) y **ADR-0018** (roles/permisos). Trazabilidad:
> `t80`–`t94`; `t80` es este documento.

#### WB-90 · P0 (M5) — Fuente remota de plugins (GitHub) + descarga al instalar — `t82`
- **Dado** el catálogo de plugins que hoy muestra todo como "local" por vivir en
  el repo,
- **Cuando** se marca el origen en `plugin.json` (`source`/URL de repositorio
  GitHub) y se instala un plugin,
- **Entonces** el catálogo presenta el plugin como remoto, `installPlugin`
  descarga el paquete desde la fuente remota (reutilizando el pipeline del
  updater de M2) y el estado mostrado es remoto/no-instalado, manteniendo
  retrocompatibilidad para seguir instalando los plugins locales del repo en
  desarrollo.
- **Métrica:** instalar un plugin desde GitHub descarga el paquete; el catálogo
  deja de marcar "local" a los remotos.

#### WB-91 · P0 (M5) — Marketplace: botón "Instalar" + badge de origen (GitHub/local) — `t83`
- **Dado** el marketplace/catálogo de plugins,
- **Cuando** el administrador ve un plugin,
- **Entonces** la acción se llama "Instalar" (no "Crear"), muestra un badge de
  origen (GitHub remoto vs local) según el campo de fuente, y "Instalar"
  descarga/activa el plugin correctamente.
- **Métrica:** el flujo Instalar → plugin activo funciona; el badge coincide con
  la fuente real.

#### WB-92 · P0 (M5) — nginx reverse-proxy con allowlist de URLs permitidas — `t84`
- **Dado** el reverse-proxy nginx (o similar) delante de la API,
- **Cuando** llega una petición,
- **Entonces** solo responde a las URLs/paths explícitamente permitidos (lista
  definida en settings) y rechaza el resto con 403/404.
- **Métrica:** una URL no permitida → 403/404; una permitida → 200.

#### WB-93 · P0 (M5) — Multi-sucursal por subdominio (URL propia) — `t84`, `t85`
- **Dado** una cadena con sucursales,
- **Cuando** cada sucursal accede por su subdominio (p. ej. `sucursalX.dominio.com`),
- **Entonces** nginx mapea el subdominio a la misma API, que resuelve la
  organización/sucursal por hostname (resolveTenant por subdominio →
  organizationId/chainId) y aplica el scoping multi-tenant, sin depender de la
  URL principal.
- **Métrica:** `sucursalX.dominio.com` resuelve a la org X y solo ve sus datos;
  una URL no mapeada es rechazada.

#### WB-94 · P0 (M5) — Catálogo completo de permisos — `t86`
- **Dado** las claves de permiso dispersas en el código,
- **Cuando** se consulta el catálogo de permisos,
- **Entonces** un endpoint (p. ej. `GET /api/v1/permissions`) centraliza y expone
  **TODAS** las claves (plugin.*, license.*, organization.*, content.*,
  membership.*, attendance.*, sales/checkout/invoices/pagos, etc.), y los roles
  nuevos respetan el RBAC (`authorize`) en las rutas.
- **Métrica:** el catálogo lista todas las claves; un rol con un permiso
  específico solo accede a esas rutas.

#### WB-95 · P0 (M5) — Roles: crear/editar con TODOS los permisos + patrón "crear" — `t87`
- **Dado** el apartado de roles,
- **Cuando** se crea o edita un rol,
- **Entonces** se pueden seleccionar todos los permisos del catálogo
  (checkbox/grupos), y toda acción de "crear" en la app (roles, plugins, páginas,
  usuarios…) abre una página dedicada o modal con TODOS los campos, evitando
  formularios incompletos.
- **Métrica:** crear un rol con permisos arbitrarios funciona; cada botón "crear"
  abre un formulario completo.

#### WB-96 · P0 (M5) — Claves de licencia para venta: generar/validar/revocar — `t88`
- **Dado** `@licensify/core` y `apps/api/src/modules/licenses/` de M2,
- **Cuando** se emite una clave de activación,
- **Entonces** los endpoints generan claves firmadas (Ed25519), las validan, las
  revocan y las listan (comprador, duración, features), de modo que un comprador
  reciba una clave y la active en su instancia.
- **Métrica:** generar→validar→activar una clave en local funciona; revocar la
  invalida.

#### WB-97 · P0 (M5) — Panel UI de claves + E2E de venta local — `t89`
- **Dado** los endpoints de claves de t88,
- **Cuando** se usa el panel admin de claves,
- **Entonces** lista/genera/revoca claves y permite probar el flujo de venta
  completo en local (generar clave → activarla en otra instancia local).
- **Métrica:** E2E generar→activar→revocar en verde.

#### WB-98 · P0 (M5) — Terminar todos los plugins — `t90`
- **Dado** el catálogo `plugins/*`,
- **Cuando** se recorre y verifica cada plugin,
- **Entonces** cada plugin tiene manifiesto válido, rutas, dependencias, i18n,
  menú, permisos y README; los incompletos/rotos se corrigen o reportan con un
  checklist por plugin.
- **Métrica:** smoke de instalación del catálogo completo sin plugins rotos.

#### WB-99 · P0 (M5) — ADRs + spec de M5 — `t81`
- **Dado** el alcance de M5,
- **Cuando** se registran las decisiones,
- **Entonces** existen **ADR-0016** (plugin-source remoto), **ADR-0017** (nginx
  allowlist + multi-sucursal) y **ADR-0018** (roles/permisos completos) más la
  spec de claves de venta, coherentes con `base-universal.md` y
  `política-dependencias.md` (sin modo de pago).
- **Métrica:** los 3 ADRs + spec presentes; mkdocs en verde.

#### WB-100 · P1 (M5) — i18n ES/EN/PT de marketplace, roles, claves y sucursales — `t91`
- **Dado** lo nuevo de M5,
- **Cuando** se curan las claves,
- **Entonces** marketplace (badge de origen, botón "Instalar"), panel de
  roles/permisos, panel de claves de venta y textos de multi-sucursal están
  traducidos en es/en/pt con paridad de claves.
- **Métrica:** sin claves faltantes ni strings hardcodeados.

#### WB-101 · P1 (M5) — Documentación de M5 — `t92`
- **Dado** M5 implementado,
- **Cuando** se documenta,
- **Entonces** hay guías de plugins con fuente remota, nginx allowlist +
  multi-sucursal por subdominio, roles/permisos (catálogo completo) y claves de
  licencia para venta, con índices/nav actualizados en Webs docs/ y Docs.git.
- **Métrica:** `mkdocs build` en verde.

#### WB-102 · P0 (M5) — QA + E2E local completo — `t93`
- **Dado** M5 implementado,
- **Cuando** se ejecuta QA en Docker aislado + E2E local,
- **Entonces** verifica: catálogo con origen remoto + botón "Instalar"
  (descarga/activación), nginx allowlist (URLs no permitidas rechazadas) +
  multi-sucursal por subdominio, roles con catálogo completo + patrón crear, y
  generación→activación de una clave de licencia en instancia local; emite
  veredicto LIBERABLE/NO LIBERABLE.
- **Métrica:** veredicto LIBERABLE; E2E de venta en verde.

#### WB-103 · P1 (M5) — Release v2.3.0 + CHANGELOG + workflows verdes — `t94`
- **Dado** M5 completo y verificado (QA LIBERABLE),
- **Cuando** se bumpa `SYSTEM_VERSION` a `2.3.0`, se actualiza `CHANGELOG.md`
  (`[2.3.0]`) y se taggea `v2.3.0`,
- **Entonces** el release se publica y los workflows (CI typecheck + release)
  quedan en verde.
- **Métrica:** tag `v2.3.0` público; workflows CI/release ✓; changelog coherente.

### 3.8 Milestone 6 (M6) — Feature-gating por licencia (UI)

> **M6** se libera en **v2.4.0** (bump menor). Implementa el **feature-gating por
> licencia** en la UI: el menú, el catálogo de plugins y las secciones/datos de
> los dashboards se filtran según las features activas de la licencia (`GET
> /api/v1/license`), de modo que el cliente ve exactamente lo que pagó. Anclado en
> **ADR-0019** (feature-gating por licencia) + spec de mapeo. Trazabilidad:
> `t95`–`t102`; `t95` es este documento.

**Catálogo canónico de features** (fuente: `apps/api/src/modules/licenses/features.ts` → `LICENSE_FEATURES`, expuesto por `GET /api/v1/license/features`):

| Feature | Etiqueta | Área | Tipo |
|---------|----------|------|------|
| `core` | Núcleo | core | **Núcleo** (siempre activa) |
| `payments` | Pagos | commerce | Premium |
| `shipping` | Envíos | commerce | Premium |
| `inventory` | Inventario y tienda | commerce | Premium |
| `ai` | Integraciones de IA | ai | Premium |
| `analytics` | Analítica | ai | Premium |
| `multitenant` | Cadenas multi-tenant | scale | Premium |
| `marketplace` | Marketplace de plugins | extensions | Premium |
| `templates` | Templates premium | extensions | Premium |

**Mapeo feature → (menú, plugin, sección de datos)** (referencia; se finaliza en
ADR-0019 `t96` y se aplica en `t97`/`t98`):

| Feature | Menú | Plugins | Secciones/datos |
|---------|------|---------|-----------------|
| `core` | Dashboard, Páginas, Contenido, Usuarios, Roles, Media, Ajustes, Menú | blog, seo, search, social, social-login, chat, formularios, correo, notificaciones, documentos, mapa, calendario, academia, reservas, support, workflows, afiliados | Panel de usuario (pedidos/membresía/rutinas) + panel de trabajador (asistencia/rutinas/reservas) |
| `payments` | Pagos | mercadopago, stripe, paypal, payway, ebanx, facturacion, suscripciones, carrito | Pagos, "Mis comprobantes" |
| `shipping` | Envíos | andreani, oca | Logística / cotización |
| `inventory` | Inventario, Tienda, POS | inventario, ecommerce, pos | Stock, ventas (POS), cobros |
| `ai` | IA | chat-ia | Asistentes / análisis IA |
| `analytics` | Analítica | analytics, marketing | Métricas, dashboards, reportes |
| `multitenant` | Organizaciones, Sucursales | organizaciones | Selector de sucursal, finanzas consolidadas HQ |
| `marketplace` | Marketplace/Plugins (comercial) | — (instalación de plugins comerciales) | Catálogo de plugins comerciales |
| `templates` | Templates (premium) | — | Catálogo de plantillas premium |

#### WB-104 · P0 (M6) — ADR-0019 + spec de mapeo feature→menú/plugin/datos — `t96`
- **Dado** el catálogo de features ya expuesto por `/api/v1/license`,
- **Cuando** se registra la decisión,
- **Entonces** existe **ADR-0019** (feature-gating por licencia en UI) + spec que
  define el mapeo de cada feature (core + premium) a ítems de menú, plugins
  instalables y secciones/datos de dashboard, anclado en archivos reales
  (`modules/licenses`, `modules/menu`, catálogo de plugins, `AdminLayout`,
  `license-state`), con `mkdocs build` verde.
- **Métrica:** ADR-0019 + spec presentes; mapeo feature→menú/plugin/datos completo.

#### WB-105 · P0 (M6) — Filtrar menú server-side por licencia — `t97`
- **Dado** una licencia activa con features determinadas,
- **Cuando** se pide `GET /menu` o `GET /public/menu`,
- **Entonces** se devuelven solo los ítems (core + plugins) cuyas features están
  licenciadas (o marcados con la feature requerida), y `core` siempre aparece.
- **Métrica:** con licencia core, el menú no contiene ítems premium; con full,
  aparece todo.

#### WB-106 · P0 (M6) — Filtrar catálogo e instalación de plugins premium — `t97`
- **Dado** el catálogo de plugins y una licencia activa,
- **Cuando** se pide `GET /api/v1/plugins/catalog` o se instala un plugin,
- **Entonces** los plugins premium sin feature licenciada se ocultan/marcan en el
  catálogo, e instalar un plugin premium sin licencia devuelve **403** con
  mensaje claro.
- **Métrica:** instalar un plugin premium sin licencia → 403; con licencia → 201.

#### WB-107 · P0 (M6) — Exponer features activas (feature→estado) en `/license` — `t97`
- **Dado** `GET /api/v1/license`,
- **Cuando** se consulta,
- **Entonces** devuelve la lista feature→estado (activa/inactiva) para que el
  frontend filtre datos, con `core` siempre activo.
- **Métrica:** la respuesta incluye todas las features del catálogo con su estado.

#### WB-108 · P0 (M6) — Feature-gating UI: LicenseProvider + hasFeature — `t98`
- **Dado** el frontend `apps/web`,
- **Cuando** se carga la app,
- **Entonces** un provider/contexto central (p. ej. `LicenseProvider`) consume
  `GET /api/v1/license` y expone `hasFeature(feature)`; `AdminLayout`, menú
  público y dashboards renderizan solo lo licenciado, sin categorías vacías.
- **Métrica:** con licencia core vs premium, menú/plugins/datos cambian de forma
  coherente con `/admin/license`.

#### WB-109 · P0 (M6) — UX de upsell ("no incluido" vs ocultar) — `t98`
- **Dado** un feature no licenciada,
- **Cuando** el usuario la encuentra (catálogo/menú/dashboard),
- **Entonces** se muestra de forma consistente: oculta en menú/datos y con
  indicación de upsell ("no incluido en tu licencia" / "mejora tu plan") en el
  catálogo de plugins premium, sin links rotos.
- **Métrica:** ningún ítem premium renderiza roto; upsell claro en catálogo.

#### WB-110 · P1 (M6) — i18n ES/EN/PT del feature-gating — `t99`
- **Dado** lo nuevo de feature-gating,
- **Cuando** se curan las claves,
- **Entonces** los mensajes de upsell, estados de feature y strings de
  menú/catálogo/dashboards están en es/en/pt con paridad.
- **Métrica:** sin claves faltantes ni strings hardcodeados.

#### WB-111 · P1 (M6) — Documentación de feature-gating — `t100`
- **Dado** M6 implementado,
- **Cuando** se documenta,
- **Entonces** hay una guía de feature-gating (cómo se mapean features→menú/plugins/
  datos, cómo agregar una feature gateable y cómo vender/activar licencias) en
  Webs docs/ + Docs.git, con índices/nav actualizados.
- **Métrica:** `mkdocs build` en verde.

#### WB-112 · P0 (M6) — QA del feature-gating (core vs premium) — `t101`
- **Dado** M6 implementado,
- **Cuando** se ejecuta QA en entorno aislado,
- **Entonces** verifica: con licencia core el menú no muestra ítems premium y el
  catálogo oculta plugins premium (con upsell); con premium/full aparece todo;
  instalar premium sin licencia → 403; dashboards ocultan datos no licenciados;
  `/admin/license` refleja exactamente lo mostrado; regresión (login, plugin core,
  menú nativo, i18n). Veredicto LIBERABLE/NO.
- **Métrica:** QA LIBERABLE con licencia core y premium.

#### WB-113 · P1 (M6) — Release v2.4.0 + CHANGELOG + workflows verdes — `t102`
- **Dado** M6 completo y verificado (QA LIBERABLE),
- **Cuando** se bumpa `SYSTEM_VERSION` a `2.4.0`, se actualiza `CHANGELOG.md`
  (`[2.4.0]`) y se taggea `v2.4.0`,
- **Entonces** el release se publica y los workflows (CI typecheck + release)
  quedan en verde.
- **Métrica:** tag `v2.4.0` público; workflows CI/release ✓; changelog coherente.

### 3.9 Milestone 7 (M7) — Generador de APIs de acceso rápido

> **M7** se libera en **v2.5.0** (bump menor). Añade el caso de uso **"template de
> acceso rápido"**: el administrador presiona un botón y el sistema **genera
> automáticamente** la API de un recurso de negocio (endpoints CRUD + SDK tipado
> TypeScript) para consumir desde la app web o móvil, **sin escribir código a
> mano**. Se ancla en el **ADR-0020** (generador de APIs + SDK, `t104`).
> Trazabilidad: `t103`–`t111`; `t103` es este documento.
>
> **Alcance del generador (referencia para ADR-0020):**
> - **Recursos generables:** cualquier recurso de negocio definido por su nombre
>   (singular/plural) y una lista de campos. No hay catálogo cerrado: el
>   administrador define el esquema.
> - **Tipos de campo:** `string`, `number`, `boolean`, `date`, `enum`, `json` y
>   `reference` (FK a otro recurso generado). Por campo: `required`, `unique`,
>   `default`, longitud/rango.
> - **Validaciones y sanitización:** tipos, obligatoriedad, unicidad, rangos y
>   sanitización de entrada (anti XSS/inyección) en el motor, no solo en la UI.
> - **Permisos:** RBAC por recurso generado (`<recurso>.read/create/update/delete`)
>   + scoping multi-tenant automático (`organizationId` en cada registro, siguiendo
>   el contrato fail-closed de M2).
> - **Relación con plugins:** el generador es un módulo de la plataforma; los
>   recursos generados se registran como rutas dinámicas (mismo patrón del loader
>   de plugins) y el SDK se alinea con `packages/plugin-sdk`.
> - **Feature-gating (M6):** el generador se expone como feature **premium** (a
>   decidir en ADR-0020: nueva feature `developer`/`api-generator` en el área
>   `scale`/`extensions`, o reutilizar `marketplace`), gateado por
>   `LicenseService.hasFeature()`.

#### WB-114 · P0 (M7) — ADR-0020 + spec del generador de APIs — `t104`
- **Dado** la decisión de cómo materializar recursos generados (tabla dinámica vs
  código vs plantillas), el formato de definición (JSON-schema/UI-builder), el
  codegen (estático vs runtime) y la seguridad,
- **Cuando** se registra la decisión de arquitectura,
- **Entonces** existe `docs/adr/0020-api-generator.md` + una spec que define
  alcance, tipos de campo, validaciones, permisos, integración con plugins y
  feature-gating, sin contradicciones con la implementación.
- **Métrica:** ADR-0020 + spec presentes; decisión explícita sobre persistencia,
  formato de definición, codegen y feature premium.

#### WB-115 · P0 (M7) — Motor: recurso → modelo + rutas CRUD — `t105`
- **Dado** un recurso definido (nombre + campos tipo/requerido/único),
- **Cuando** el administrador lo crea desde la UI o el endpoint
  `POST /api/v1/generated`,
- **Entonces** el motor persiste el esquema y expone `GET /api/v1/generated`
  (list), `GET /api/v1/generated/:id` (detail) y `POST/PATCH/DELETE
  /api/v1/generated/:id` bajo un prefijo seguro, con CRUD funcional.
- **Métrica:** crear el recurso `clientes` (≥2 campos) → CRUD completo sin
  escribir código a mano.

#### WB-116 · P0 (M7) — Validación, sanitización, permisos y scoping — `t105`
- **Dado** un recurso generado con campos y permisos,
- **Cuando** un cliente hace una petición (crear/leer/actualizar/borrar),
- **Entonces** el motor valida tipos/obligatorios/unicidad, sanitiza la entrada, y
  aplica permisos RBAC (`<recurso>.*`) y scoping multi-tenant: cada registro lleva
  `organizationId` y un usuario de la org A **no** accede a datos de la org B.
- **Métrica:** petición inválida o cross-tenant devuelve 400/403/404, nunca 200.

#### WB-117 · P0 (M7) — SDK/API client tipado TypeScript (web + móvil) — `t106`
- **Dado** un recurso generado,
- **Cuando** el administrador pide el SDK,
- **Entonces** se entrega un cliente tipado TS (tipos de entidad + métodos con
  `fetch` y header de auth) descargable como `.ts` (codegen estático) y/o módulo
  runtime, usable desde web y móvil (Capacitor).
- **Métrica:** generar el SDK de `clientes` → el tipado autocompleta y compila sin
  errores de tipos.

#### WB-118 · P0 (M7) — UI "Acceso rápido" (botón → recurso → endpoint + SDK) — `t107`
- **Dado** un administrador con el permiso del generador (y la feature premium
  activa),
- **Cuando** abre "Acceso rápido" y define un recurso (patrón "crear" de M5:
  página/modal con todos los campos),
- **Entonces** ve el endpoint generado + el CRUD + el SDK, con acciones de
  copiar/descargar, y el feature-gating oculta/deshabilita la sección sin licencia.
- **Métrica:** definir un recurso desde la UI produce endpoint + SDK copiables.

#### WB-119 · P1 (M7) — i18n ES/EN/PT — `t108`
- **Dado** la interfaz y los textos del generador,
- **Cuando** el usuario cambia de idioma,
- **Entonces** la pantalla "Acceso rápido", los errores y el SDK generado están
  localizados en ES/EN/PT (paridad de claves).
- **Métrica:** los 3 idiomas sin claves faltantes (`i18next` sin warnings).

#### WB-120 · P1 (M7) — Documentación — `t109`
- **Dado** el generador liberado,
- **Cuando** se consulta la documentación,
- **Entonces** existe una guía operativa (cómo crear un recurso, permisos, SDK,
  feature premium) sincronizada en `docs/` y en Docs.git.
- **Métrica:** build de docs en verde; guía anclada en archivos reales.

#### WB-121 · P0 (M7) — QA end-to-end — `t110`
- **Dado** el entorno Docker aislado,
- **Cuando** se ejecuta la QA de M7,
- **Entonces** el flujo completo (crear recurso → CRUD → SDK → permisos → scoping
  → feature-gating) pasa en verde y la regresión de M1–M6 no se rompe.
- **Métrica:** QA LIBERABLE (sin hallazgos bloqueantes).

#### WB-122 · P1 (M7) — Release v2.5.0 + CHANGELOG + workflows verdes — `t111`
- **Dado** M7 completo y verificado (QA LIBERABLE),
- **Cuando** se bumpa `SYSTEM_VERSION` a `2.5.0`, se actualiza `CHANGELOG.md`
  (`[2.5.0]`) y se taggea `v2.5.0`,
- **Entonces** el release se publica y los workflows (CI typecheck + release)
  quedan en verde.
- **Métrica:** tag `v2.5.0` público; workflows CI/release ✓; changelog coherente.

### 3.10 Milestone 8 (M8) — Menú, soporte/tickets y chat en tiempo real

> **M8** se libera en **v2.6.0** (bump menor). Resuelve tres historias de
> operación diaria: (1) **rediseñar `/admin/menu`** para que muestre los
> elementos **reales** del menú (items core de Prisma + items de plugins vía
> `collectPluginMenuItems`), sin duplicados ni categorías fantasma; (2) **crear
> `/admin/support`** con un sistema de **tickets** y gestión de estados
> (pendiente / en curso / terminado); (3) **retirar `/admin/chat`** y mejorar el
> **chat de usuarios** con entrega en tiempo real (WebSocket/SSE, sin recargar) y
> una **ventana flotante** de notificación. Se ancla en los **ADR-0021** (tickets)
> y **ADR-0022** (chat real-time) + spec del menú, `t114`. Trazabilidad:
> `t113`–`t124`; `t113` es este documento.

#### WB-123 · P0 (M8) — ADR-0021 (tickets) + ADR-0022 (chat real-time) + spec de menú — `t114`
- **Dado** las decisiones de modelo de tickets (estados/prioridad/scoping) y de
  transporte del chat (WebSocket vs SSE),
- **Cuando** se registran las decisiones,
- **Entonces** existen `docs/adr/0021-tickets.md`, `docs/adr/0022-chat-realtime.md`
  y una spec del rediseño de `/admin/menu`, ancladas en archivos reales
  (`modules/menu/routes.ts`, `lib/plugin-menu.ts`, plugin de chat, `schema.prisma`).
- **Métrica:** ADR-0021 + ADR-0022 + spec presentes y consistentes.

#### WB-124 · P0 (M8) — GET /menu (admin) devuelve los items reales (core + plugins) — `t115`
- **Dado** el endpoint `GET /api/v1/menu` (admin),
- **Cuando** un administrador consulta el menú,
- **Entonces** devuelve los items core (Prisma `Menu`) + los items de plugins
  (`collectPluginMenuItems`), **sin duplicados**, con orden y `permissions`
  coherentes.
- **Métrica:** `/admin/menu` refleja exactamente esos items; typecheck/lint verde.

#### WB-125 · P0 (M8) — Rediseñar `/admin/menu` (elementos reales + edición) — `t118`
- **Dado** el panel `/admin/menu` consumiendo el `GET /menu` corregido,
- **Cuando** el administrador edita orden, visibilidad y permisos de los items,
- **Entonces** los cambios se guardan correctamente y se renderizan sin
  duplicados ni categorías fantasma, con la UI acorde al design system
  (Tailwind + shadcn).
- **Métrica:** reordenar/ocultar un item persiste y se refleja en el menú público.

#### WB-126 · P0 (M8) — Modelo `Ticket` + CRUD + transición de estados — `t116`
- **Dado** el modelo `Ticket` (subject, message, status `pending|in_progress|done`,
  priority, author),
- **Cuando** un usuario/operador crea un ticket y lo transiciona
  (`PATCH /api/v1/support/tickets/:id` con `status`),
- **Entonces** el CRUD funciona y la transición pendiente → en curso → terminado
  queda registrada, sin saltos inválidos.
- **Métrica:** crear un ticket y recorrer los 3 estados sin errores.

#### WB-127 · P0 (M8) — Scoping multi-tenant + permisos de soporte — `t116`
- **Dado** el sistema de tickets,
- **Cuando** un usuario accede a los tickets,
- **Entonces** el scoping es fail-closed por `organizationId` (una org no ve los
  tickets de otra) y se aplican los permisos `support.read` / `support.manage`.
- **Métrica:** usuario de la org A no lista ni muta tickets de la org B; 403/404.

#### WB-128 · P0 (M8) — Frontend `/admin/support`: tickets + gestión de estados — `t119`
- **Dado** el panel `/admin/support`,
- **Cuando** el operador crea, lista por estado y cambia estado/prioridad de los
  tickets,
- **Entonces** la vista por columnas o filtros (pendientes / en curso /
  terminados) es clara y usa `/api/v1/support/tickets`.
- **Métrica:** flujo crear → mover a "en curso" → "terminado" sin recargar.

#### WB-129 · P0 (M8) — Chat de usuarios en tiempo real (WS/SSE, sin recargar) — `t117`
- **Dado** el chat de usuarios,
- **Cuando** llega un mensaje nuevo,
- **Entonces** se entrega en tiempo real (WebSocket o SSE) por
  usuario/organización, **sin recargar** la página, con notificación push.
- **Métrica:** dos usuarios ven el mensaje al instante (sin F5).

#### WB-130 · P0 (M8) — Retirar `/admin/chat` + ventana flotante de notificación — `t117`, `t120`
- **Dado** el menú de administración,
- **Cuando** se navega,
- **Entonces** `/admin/chat` ya no aparece (módulo retirado del menú) y el chat de
  usuarios muestra una **ventana flotante** de notificación cuando llega un
  mensaje estando en otra sección.
- **Métrica:** `/admin/chat` ausente del menú; ventana flotante visible al recibir
  un mensaje en otra pantalla.

#### WB-131 · P1 (M8) — i18n ES/EN/PT de menú, tickets y chat — `t121`
- **Dado** las pantallas nuevas de M8,
- **Cuando** el usuario cambia de idioma,
- **Entonces** `/admin/menu`, `/admin/support`, el chat y la ventana flotante
  están localizados en ES/EN/PT con paridad de claves.
- **Métrica:** los 3 idiomas sin claves faltantes; typecheck/lint verde.

#### WB-132 · P1 (M8) — Documentación de M8 — `t122`
- **Dado** M8 implementado,
- **Cuando** se consulta la documentación,
- **Entonces** existen guías de tickets/soporte, del chat en tiempo real + ventana
  flotante y del rediseño de `/admin/menu`, sincronizadas en `docs/` y Docs.git.
- **Métrica:** `mkdocs build` verde; guías ancladas en archivos reales.

#### WB-133 · P0 (M8) — QA v2.6.0 — `t123`
- **Dado** el entorno Docker aislado,
- **Cuando** se ejecuta la QA de M8,
- **Entonces** se verifica: menú real sin duplicados, tickets CRUD + transición de
  estados con scoping, chat en tiempo real sin recargar + ventana flotante, y
  `/admin/chat` retirado; regresión de M1–M7 intacta.
- **Métrica:** veredicto LIBERABLE (sin hallazgos bloqueantes).

#### WB-134 · P1 (M8) — Release v2.6.0 + CHANGELOG + workflows verdes — `t124`
- **Dado** M8 completo y verificado (QA LIBERABLE),
- **Cuando** se bumpa `SYSTEM_VERSION` a `2.6.0`, se actualiza `CHANGELOG.md`
  (`[2.6.0]`) y se taggea `v2.6.0`,
- **Entonces** el release se publica y los workflows (CI typecheck + release)
  quedan en verde.
- **Métrica:** tag `v2.6.0` público; workflows CI/release ✓; changelog coherente.

### 3.11 Milestone 9 (M9) — Inventario completo

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

### 3.12 Milestone 10 (M10) — Compositor de publicación enriquecido

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

### 3.13 Milestone 11 (M11) — Escalabilidad selectable HPA/VPA

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

### 3.14 Milestone 13 (M13) — IoT: serie temporal local + plugins invernadero/sema

> **M13** se libera en **v2.11.0** (bump menor). Cronológicamente es **posterior a
> M12 (v2.10.0, backlog pendiente — vista RAW/Code de actualizaciones)**, cuya
> sección se insertará antes de esta cuando se redacte. M13 añade un motor de
> serie temporal 100% local (tipo ThingSpeak) y dos plugins IoT (`invernadero`,
> `sema`) que conectan dispositivos con SOLO IP/URL + token. Se ancla en el
> **ADR-0027** (serie temporal local, base separada `webs_iot`) y el **ADR-0028**
> (patrón de plugins IoT). Trazabilidad: `t167`–`t179`; `t167` es este documento.

#### WB-78 · P0 (M13) — Base de datos separada `webs_iot` + modelo genérico de mediciones — `t168`, `t169`, `t170`
- **Dado** la necesidad de históricos de sensores sin contaminar el schema
  principal,
- **Cuando** se provisiona la base y se registra una medición,
- **Entonces** existe una base PostgreSQL **separada** `webs_iot` con el modelo
  genérico `measurements(ts timestamptz, device_id, metric, value, unit)` e
  índice `(device_id, metric, ts)` (partición mensual o BRIN), accedida vía pool
  `pg` dedicado (no Prisma), y los dispositivos se registran en el schema
  principal como `IotDevice` (organizationId/kind/baseUrl/token cifrado/
  pollIntervalMs/enabled/lastSeenAt).
- **Métrica:** `docker compose up` crea `webs_iot` idempotentemente; una medición
  se escribe y se lee sin tocar `prisma migrate deploy` del schema principal.

#### WB-79 · P0 (M13) — Retención + downsampling (raw → horario → diario) — `t169`, `t170`
- **Dado** un flujo continuo de mediciones,
- **Cuando** corre el job de retención/downsampling,
- **Entonces** agrega raw a resolución horaria y diaria según la política
  configurada y purga el raw vencido, sin pérdida de los agregados.
- **Métrica:** tras N días, los agregados horario/diario se mantienen y el raw
  caducado se elimina según retención.

#### WB-80 · P0 (M13) — Consultas con agregación para gráficos — `t170`
- **Dado** una serie temporal almacenada,
- **Cuando** se consulta `querySeries({deviceId, metric, from, to, agg})`,
- **Entonces** devuelve el rango con agregación `avg/min/max/count` y bucketing
  por hora/día, apto para graficar sin re-computar en el cliente.
- **Métrica:** consulta de 30 días con `agg=avg` diario devuelve ≤30 puntos
  correctos.

#### WB-81 · P0 (M13) — Plugin `invernadero`: conexión IP/URL + token Bearer + mapeo + control — `t171`
- **Dado** un controlador de invernadero (v3.29.0, base `http://<IP>/api/v1`,
  auth Bearer/`X-Auth-Token`),
- **Cuando** se registra con SOLO `baseUrl` + token y se consulta el estado,
- **Entonces** el plugin mapea `GET /status` (temperatura, humedad, humedad de
  suelo por zona, nivel de tanque, luz, bomba, ventilador), `/sensors`,
  `/weather`, `/alarms` (severidad ≥ 2), `/actuators` y `/device`, y permite el
  control `POST /actuators {role,index,output 0..100}` (pump/valve/fan/heater/
  light/roof/window/shade/alarm) escribiendo los métricos a la serie temporal.
- **Métrica:** conectar un invernadero real y ver estado en vivo + una orden de
  actuador aceptada (HTTP 2xx).

#### WB-82 · P1 (M13) — Plugin `invernadero`: dashboard con gráficos de históricos — `t174`
- **Dado** un invernadero conectado,
- **Cuando** el operador abre su dashboard,
- **Entonces** ve tarjetas de estado en vivo (temperatura, humedad, suelo, tanque,
  luz, bomba on/off, ventilador on/off), gráficos de serie temporal por métrico
  (rango 1h/24h/7d/30d + agregación) y las alarmas (severidad ≥ 2).
- **Métrica:** el dashboard muestra ≥6 métricos con sus gráficos y sin errores.

#### WB-83 · P0 (M13) — Plugin `sema`: conexión IP/URL + X-API-Key + mapeo — `t172`
- **Dado** un nodo SEMA (v1.103.0, base `/api/v1`, auth `X-API-Key`),
- **Cuando** se registra con SOLO `baseUrl` + apiKey y se consulta,
- **Entonces** el plugin mapea `GET /status`, `/sensors`, `/history`, `/energy`,
  `/alarms` y `/system` (temperatura EXT/INT, humedad, energía, alarmas) y
  escribe los métricos a la serie temporal (sin control de actuadores en v1).
- **Métrica:** conectar un SEMA y ver estado en vivo + métricos en la serie.

#### WB-84 · P1 (M13) — Plugin `sema`: dashboard con gráficos de históricos — `t175`
- **Dado** un SEMA conectado,
- **Cuando** el operador abre su dashboard,
- **Entonces** ve tarjetas de estado (temperatura EXT/INT, humedad, energía),
  gráficos de serie temporal por métrico y alarmas/eventos listados.
- **Métrica:** el dashboard muestra los métricos de SEMA con gráficos funcionales.

#### WB-85 · P0 (M13) — UI de conexión mínima (solo IP/URL + token) con test — `t173`
- **Dado** la necesidad de conectar un dispositivo sin configuración compleja,
- **Cuando** el usuario usa `DeviceConfigForm`,
- **Entonces** ingresa **solo** IP/URL + token (con toggle mostrar/ocultar) y un
  botón "Probar conexión" que llama al test del plugin, mostrando estados
  conectando/conectado/error.
- **Métrica:** conectar un dispositivo desde el formulario con ≤2 campos + test
  en verde.

#### WB-86 · P0 (M13) — Dashboard con gráficos (componentes compartidos) — `t173`, `t174`, `t175`
- **Dado** los componentes IoT compartidos (`DeviceStatusCard`, `TimeSeriesChart`,
  `DevicesList`),
- **Cuando** se renderiza el dashboard de un dispositivo,
- **Entonces** los gráficos (SVG/canvas autohospedado, sin CDN) muestran selector
  de métrico, rango 1h/24h/7d/30d y agregación, con tarjetas de estado y listado
  de dispositivos, todo i18n-ready (es/en/pt).
- **Métrica:** los tres componentes se reutilizan en invernadero y sema sin
  duplicación.

#### WB-87 · P0 (M13) — Multi-tenant + seguridad (scoping por organización, token cifrado, SSRF-safe) — `t168`, `t170`
- **Dado** dispositivos de varias organizaciones,
- **Cuando** una organización accede a sus dispositivos,
- **Entonces** cada `IotDevice` está scoped por `organizationId` (fail-closed: la
  org A no ve ni opera dispositivos de la org B), el token se cifra con el crypto
  existente (nunca se expone en claro), y el cliente HTTP valida el host
  **SSRF-safe** (deniega loopback/privados salvo allowlist).
- **Métrica:** un usuario de la org A recibe 404/403 sobre el dispositivo de la
  org B; un `baseUrl` a `127.0.0.1` es rechazado.

#### WB-88 · P0 (M13) — i18n + documentación de M13 — `t176`, `t177`
- **Dado** el alcance IoT implementado,
- **Cuando** se curan las claves i18n (es/en/pt) y se documenta,
- **Entonces** los strings de conexión/estado/gráficos/control están traducidos
  con paridad de claves, y la guía de uso + referencia de API (ADR-0027/0028 +
  spec `docs/architecture/iot-serie-temporal.md`) están publicadas.
- **Métrica:** mkdocs en verde; sin claves i18n faltantes ni strings hardcodeados.

#### WB-89 · P1 (M13) — QA + Release v2.11.0 + CHANGELOG + workflows verdes — `t178`, `t179`
- **Dado** M13 completo,
- **Cuando** se ejecuta la QA (serie temporal, conexión/estado/control/gráficos,
  multi-tenant, SSRF-safe, i18n) y se bumpa `SYSTEM_VERSION` a `2.11.0`,
- **Entonces** el veredicto es **LIBERABLE**, el `CHANGELOG.md` se actualiza
  (`[2.11.0]`), se taggea `v2.11.0` y los workflows (CI typecheck + release)
  quedan en verde.
- **Métrica:** QA LIBERABLE; tag `v2.11.0` público; workflows CI/release ✓.

---

### 3.15 Milestone 14 (M14) — Experiencia pública: home editable + editor + header configurable

> **Alcance:** la experiencia pública (lo que ve un visitante/usuario sin ser
> admin): página de inicio editable, editor de bloques más intuitivo, header
> público configurable (menú de navegación + dropdown de usuario) y selector de
> idioma movido a la cuenta del usuario. **M14 = v2.12.0.** El selector de idioma
> ya se movió de `SiteHeader.tsx` a `/account`; aquí se documenta como hecho.

#### WB-135 · P0 (M14) — ADR-0029 + spec de experiencia pública — `t197`
- **Dado** el alcance de experiencia pública (home editable, editor, header),
- **Cuando** se registran las decisiones,
- **Entonces** existen `docs/adr/0029-*.md` y
  `docs/architecture/experiencia-publica.md` que definen: home editable con `hero`
  como sección, editor más intuitivo (paleta/preview/acciones/edición inline),
  header con menú público (clave `main`) editable + dropdown de usuario (clave
  `user`, ítems default: dashboard/blog/social/account/admin/logout), y selector
  de idioma **solo** en `/account` y `/admin`.
- **Métrica:** ADR + spec presentes y consistentes con la implementación.

#### WB-136 · P0 (M14) — Página de inicio (/) totalmente editable — `t199`
- **Dado** que un administrador edita la página de inicio,
- **Cuando** configura `hero` y CTA como secciones del layout,
- **Entonces** el contenido hardcodeado de `PublicHome.tsx` se reemplaza por la
  sección `hero` editable, con reordenar/ocultar secciones destacadas y estilo
  responsive, renderizado igual en el editor y en `/`.
- **Métrica:** editar hero/CTA + reordenar + publicar se refleja en `/` sin errores.

#### WB-137 · P0 (M14) — Editor de bloques (GrapesJS) más intuitivo — `t200`
- **Dado** un editor en el editor visual de páginas,
- **Cuando** agrega/edita bloques,
- **Entonces** dispone de paleta agrupada, vista previa fiel, acciones
  (guardar/duplicar/borrar/mover), edición inline e indicadores de estado, con
  i18n, sin pasos confusos.
- **Métrica:** editar una página completa (agregar/reordenar/editar/guardar) sin
  recurrir a la API.

#### WB-138 · P0 (M14) — Header: menú público + dropdown configurables (backend) — `t198`
- **Dado** un menú público con clave `main` y un dropdown `user`,
- **Cuando** el admin los configura (GET/PUT) y un visitante/usuario navega,
- **Entonces** el backend expone `/public/menu` (nunca `/admin/*`), con scoping
  multi-tenant fail-closed y permisos `menu.read`/`menu.manage`, devolviendo los
  ítems visibles exactamente como están definidos.
- **Métrica:** menú y dropdown configurables por organización sin filtrar datos de
  otra org.

#### WB-139 · P0 (M14) — Header: render del menú + dropdown en el sitio — `t201`
- **Dado** que el menú público `main` y el dropdown `user` están configurados,
- **Cuando** `SiteHeader` renderiza la cabecera,
- **Entonces** muestra los ítems desde `/public/menu` (con iconos), con fallback
  claro si está vacío, y el selector de idioma **no** aparece en el header.
- **Métrica:** ítems visibles == ítems del menú `main`; dropdown muestra los del
  menú `user`.

#### WB-140 · P1 (M14) — Selector de idioma en la configuración de usuario — `t203`
- **Dado** que el selector de idioma ya se movió de `SiteHeader.tsx` a la cuenta
  del usuario (hecho en v2.12.0),
- **Cuando** se cierra M14,
- **Entonces** la documentación registra el cambio: el selector está en `/account`
  (+`/admin`) y ausente del header público.
- **Métrica:** doc referencia el selector en `/account`; sin referencias al
  selector en `SiteHeader`.

#### WB-141 · P1 (M14) — i18n ES/EN/PT — `t202`
- **Dado** los textos de home, editor y header,
- **Cuando** el usuario cambia de idioma,
- **Entonces** la experiencia pública queda traducida (ES/EN/PT) sin strings
  hardcodeadas.
- **Métrica:** paridad i18n en home/editor/header.

#### WB-142 · P1 (M14) — Documentación — `t203`
- **Dado** el cierre de M14,
- **Cuando** se actualiza la documentación,
- **Entonces** `docs/` refleja la experiencia pública (home editable, editor,
  header, selector de idioma), con el ADR-0029 con su "Estado de implementación"
  actualizado y la guía `experiencia-publica.md`.
- **Métrica:** build de docs en verde; sin contradicciones con la implementación.

#### WB-143 · P0 (M14) — QA — `t204`
- **Dado** M14 completo en Docker,
- **Cuando** corre la QA,
- **Entonces** verifica en verde: home editable, editor intuitivo, header
  menú+dropdown configurables, selector de idioma en `/account` y **ausente** del
  header, scoping multi-tenant fail-closed e i18n paridad.
- **Métrica:** suite QA M14 exit 0.

#### WB-144 · P1 (M14) — Release v2.12.0 — `t205`
- **Dado** M14 completo y workflows en verde,
- **Cuando** se taggea `v2.12.0`,
- **Entonces** `CHANGELOG.md` se actualiza con `[2.12.0]`, `SYSTEM_VERSION` pasa a
  `2.12.0` y el release se publica con artefactos.
- **Métrica:** changelog coherente con `git tag`; release público.

---

### 3.16 Milestone 15 (M15) — Videoteca/streaming: series y películas

> **Alcance:** plugin `videoteca` (id `videoteca`, package `@webs/plugin-videoteca`,
> categoría "contenido") para crear un catálogo de series y películas con embeds
> de video multi-plataforma (oEmbed), botón de ver/descargar con enlaces
> oficiales, y metadatos opcionales de terceros (TMDB/Wikipedia/Wikidata).
> **M15 = v2.13.0.** Solo contenido con derechos o enlaces oficiales; **nunca**
> rip de contenido protegido ni scraping.

#### WB-145 · P0 (M15) — ADR-0030 + spec del plugin videoteca — `t208`
- **Dado** el alcance del plugin `videoteca`,
- **Cuando** se registran las decisiones,
- **Entonces** existe `docs/adr/0030-*.md` + spec que definen el modelo de datos
  (película/serie/temporada/episodio), las fuentes de video (oEmbed + video
  propio), el botón ver/descargar (solo enlaces oficiales/legales) y la
  integración de metadatos (TMDB primaria por tenant, Wikipedia/Wikidata respaldo,
  IDs externos como links salientes sin scraping).
- **Métrica:** ADR + spec presentes y consistentes con la implementación.

#### WB-146 · P0 (M15) — Modelo de datos y catálogo (backend) — `t209`
- **Dado** un administrador que crea contenido,
- **Cuando** guarda una película/serie con título, sinopsis, portada, año,
  géneros, reparto y temporadas/episodios,
- **Entonces** el backend persiste los modelos (`Movie`, `Series`, `Season`,
  `Episode`) con scoping multi-tenant (`organizationId`) y expone CRUD bajo
  `/api/v1/plugins/videoteca/*`.
- **Métrica:** crear/leer/actualizar/borrar película y serie (con N temporadas y
  M episodios) sin errores y aislado por organización.

#### WB-147 · P0 (M15) — Embed de video multi-plataforma (oEmbed) + video propio — `t210`
- **Dado** una película/episodio con una o varias fuentes de video,
- **Cuando** el usuario la reproduce,
- **Entonces** se embebe vía oEmbed (YouTube, Vimeo, Dailymotion, Twitch, TikTok)
  o se sirve video propio (mp4/HLS) con `<video>`, con URL validada (https) y sin
  exponer claves.
- **Métrica:** reproducir un embed por cada proveedor + un mp4 propio en verde.

#### WB-148 · P0 (M15) — Botón "ver/descargar" con enlaces oficiales — `t213`
- **Dado** una película/serie con plataformas configuradas,
- **Cuando** el usuario pulsa "ver/descargar",
- **Entonces** se muestran enlaces oficiales (Netflix, Prime Video, Apple TV,
  YouTube Movies) o archivos propios con derechos; **nunca** se ofrece rip de
  contenido protegido.
- **Métrica:** el botón solo expone enlaces oficiales/legales; sin enlaces a
  fuentes piratas.

#### WB-149 · P0 (M15) — Metadatos TMDB (primaria, clave por tenant) — `t211`
- **Dado** un tenant con su propia API key de TMDB,
- **Cuando** el admin busca/enriquece un título,
- **Entonces** los metadatos (título, sinopsis, portada, año, géneros, reparto)
  se obtienen de TMDB usando la clave del tenant (sin clave compartida/global),
  con caché y sin scraping.
- **Métrica:** enriquecer un título desde TMDB con clave por tenant; sin clave →
  el campo queda manual.

#### WB-150 · P1 (M15) — Wikipedia/Wikidata + IDs externos (links salientes) — `t211`
- **Dado** un título con metadatos o un ID externo,
- **Cuando** se consultan fuentes secundarias,
- **Entonces** Wikipedia/Wikidata (gratis) sirven de respaldo y cross-link, y los
  IDs IMDb/TheTVDB/Letterboxd/JustWatch se renderizan como **links salientes**
  (sin scraping de esas plataformas).
- **Métrica:** cross-link Wikidata↔TMDB + link saliente IMDb/TheTVDB/Letterboxd/
  JustWatch funcional; cero scraping.

#### WB-151 · P0 (M15) — Frontend: catálogo y páginas de detalle — `t212`
- **Dado** un visitante en el sitio,
- **Cuando** navega el catálogo de series/películas,
- **Entonces** ve listado (filtros por género/año) y página de detalle con
  sinopsis, portada, reparto y temporadas/episodios, renderizando el embed y el
  botón ver/descargar.
- **Métrica:** listado → detalle → reproducir de una película y de un episodio
  sin errores.

#### WB-152 · P1 (M15) — i18n + documentación — `t214`, `t215`
- **Dado** los textos del catálogo, reproductor y botones,
- **Cuando** el usuario cambia de idioma,
- **Entonces** la videoteca queda traducida (ES/EN/PT) y `docs/` documenta el
  plugin, el flujo de metadatos y la política de enlaces legales.
- **Métrica:** paridad i18n en catálogo/detalle/reproductor; build de docs verde.

#### WB-153 · P0 (M15) — QA + release v2.13.0 — `t216`, `t217`
- **Dado** M15 completo en Docker,
- **Cuando** corre la QA y se bumpa la versión,
- **Entonces** el veredicto es **LIBERABLE** (catálogo, embeds, ver/descargar,
  metadatos, multi-tenant, i18n), `CHANGELOG.md` se actualiza con `[2.13.0]`,
  `SYSTEM_VERSION` pasa a `2.13.0` y se taggea `v2.13.0` con workflows verdes.
- **Métrica:** QA LIBERABLE; tag `v2.13.0` público; CI/release ✓.

---

## 4. Roadmap de releases

| Release | Versión | Alcance |
|---------|---------|---------|
| **R1 — Fundación** | **v1.58.0** ✓ | WB-1→WB-17: rename Bloques→Plugins + menú nativo, CI + release en verde, bugs B1/B2 (inventario/tienda, social-login), constructor de páginas + templates, UX de pago + dashboards, lectores de código, auditorías + QA + docs + changelog. |
| **R2 — Pulido M1** | **v1.59.0** | Buffer de hardening/UX (absorbido en v2.0.0): cierre de hallazgos de QA, alias de compatibilidad `blocks`→`plugins` estable, refinamiento de templates y dashboards. |
| **R3 — Expansión** | **v2.0.0** ✓ | WB-18→WB-24: sistema de licencias (*Licensify*, `@licensify/core`), multi-tenant por cadenas (finanzas separadas + consolidadas HQ), escalabilidad k8s (HPA/stateless/auto-scaling), mobile real Capacitor, OAuth2 real (state/PKCE), limpieza de naming interno `block`, sistema de actualización zero-downtime (app + plugins). |
| **R4 — Consolidación** | **v2.1.0** ✓ | WB-25→WB-34: cierre de deuda (F12/F4/F10/F17), visual page builder (GrapesJS + página de inicio configurable), i18n ES/EN/PT, documentos legales (ToS/Disclaimer/Privacy/Cookies), mobile Capacitor nativo + desktop, fix de login en Docker, política "todo nativo / sin componentes de pago", QA + docs + release. |
| **R5 — Operación** | **v2.2.0** ✓ | M4: WB-63→WB-77 — pulido admin/UX (categorías `/admin`, fix CSS templates, buscador, actualizaciones unificadas, limpieza de plugins), plugin fiscal `arca` (ARCA/AFIP), comprobantes/facturas por pago (template editable + impresión térmica ESC/POS + "Mis comprobantes"), checkout unificado + pago en sucursal (suscripción→pago, POS). |
| **R6 — Marketplace** | **v2.3.0** ✓ | M5: WB-90→WB-103 — plugins con fuente remota GitHub + botón "Instalar" (badge de origen), nginx allowlist + multi-sucursal por subdominio, roles/permisos completos + patrón "crear", app de claves de licencia para venta + E2E local, finalización de plugins, ADRs (0016/0017/0018) + i18n + docs + QA + release. |
| **R7 — Licencias** | **v2.4.0** ✓ | M6: WB-104→WB-113 — feature-gating por licencia en UI (catálogo de features core+premium ya expuesto por `/api/v1/license`, mapeo feature→menú/plugin/datos, filtro server-side de menú/catálogo/instalación, `LicenseProvider`+`hasFeature` en frontend, upsell, i18n + docs + QA + release). |
| **R8 — Acceso rápido** | **v2.5.0** ✓ | M7: WB-114→WB-122 — generador de APIs de acceso rápido (recurso → modelo + rutas CRUD con validación/sanitización + permisos RBAC + scoping multi-tenant, SDK/API client tipado TS web/móvil, UI "Acceso rápido" con copiar/descargar, ADR-0020 + spec + i18n + docs + QA + release). |
| **R9 — Soporte** | **v2.6.0** ✓ | M8: WB-123→WB-134 — rediseño de `/admin/menu` (items reales core+plugins sin duplicados), sistema de tickets/soporte en `/admin/support` con estados pendiente/en curso/terminado, chat de usuarios en tiempo real (WS/SSE) + ventana flotante y retirada de `/admin/chat`, ADR-0021/0022 + spec + i18n + docs + QA + release. |
| **R10 — Inventario** | **v2.7.0** | M9: WB-35→WB-44 — inventario completo (variantes/SKU/EAN-UPC, catálogo, multi-almacén por sucursal, movimientos con ledger auditable, alertas de stock bajo, valoración costo promedio/FIFO, reportes + export/import CSV, código de barras/QR + impresión térmica). |
| **R11 — Red social** | **v2.8.0** | M10: WB-45→WB-53 — compositor de publicación enriquecido (galería multi-media, menciones, hashtags, encuestas, visibilidad, emoji, contador de caracteres, vista previa de enlaces, autoguardado de borrador). |
| **R12 — Escalabilidad** | **v2.9.0** | M11: WB-54→WB-62 — escalabilidad Kubernetes selectable (HPA configurable vs VPA Auto/Recommender/Initial, guarda de exclusión, visibilidad de estado, export YAML) desde `/admin/scaling`. |
| **R13 — Actualizaciones** | **v2.10.0** | M12: vista RAW/Code de los datos de actualización en `/admin/updates` (endpoint datos crudos manifest + changelog + archivos + checksums + firma en JSON/YAML, toggle Code/RAW con syntax highlight autohospedado + copiar/descargar, redacción de secretos, permiso `update.manage`). |
| **R14 — IoT** | **v2.11.0** | M13: WB-78→WB-89 — serie temporal local (base separada `webs_iot` + modelo genérico de mediciones, retención/downsampling, consultas con agregación) + plugins `invernadero` (IP/URL + Bearer, control de actuadores) y `sema` (IP/URL + X-API-Key), UI de conexión mínima con test + dashboards con gráficos, multi-tenant + seguridad (token cifrado, SSRF-safe), i18n + docs + QA + release. |
| **R15 — Experiencia pública** | **v2.12.0** | M14: WB-135→WB-144 — página de inicio (/) editable (hero/CTA como secciones + mejora de estilo), editor de bloques (GrapesJS) más intuitivo (paleta/preview/acciones/edición inline), header público configurable (menú `main` + dropdown `user`), selector de idioma en la cuenta del usuario (`/account`), ADR-0029 + i18n + docs + QA + release. |
| **R16 — Videoteca** | **v2.13.0** | M15: WB-145→WB-153 — plugin `videoteca` para series y películas (catálogo + temporadas/episodios), embed de video multi-plataforma vía oEmbed + video propio, botón ver/descargar con enlaces oficiales (nunca rip), metadatos TMDB (clave por tenant) + Wikipedia/Wikidata + IDs externos (links salientes, sin scraping), ADR-0030 + i18n + docs + QA + release. |
| **R17 — Backlog** | **v2.14.0+** | Backlog continuo: hardening del anti-reverse-engineering, auto-scaling fino por métricas custom (KEDA), más proveedores OAuth2, más idiomas (FR/DE/IT), empaquetado de stores (iOS/Android). |

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
| t66-deuda-f12-schemas | WB-25 (F12 residual: schema.mysql/sqlite) |
| t67-backlog-m4 | WB-63→WB-77 (este documento) |
| t68-adr-m4 | WB-63, WB-68, WB-69, WB-72→WB-74 (ADR-0013/0014/0015 + spec) |
| t69-legal-fiscal | WB-68, WB-69 (compliance AFIP/ARCA + términos) |
| t70-admin-ux | WB-63→WB-67 |
| t71-arca | WB-68 |
| t72-invoices | WB-69, WB-70, WB-71 |
| t73-pagos | WB-72, WB-73, WB-74 (backend) |
| t74-comprobantes-front | WB-70, WB-71 |
| t75-checkout-front | WB-72, WB-73, WB-74 |
| t76-i18n-m4 | WB-75 |
| t77-docs-m4 | WB-76 (docs) |
| t78-qa-m4 | WB-76 (QA) |
| t79-release-m4 | WB-77 |
| t80-backlog-m5 | WB-90→WB-103 (este documento) |
| t81-adr-m5 | WB-99 (ADR-0016/0017/0018 + spec) |
| t82-plugin-source | WB-90 (backend) |
| t83-marketplace-ui | WB-91 |
| t84-nginx | WB-92, WB-93 (proxy) |
| t85-multisite-routing | WB-93 (resolución por hostname) |
| t86-permisos | WB-94 |
| t87-roles-ux | WB-95 |
| t88-claves-venta | WB-96 (backend) |
| t89-claves-ui | WB-97 |
| t90-finalizar-plugins | WB-98 |
| t91-i18n-m5 | WB-100 |
| t92-docs-m5 | WB-101 |
| t93-qa-m5 | WB-102 |
| t94-release-m5 | WB-103 |
| t95-backlog-m6 | WB-104→WB-113 (este documento) |
| t96-adr-m6 | WB-104 (ADR-0019 + spec) |
| t97-feature-gating-back | WB-105, WB-106, WB-107 |
| t98-feature-gating-front | WB-108, WB-109 |
| t99-i18n-m6 | WB-110 |
| t100-docs-m6 | WB-111 |
| t101-qa-m6 | WB-112 |
| t102-release-m6 | WB-113 |
| t103-backlog-m7 | WB-114→WB-122 (este documento) |
| t104-adr-m7 | WB-114 (ADR-0020 + spec generador + SDK) |
| t105-generador-back | WB-115, WB-116 (motor CRUD + validación + permisos + scoping) |
| t106-sdk | WB-117 (SDK/API client tipado TS web/móvil) |
| t107-generador-front | WB-118 (UI "Acceso rápido") |
| t108-i18n-m7 | WB-119 |
| t109-docs-m7 | WB-120 |
| t110-qa-m7 | WB-121 |
| t111-release-m7 | WB-122 |
| t113-backlog-m8 | WB-123→WB-134 (este documento) |
| t114-adr-m8 | WB-123 (ADR-0021 tickets + ADR-0022 chat + spec menú) |
| t115-menu-fix | WB-124 (GET /menu admin core+plugins) |
| t116-tickets-back | WB-126, WB-127 (modelo Ticket + CRUD + estados + scoping + permisos) |
| t117-chat-back | WB-129, WB-130 (real-time WS/SSE + retirar /admin/chat) |
| t118-menu-front | WB-125 (rediseño /admin/menu) |
| t119-support-front | WB-128 (frontend /admin/support) |
| t120-chat-front | WB-130 (ventana flotante + quitar /admin/chat) |
| t121-i18n-m8 | WB-131 |
| t122-docs-m8 | WB-132 |
| t123-qa-m8 | WB-133 |
| t124-release-m8 | WB-134 |
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
| t167-backlog-m13 | WB-78→WB-89 (este documento) |
| t168-adr-iot | WB-78, WB-87 (ADR-0027 serie temporal + ADR-0028 patrón plugins IoT + spec) |
| t169-iot-db | WB-78, WB-79 (provisionar `webs_iot` + job retención/downsampling) |
| t170-pkg-iot | WB-78, WB-79, WB-80, WB-87 (`@webs/iot`: IoTStore + DeviceClient + `IotDevice`) |
| t171-invernadero | WB-81 (integración REST + control de actuadores) |
| t172-sema | WB-83 (integración REST) |
| t173-ui-iot | WB-85, WB-86 (componentes compartidos: conexión, estado, gráfico) |
| t174-ui-invernadero | WB-82, WB-86 (dashboard + control) |
| t175-ui-sema | WB-84, WB-86 (dashboard) |
| t176-i18n-m13 | WB-88 (i18n es/en/pt) |
| t177-docs-m13 | WB-88 (documentación) |
| t178-qa-m13 | WB-89 (QA) |
| t179-release-m13 | WB-89 (release v2.11.0) |
| t196-backlog-m14 | WB-135→WB-144 (este documento) |
| t197-adr-m14 | WB-135 (ADR-0029 + spec experiencia pública) |
| t198-header-back | WB-138 (menú público `main` + dropdown `user` configurables, backend) |
| t199-home | WB-136 (home editable: hero/CTA + estilo) |
| t200-editor | WB-137 (editor GrapesJS más intuitivo) |
| t201-header-front | WB-139 (render menú + dropdown desde `/public/menu`) |
| t202-i18n-m14 | WB-141 |
| t203-docs-m14 | WB-140 (selector idioma `/account`), WB-142 (docs) |
| t204-qa-m14 | WB-143 |
| t205-release-m14 | WB-144 |
| t207-backlog-m15 | WB-145→WB-153 (este documento) |
| t208-adr-m15 | WB-145 (ADR-0030 + spec videoteca) |
| t209-videoteca-modelo | WB-146 (modelo de datos + CRUD + multi-tenant) |
| t210-embed | WB-147 (oEmbed multi-plataforma + video propio) |
| t211-metadatos | WB-149 (TMDB), WB-150 (Wikipedia/Wikidata + IDs externos) |
| t212-videoteca-front | WB-151 (catálogo + páginas de detalle) |
| t213-ver-descargar | WB-148 (botón ver/descargar enlaces oficiales) |
| t214-i18n-m15 | WB-152 (i18n) |
| t215-docs-m15 | WB-152 (docs) |
| t216-qa-m15 | WB-153 (QA) |
| t217-release-m15 | WB-153 (release v2.13.0) |
