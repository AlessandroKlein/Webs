# Registro de cambios

Las versiones siguen [SemVer](https://semver.org/lang/es/). Formato basado en
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [2.1.0] - 2026-10-23

### Añadido

- **Builder visual (GrapesJS)**: editor drag-and-drop autoalojado en `/admin/editor`
  con modelo `Page.layout` (`PageSection[]` / `PageItem` = `pluginId` u objeto),
  `POST /api/v1/pages/save` (upsert por `slug` + `sanitizeLayout`), render de bloques
  guardados y home única vía `Page.isHome`. Ref ADR-0011.
- **Páginas legales configurables**: 4 documentos (Términos del Servicio, Aviso
  Legal, Política de Privacidad, Política de Cookies) como templates markdown
  editables desde **Ajustes → Legal**, publicados en `/legal/:slug` y
  `GET /api/v1/public/legal/:slug`, con render seguro de markdown y enlaces nativos
  en el footer.
- **i18n completo (ES/EN/PT)**: ~700 claves nuevas y switcher de idioma persistido;
  cobertura en menú, login, plugins, builder, dashboards de usuario/trabajadores,
  páginas legales y de error. Ref ADR-0012.
- **App móvil Capacitor (Android/iOS)**: host nativo en `apps/mobile` que envuelve
  `apps/web` + splash screen (`@capacitor/splash-screen`); convive con la PWA de
  asistencia por QR.
- **Docs M3**: `page-builder.md`, `i18n.md` actualizado, legal (personalización
  desde UI), inventario y política de dependencias.

### Corregido

- **Login en Docker**: entrypoint llave-en-mano (migraciones `prisma migrate deploy`
  + `prisma db seed` + estado de instalación) y variables `DATABASE_URL`,
  `JWT_REFRESH_SECRET` y `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` en Compose. Ahora
  `docker compose up --build` deja una instancia lista con el superadmin
  `admin@webs.test` / `Admin12345!`.
- **F12 — rename residual**: `blockId` → `pluginId` en API y frontend (53
  ocurrencias), prosa «bloque(s)» → «plugin(s)» (30 ocurrencias en 13 archivos) y
  comentarios obsoletos `BlockPlacement`/`BlockInstallation` → `Plugin*`.
- **F10 — versión hardcodeada**: Swagger (`apps/api/src/plugins/swagger.ts`) ahora
  usa `SYSTEM_VERSION` (antes `0.1.0`); `GET /api/v1/setup/status` devuelve la
  versión real.
- **F4 — permisos en docs**: `block.read`/`block.manage` → `plugin.read`/
  `plugin.manage` (los alias deprecados `BlockRead`/`BlockManage` se conservan).
- **App de escritorio**: `apps/desktop` resuelve la versión dinámicamente desde
  `SYSTEM_VERSION` (antes hardcodeada `1.0.0`).
- **Multi-tenant organizaciones**: `resolveOrgScope()` en `plugins/organizaciones`
  corrige el 500 «Unknown argument `organizationId`» en `GET /organizations` para
  super_admin (sin org), admin de cadena y sucursal/usuario.

## [2.0.0] - 2026-10-23

### Añadido

- **Licencias (Licensify)**: sistema de licencias local anti-reverse-engineering con
  node-locking (fingerprint del equipo), claves de activación y validación offline;
  permisos `license.read`/`license.manage` y estado de licencia en el admin.
- **Multi-tenant por cadenas**: modelo `Organization` con `type`
  (`standalone`/`chain`/`branch`), jerarquía `parentId`/`chainId` y aislamiento por
  organización en 24 modelos de negocio; plugin `tenant` (ADR-0006).
- **Escalabilidad Kubernetes**: manifests en `deploy/k8s/` (namespace, ConfigMap,
  Secret, PVC, Deployments de API y web, Services, Ingress, HPA, PDB y job de
  migración) para despliegue stateless con auto-scaling (ADR-0008).
- **Actualizador zero-downtime**: `POST /system/update/{check,apply,status,rollback}`
  con verificación `sha256` + firma Ed25519, bootloader (bare/Docker) y health-check
  post-aplicación (ADR-0010).
- **Host móvil Capacitor**: `apps/mobile` es ahora también host de Capacitor
  (Android/iOS) que envuelve `apps/web`, conviviendo con la PWA de asistencia por QR.
- **Baseline de migraciones Prisma**: `0001_init` regenerado con el esquema completo
  (57 modelos) y backfill idempotente de la organización raíz.

### Corregido

- **Rate-limit global en memoria → Redis**: el limitador global (`300` req/`60s`) ahora
  usa Redis (`rl:global:*`) y es cluster-wide en multi-instancia; sin regresión en
  `login`/`register`/`forgot`/`reset` (cada uno conserva su `keyPrefix`).
- **Docs de permisos**: `block.read`/`block.manage` → `plugin.read`/`plugin.manage`
  (los alias deprecados `BlockRead`/`BlockManage` se conservan por retrocompatibilidad).
- **Setup**: `GET /api/v1/setup/status` devuelve la versión real (`SYSTEM_VERSION`)
  en lugar de `0.2.0`.

### Deuda técnica (documentada, no bloqueante)

- **F12 — rename residual**: `blockId`, shim `/api/v1/blocks/*` y la prosa «bloque»
  residual (~137 referencias en `apps/web`) quedan para una limpieza posterior con
  migración de BD.
- **F17 — wrapper Capacitor real**: la compilación nativa Android/iOS (Gradle/Xcode)
  y los plugins nativos de Capacitor quedan como seguimiento.

## [1.58.0] - 2026-10-22

### Cambiado

- **Rename integral «Bloques» → «Plugins»** (breaking change con shim de transición):
  manifiesto `plugin.json` (ex `block.json`, `type: "plugin"`), SDK
  `definePlugin`/`defineClientPlugin` (con alias deprecados `defineBlock`/
  `defineClientBlock`), rutas `/api/v1/plugins/*` (ex `/api/v1/blocks/*`), permisos
  `plugin.read`/`plugin.manage`, modelos Prisma `PluginInstallation`/
  `PluginPlacement`, componentes `<PluginSlot>`/`<PluginConfigPage>`/
  `<PluginSettingsPage>` e i18n `nav.plugins`. La shim `/api/v1/blocks/*` cubre
  también las sub-rutas custom de cada plugin (no solo el CRUD).

### Añadido

- **Menú nativo de plugins**: cada plugin instalado se registra como un ítem
  nativo del menú principal (admin y público) vía `GET /menu` / `GET /public/menu`,
  sin categoría «Plugins» separada; `AdminLayout` consume el menú dirigido por API
  y filtra por permisos.
- **Personalización de páginas**: constructor con elementos de contenido propios
  (heading, text, image, divider, spacer, html) que conviven con plugins en el
  layout; drag&drop, editor inline, cambio de sección/tamaño y preview.
- **Templates de instalación rápida**: nuevos `logistica` y `supermercado`;
  ampliados `gym`, `tienda` y `market` con páginas; `applyTemplate` crea/actualiza
  las páginas definidas por la plantilla en un clic.
- **ADRs de Milestone 1**: rename (0005), multi-tenant (0006), licencias (0007),
  escalabilidad (0008) y UI styling (0009).

### Corregido

- **CI (typecheck)**: los paquetes compartidos (`@webs/core`, `@webs/i18n`,
  `@webs/plugin-sdk`, `@webs/ui`, `@webs/block-example`) se compilan antes del
  typecheck para resolver los `dist/*.d.ts` ignorados por git.
- **Release**: el workflow hace `checkout` (fetch-depth 0) y define `GH_REPO`;
  la release se crea con las notas extraídas del `CHANGELOG.md`.
- **Docker**: `templates/` se copia a ambos contenedores; `GET /api/v1/setup/templates`
  devuelve las plantillas en Docker (antes `[]`).
- **Inventario ↔ tienda (B1)**: `shareInventory` sincroniza `Product.stock` con la
  suma de los `InventoryItem` vinculados; sin efectos cruzados cuando está deshabilitado.
- **Social-login (B2)**: `/providers` lee la configuración vigente (BD) y filtra
  `enabled:false`; con todos los proveedores deshabilitados no se renderiza ningún botón.
- **Lint**: errores de `plugin-sdk` y varios `unused` en `apps/web`/`apps/api`
  resueltos; config de ESLint para los bloques que publican `lint`.

## [1.57.0] - 2026-10-20

### Añadido

- **Rutinas**: plantillas, búsqueda, edición, multi-día y notas.
- **Código de barras** en POS/inventario/tienda y toggle «unificar inventario».

## [1.56.0] - 2026-10-20

### Añadido

- **Rutinas**: autocompletado de miembro y asignación de una rutina a múltiples
  personas (plantilla/copia).

## [1.55.0] - 2026-10-20

### Añadido

- **super_admin** con todos los permisos dinámicos; roles nuevos (entrenador,
  contador, cajero, soporte, recepcionista); auditoría de `block.json`
  (permissions + help icons).

## [1.54.0] - 2026-10-20

### Añadido

- **Proveedores de envío como bloques** (andreani, oca, correo, mercadolibre) +
  registro central de shipping.

## [1.53.0] - 2026-10-20

### Añadido

- **Carrito persistente** + redirección al login; área personal `/staff` por rol;
  reservas/clases con cupos y recurrencia; calendario con vencimiento; rutinas de
  entrenador; comprobantes; datos médicos; toggle webhook + help icons.

## [1.52.0] - 2026-10-20

### Añadido

- **Unificación de suscripciones/membresías**; multi-sucursal (analíticas +
  inventario); pagos accesibles; envíos con dirección + cotización (Correo/OCA/
  Mercado Envío).

## [1.51.0] - 2026-10-19

### Añadido

- **Editor visual del index** (drag&drop + preview); inscripción pública a cursos;
  pulido general.

## [1.50.0] - 2026-10-19

### Añadido

- **Soporte** (tickets + widget); rutina de usuario; POS/cobro; asistencia externa;
  editor de menú; cancelación de compra; actualizaciones + backups; proveedores de
  chat-ia; se quitó la autenticación de `block-settings`.

## [1.49.0] - 2026-10-19

### Añadido

- **Tiempo real vía WebSocket**: notificaciones y chat sin recargar.

## [1.48.0] - 2026-10-19

### Añadido

- **Suscripciones** (planes/contratar/cancelar); checkout con métodos de pago;
  carrito pulido; facturación PDF por HTML; calendario mensual; preferencias de
  notificación.

## [1.47.0] - 2026-10-19

### Añadido

- **Red social completa** (historias/feed/direct/follow); blog con paginación +
  «leer más»; home desarrollada.

## [1.46.0] - 2026-10-19

### Añadido

- **Configuración de bloques agrupada por categoría** + ayuda (?) en los campos de
  APIs de terceros.

## [1.45.0] - 2026-10-19

### Añadido

- Dashboard de usuario; social público; chat DM; registro completo + social login;
  pagos auto-cancel + eliminar; notificaciones con iconos; form builder visual;
  stock por talle + inventario.

### Corregido

- i18n.

## [1.44.0] - 2026-10-19

### Añadido

- **Red social** (feed con media + follow); chat DM; tienda completa (imágenes/
  talles/carrito); blog público; clases; dashboard de usuario; perfil ampliado
  (avatar upload + datos + campos personalizados).

## [1.43.0] - 2026-10-19

### Añadido

- Header/footer en account/store; campaña de notificación; página `/clases`;
  registro en el login; dashboard de usuario; traducciones de claves fijas;
  sidebar de bloques instalados; dashboard admin; auth editable; permisos enterprise.

## [1.42.0] - 2026-10-19

### Añadido

- **i18n completa** (es/en/pt); integraciones de terceros (envíos/IA/analytics/
  calendario/fiscal); app móvil PWA + companion de escritorio.

## [1.41.0] - 2026-10-19

### Añadido

- **Diseño de la página de inicio** (header con menú + icono de usuario + hero por
  defecto).

## [1.40.0] - 2026-10-19

### Añadido

- **Fase 2 gym**: rutinas de entrenador/cliente (modelo `Routine` + rutas de
  academia + UI).

## [1.39.0] - 2026-10-19

### Añadido

- **Notificaciones con prioridad/caducidad** + marcar leídas en campaña + estilo de
  `/account`.

## [1.38.0] - 2026-10-19

### Añadido

- **Panel admin para los bloques** (blog, social, chat, calendario, formularios,
  comercio, facturación, analítica, notificaciones, registro/login).

## [1.37.1] - 2026-10-19

### Corregido

- **Seguridad**: autenticación en mutaciones de notificaciones/afiliados/chat-ia.

## [1.37.0] - 2026-10-19

### Añadido

- **Desarrollo de 20 bloques** (blog, social, chat, academia, calendario, reservas,
  formularios, documentos, ecommerce envíos, marketing, facturación, analytics,
  search, social-login, register, notificaciones, chat-ia, afiliados, seo) +
  modelos `Invoice`/`Shipment`/`Coupon` + investigación de APIs.

## [1.36.0] - 2026-10-19

### Añadido

- **Fase 1 gym multi-tenant** (organizaciones/membresías/asistencia QR/inventario).

## [1.35.0] - 2026-10-19

### Añadido

- **Pulido del admin**: navegación por categorías, side-nav users/email/account,
  traducciones por idioma, editor Tiptap, páginas de error, cambio de contraseña.
- **Plantillas** gym (multi-tenant) y tienda (ecommerce) con bloques reales.

### Corregido

- Roles admin/editor/user ya no son «system» (permiten editar/eliminar).

## [1.34.1] - 2026-10-19

### Corregido

- Footer: el texto de copyright respeta el idioma seleccionado (es/en/pt).

## [1.34.0] - 2026-10-19

### Añadido

- **Footer**: copyright (© año[s] Nombre del Sitio) con modo año en curso/rango,
  datos de contacto, enlaces legales y redes sociales (solo los completos). El
  `<title>` de la pestaña refleja el nombre del sitio. Sección `footer` en ajustes
  + endpoint público `GET /public/footer`.
- **Contenido**: vista separada (lista / editor) con barra lateral, botón "Ver"
  (preview) en Acciones y edición corregida.

## [1.33.0] - 2026-10-19

### Añadido

- **Páginas**: barra lateral (Editor / Páginas existentes) en el mismo estilo de
  `/admin/settings`.

## [1.32.0] - 2026-10-19

### Añadido

- **Bloques**: barra lateral (estilo settings) con Instalados / Catálogo /
  Importar JSON, y **categorías como submenús** navegables (filtran el catálogo).

## [1.31.0] - 2026-10-19

### Añadido

- **Contenido**: CRUD completo (`/api/v1/content` con paginación/filtros y
  estados draft/published/scheduled) + página con editor WYSIWYG.
- **Blog**: editar/eliminar posts + listar categorías.
- **Ecommerce**: CRUD de productos persistidos (`/products`, `/products/persisted`).

## [1.30.0] - 2026-10-19

### Añadido

- **Modales**: `PromptDialog` (entrada de texto) y `ConfirmDialog` para eliminar
  traducción; reemplazados `window.prompt`/`window.alert` en Test SMTP e import
  JSON (ahora con mensaje inline).

## [1.29.0] - 2026-10-19

### Añadido

- **Plantillas**: preview en `/admin/templates` (bloques, menú, nombre del sitio y
  color primario de cada preset).

## [1.28.0] - 2026-10-19

### Corregido

- **Dashboard**: "Sesiones activas" ahora cuenta solo sesiones vigentes (no
  revocadas ni expiradas), y se agregaron métricas de pagos, roles y páginas.

## [1.27.0] - 2026-10-19

### Añadido

- **Modales de confirmación** para eliminar usuarios y roles (reemplazan
  `window.confirm`; con estilo del design system).

## [1.26.0] - 2026-10-19

### Añadido

- **Usuarios**: sección "Invitar usuario" para generar links de registro de un
  solo uso (con rol asignado) y mostrarlos para copiar.

## [1.25.0] - 2026-10-19

### Añadido

- **Páginas**: editar páginas existentes con el editor visual (cargar en el
  editor, modificar secciones/bloques/tamaño, "Guardar" con feedback y
  "Cancelar"). Botón "Editar" en el listado.

## [1.24.0] - 2026-10-19

### Añadido

- **Email**: plantillas precreadas (verificación de correo, restablecer
  contraseña y bienvenida) que se siembran automáticamente al arrancar.

## [1.23.0] - 2026-10-19

### Añadido

- **Traducciones**: endpoint `GET /translations/keys` + panel "Claves base" con
  todas las claves de la plataforma y su valor en cada idioma (es/en/pt); el
  catálogo de locales ahora devuelve el listado completo.

## [1.22.0] - 2026-10-19

### Añadido

- **Email**: endpoint `GET /email/variables` + panel "Variables disponibles"
  (user.name, user.email, site.name, link, date, year, etc.) en la UI.

## [1.21.0] - 2026-10-19

### Añadido

- **Catálogo agrupado por categoría** (negocio, contenido, seo, marketing,
  comunicación, auth, etc.).
- **Modal de confirmación** (componente `ConfirmDialog`) con estilos del design
  system; reemplaza `window.confirm` en "Eliminar cuenta".

## [1.20.0] - 2026-10-19

### Añadido

- **Notificaciones globales**: campana en el admin con contador de no leídas y
  bandeja (`GET/POST/PATCH /api/v1/notifications/inbox`).

## [1.19.0] - 2026-10-19

### Añadido

- **Configuración ampliada de 15 bloques** (settings + categorías): ecommerce
  (envíos), facturación (ARCA), marketing, chat (comunidades), chat-ia (modelos/
  proveedores), calendario, reservas, social-login (OAuth), blog, academia,
  social, seo, analytics (3ros), afiliados, register.
- **Categorías de bloques**: campo `category` en el SDK + expuesto en el catálogo.

### Corregido

- Roles: endpoint de permisos correcto (`/api/v1/permissions`).

## [1.18.0] - 2026-10-19

### Añadido

- **Roles**: CRUD completo en UI (crear/editar/eliminar + permisos; roles de
  sistema no editables).
- **Usuarios**: edición (nombre, username, activo, locale, roles) y eliminación.
- **Traducciones**: módulo completo (CRUD backend + UI con filtros).
- **Admin**: sub-menú por pestañas en bloques (Instalados/Catálogo/Importar),
  cuenta movida a `/account` (para todo usuario), botón "Ver sitio" y **bloques
  instalados en el sidebar**.

### Corregido

- Usuarios: el listado ahora devuelve `username`.

## [1.17.0] - 2026-10-19

### Corregido

- **Bloque "Tienda" roto**: se quitó la entrada placeholder del marketplace
  (`store` → repo inexistente). La tienda real es el bloque local `ecommerce`.

### Añadido

- **Settings**: aviso "Guardado ✓" al guardar y **botón "Test SMTP"** para
  verificar la configuración de correo.

## [1.16.0] - 2026-10-19

### Corregido

- **Sesión persistente**: el refresh/otros POST sin body ya no envían
  `Content-Type: application/json` (Fastify lo rechazaba con 400), así que el
  "recordarme" ahora sí mantiene la sesión al recargar.
- **Catálogo**: se invalida la caché al instalar/desinstalar/actualizar bloques
  (antes los instalados seguían apareciendo como disponibles).

### Añadido

- **Configuración de bloque**: ficha con estado (habilitar/deshabilitar),
  información (autor, licencia, slots, permisos, eventos, entry) y ajustes.
- **Settings**: navegación lateral por secciones (una a la vez).

## [1.15.2] - 2026-10-19

### Corregido

- Login en el frontend envía `identifier` (antes seguía enviando `email`, lo que
  rompía el login con el esquema nuevo).

## [1.15.1] - 2026-10-19

### Corregido

- Admin creado en la instalación ahora incluye `username` (login por username
  funciona de arranque). `SYSTEM_VERSION` actualizada a `1.15.0`.

## [1.15.0] - 2026-10-19

### Añadido

- **Editor visual de páginas**: agregar/eliminar secciones, elegir bloque por
  menú y tamaño (completo/mitad/tercio) con botones (reemplaza el JSON).
- **"Mi cuenta" en pestañas**: Perfil / Seguridad / Zona de peligro.
- **Subida de imágenes para logos**: widget `image` en branding (subir → URL)
  vía `POST /media/upload`.

## [1.14.0] - 2026-10-19

### Añadido

- **Estilos de checkboxes/radios** (accent-color con el token primario + tamaño).

## [1.13.0] - 2026-10-19

### Añadido

- **Constructor de páginas**: modelo `Page` + CRUD (`/api/v1/pages`) + lectura
  pública (`/api/v1/public/page/:slug`). La **página de inicio** se compone de
  secciones con bloques y tamaño (full/half/third) o redirige a una URL externa.
  Panel "Páginas" en el admin y render de la home pública según el layout.

## [1.12.0] - 2026-10-19

### Añadido

- **Settings en subcategorías**: se dividió la sección "Sitio" en `site`
  (identidad), `branding` (logos), `localization` (idioma/zona horaria) y
  `maintenance` (modo mantenimiento), cada una con su propio guardado.

## [1.11.0] - 2026-10-19

### Añadido

- **Invitaciones de un solo uso**: `POST /api/v1/users/invite` (admin) genera un
  link de registro por correo con expiración y rol asignado. El registro público
  ahora queda **pendiente de aprobación** salvo que se use una invitación válida
  (en ese caso queda activo y con el rol de la invitación).

## [1.10.0] - 2026-10-19

### Añadido

- **Bloques**: botón Activar/Desactivar con etiqueta clara (antes mostraba el
  estado equivocado) e **importación de bloques desde JSON** (lista de bloques
  para instalar desde el panel).

## [1.9.0] - 2026-10-19

### Añadido

- **Mi cuenta**: edición de perfil (`PATCH /auth/me`: nombre, username, locale,
  avatar), **eliminar cuenta** (`DELETE /auth/me` con cascade) y **2FA por SMS
  solo visible si el bloque `twilio` está instalado y habilitado**.

## [1.8.0] - 2026-10-19

### Añadido

- **Settings**: menú desplegable de **zonas horarias** (por país/región) en la
  sección del sitio, y **tamaños recomendados** en los campos de logos/icono.

## [1.7.0] - 2026-10-19

### Añadido

- **Usuarios**: buscador (`?q=` en `/api/v1/users` + campo en la UI) y campo
  `username` en el alta/edición de usuarios (único, con validación de duplicados).

## [1.6.0] - 2026-10-19

### Añadido

- **Página pública en la raíz** (`/`): landing con los slots de bloques y acceso a
  "Iniciar sesión"/"Panel". El panel de administración se movió a **`/admin/*`**
  (ya no se fuerza el login al entrar a la URL).

## [1.5.0] - 2026-10-19

### Añadido

- **Login por nombre de usuario o correo** (`identifier` en `/auth/login`; campo
  `username` en el modelo User y en el registro).
- **Menú de usuario** (avatar → perfil, preferencias, panel admin, cerrar sesión).
- **Sidebar colapsable** y **footer** en el panel.
- **API tokens** solo creables por administradores (permiso `apiToken.write`).

## [1.4.0] - 2026-10-19

### Añadido

- **Tests automatizados**: vitest + tests unitarios de `@webs/core` (`slugify`,
  `totalPages`, `normalizePagination`, `mask`).
- **7 bloques nuevos**: `organizaciones` (multi-tenancy), `formularios` (form
  builder), `documentos` (docs/firma), `workflows` (automatizaciones), `afiliados`
  (referidos), `register` (registro público) y `social-login` (Google/Facebook/
  GitHub/Microsoft). Modelos Prisma correspondientes.

### Corregido

- **Sesión "recordarme"**: la cookie de refresco ahora auto-detecta HTTPS por
  protocolo (`request.protocol`), por lo que persiste correctamente en HTTP local
  (antes usaba `NODE_ENV=production` y el navegador no la enviaba).

## [1.3.1] - 2026-10-19

### Corregido (validado en Docker)

- **Dockerfiles**: copiar `tsconfig.base.json`, `.npmrc` y `scripts/` al contexto
  de build (antes faltaba `tsconfig.base.json` → build fallaba); OpenSSL para
  Prisma en la API.
- **Logger**: Fastify 5 exige opciones de pino (no una instancia); corregido
  `createLogger` y quitado `disableRequestLogging` (deprecado).
- **Instalación**: `setup-finish.mjs` ahora resuelve `@prisma/client`/`bcryptjs`
  desde `apps/api` (pnpm no los eleva a la raíz).
- **BullMQ**: conexión propia con `maxRetriesPerRequest: null` (antes crasheaba
  al arrancar el worker).
- **Versión del sistema** actualizada a `1.3.1`.

## [1.3.0] - 2026-10-19

### Añadido

- **Selector de proveedores**: los bloques declaran `provides` (grupos como
  `payment`, `storage`, `notification`) y `requiresProviders`. Al instalar un
  bloque que necesita un grupo (ej. `ecommerce` → `payment`), la app muestra un
  **selector** para que el usuario elija qué método(s) instalar, en vez de fijar
  uno solo. `GET /blocks/providers/:group` + `providers` en `POST /blocks/install`.

## [1.2.0] - 2026-10-18

### Añadido

- **Instalación automática de dependencias de bloques**: campo `blockDependencies`
  en `block.json`; `POST /blocks/install` instala recursivamente las dependencias
  (`autoDependencies: true` por defecto) o devuelve las faltantes
  (`autoDependencies: false`) para mostrar un diálogo.

## [1.1.0] - 2026-10-18

### Añadido

- **Bloques**: `notificaciones` (en-app), `chat` (tiempo real vía WebSocket),
  `chat-ia` (endpoint configurable), `calendario` y `social` (mini red social).
- Tablas Prisma: `notifications`, `chat_messages`, `calendar_events`, `social_posts`.
- Guía de módulos y dependencias.

## [1.0.0] - 2026-10-18

### Primer lanzamiento estable

- **Datos persistentes**: los bloques de negocio (ecommerce, reservas, blog, LMS,
  comentarios, soporte) guardan sus datos en tablas Prisma (`products`, `orders`,
  `bookings`, `blog_posts`, `courses`, `enrollments`, `comments`, `tickets`) en
  lugar de memoria.
- **Sistema de versiones**:
  - `GET /system/version` (versión actual + última de GitHub Releases).
  - Versión explícita por bloque instalado + detección de actualizaciones
    (`hasUpdate` en el catálogo).
  - `POST /blocks/:id/update` (actualiza un bloque preservando su configuración).
  - Botón "Actualizar" en el marketplace (UI).
- **Marketplace**: `blocks/catalog.json` documenta versión explícita y verificación.
- **Versionado**: SemVer estricto a partir de `v1.0.0`.

## [0.40.0] - 2026-10-18

### Añadido

- **Bloques de negocio**: `ecommerce` (productos, pedidos con estados, envíos y
  dashboard de ventas), `reservas` (servicios, agenda y reservas con estados),
  `blog` (posts con estados, categorías/etiquetas) y `academia` (cursos, lecciones,
  matriculación y progreso).

## [0.39.0] - 2026-10-18

### Añadido

- **Módulos opcionales (bloques)**: SEO (sitemap.xml/robots.txt/meta), Analítica
  (visitas/métricas), Marketing (cupones), Comentarios/valoraciones, Búsqueda
  (fuzzy con Levenshtein) y Soporte/chat.

## [0.38.0] - 2026-10-18

### Añadido

- **Núcleo**: modo mantenimiento (`site.maintenanceMode` + hook 503), zona horaria
  (`site.timezone`), y **respaldos de BD** (`POST /system/backup` + script).
- Controlador de errores ya devuelve `requestId` único (verificado).

## [0.37.0] - 2026-10-18

### Añadido

- **Desafíos WebAuthn en Redis** (compartidos en clúster, fallback a memoria).
- **Plantilla `cursos`** y bloques **`carrito`** (catálogo + carrito + checkout),
  **`facturacion`** (facturas de referencia) y **`push`** (permiso de notificaciones).

## [0.36.0] - 2026-10-18

### Añadido

- **TailwindCSS v4 como base** (descargado/bundled) mapeado a los tokens `--ws-*`:
  utilidades (`bg-primary`, `text-muted`, `rounded-lg`, `shadow-md`, responsive
  `md:`/`lg:`, …) disponibles y con soporte de tema claro/oscuro. Se mantienen los
  componentes propios y Bootstrap Icons encima.

## [0.35.0] - 2026-10-18

### Añadido

- **Cookies de preferencias**: tema (`webs-theme`) e idioma (`webs-locale`) ahora
  persisten en cookies (SameSite=Lax + Secure) en lugar de localStorage, con
  aplicación del tema **antes de pintar** (sin "flash").
- **Documentación** de la arquitectura de cookies y sesión (sliding/inactividad).

## [0.34.0] - 2026-10-18

### Añadido

- **Releases automáticas**: GitHub Action que crea la release con notas generadas
  al pushear un tag `v*` (idempotente).
- **Plantillas**: `blog` y `corporativo`.
- **Bloque `mapa`** (contacto) con Bootstrap Icons.

## [0.33.0] - 2026-10-18

### Añadido

- **QR visual en 2FA**: código QR renderizado (librería `qrcode`) en "Mi cuenta" y
  en el flujo de activación forzada.
- **Gestión de dispositivos FIDO2**: renombrar passkeys (`PATCH /auth/passkeys/:id`).

## [0.32.0] - 2026-10-18

### Añadido

- **Bootstrap Icons** (descargado/bundled, sin CDN) + **utilidades responsive**
  (grillas `.grid-3`, colapso de grillas/sidebar en móvil) sobre los tokens `--ws-*`.
  Base mezclada de Bootstrap/Tailwind para una app profesional.

## [0.31.0] - 2026-10-18

### Añadido

- **Dashboard de costos en Pagos**: ganancias mensuales/anuales, gastos y
  beneficio con gráfico comparativo. Nueva tabla `Expense` + CRUD de gastos
  (`/expenses`, `/expenses/analytics`).

## [0.30.0] - 2026-10-18

### Añadido

- **Editor WYSIWYG (Quill)**: editor enriquecido real (negrita, cursiva, listas,
  títulos, enlaces) descargado/bundled, reemplaza el contentEditable básico en
  plantillas de correo.
- **Badges de autor de confianza** en el marketplace: campo `verified` en el índice
  y badge "✔ verificado" en la UI.

## [0.29.0] - 2026-10-18

### Añadido

- **Marketplace enriquecido**: el índice JSON acepta `icon`, `downloadUrl`
  (tarball directo), `author`, `homepage`, `license`, `publicKey`/`signature`; la
  UI muestra el icono y la instalación soporta descarga directa.
- **Plantilla en la instalación**: el asistente tiene un paso final para elegir
  una plantilla predefinida (aplicable y editable después, estilo WordPress).

## [0.28.0] - 2026-10-18

### Añadido

- **2FA por SMS (OTP)**: envío de código vía el proveedor de notificaciones
  (Twilio), verificación y activación/desactivación. Integrado en el login
  (`smsCode`) y en "Mi cuenta". Nueva tabla `OtpCode`.
- Fix: el confirm de 2FA TOTP ahora devuelve los códigos de respaldo.

## [0.27.0] - 2026-10-18

### Añadido

- **Firma Ed25519 de bloques**: campos `publicKey`/`signature` en el índice del
  marketplace; el loader verifica la firma del `block.json` antes de instalar.
- **Cola BullMQ genérica** (`lib/queue.ts`): `enqueueJob`/`startWorker` reutilizables
  para email, reportes e imágenes (refactor de la cola de correo).

## [0.26.0] - 2026-10-18

### Añadido

- **Notificaciones como plugin**: registro de proveedores
  (`fastify.notifications.register`) + `POST /notifications/send` y
  `GET /notifications/providers`. **Bloque Twilio** (SMS/WhatsApp) con secretos
  cifrados y `notification.sent` como evento.

## [0.25.0] - 2026-10-18

### Añadido

- **Módulo Media**: subida de imágenes con `@fastify/multipart`, procesamiento con
  `sharp` (rotar + redimensionar + WebP) y almacenamiento local. Endpoints
  `POST /media/upload`, `GET /media`, `GET /media/files/:key`, `DELETE /media/:id`.
- **Storage como plugin**: registro de drivers (`fastify.storage`) + **bloque
  `storage-s3`** (Amazon S3, Cloudflare R2, MinIO) con secretos cifrados.

## [0.24.0] - 2026-10-18

### Añadido

- **BullMQ** para la cola de correos (cola, reintentos con backoff exponencial y
  concurrencia) con Redis; fallback al barrido por la tabla sin Redis.

## [0.23.0] - 2026-10-18

### Añadido

- **Rate limit distribuido con Redis** (`rate-limiter-flexible`) en login/registro/
  recuperación (fallback a memoria si no hay Redis).
- **Caché Redis** (`lib/cache.ts`) aplicada a settings y catálogo de bloques, con
  invalidación al guardar.

## [0.22.0] - 2026-10-18

### Añadido

- **Panel de pagos (admin)**: resumen de transacciones, filtros por estado/proveedor,
  conciliación, **reembolsos** y "marcar pagado" (contra entrega).
- **Tienda demo** (`/store`): carrito y checkout que integra los bloques de
  pasarela (selección de proveedor → `POST /payments/checkout`).
- Backend: `GET /payments/summary`, `POST /payments/:id/refund`, filtros en
  `GET /payments`, campo `refundedAt`.

## [0.21.0] - 2026-10-18

### Añadido

- **Arquitectura de pagos** (núcleo en la base): tabla `Payment`, registro de
  proveedores, `POST /payments/checkout` (validación Zod anti-manipulación de
  precios), `POST /payments/webhook/:provider` (firma + idempotencia),
  `POST /payments/:id/mark-paid` (contra entrega) y listado/consulta.
- **Bloques de pasarela**: Mercado Pago (refactorizado), MODO, Payway/Decidir 2.0,
  Stripe, PayPal, EBANX y **contra entrega / POS** (mPOS/Point/Payway). Cada uno
  con su página de configuración y secretos cifrados (`x-ui.secret`).

## [0.20.0] - 2026-10-18

### Añadido

- **Bloque Mercado Pago de referencia** (`blocks/mercadopago`): secretos cifrados
  (`x-ui.secret`), endpoint público sin secretos, token único de pago, verificación
  de firma de webhook (HMAC-SHA256) y eventos de negocio. Slot `payment` agregado.

## [0.19.0] - 2026-10-18

### Añadido

- **Plantillas (templates)**: `templates/*.json` (gimnasio, mercado) que instalan y
  activan bloques, aplican settings y crean el menú (`GET /templates`,
  `POST /templates/:id/apply`). Página "Plantillas" en el admin.
- **Página de configuración por bloque**: ruta propia `/blocks/:id` en el admin.

## [0.18.0] - 2026-10-18

### Añadido

- **Instalación de bloques desde npm** (`npm pack` + extracción) además de git.
- **Firma/verificación de bloques**: campo `sha256` del `block.json` en el índice
  para verificar integridad al instalar.
- **`make docs` / `make docs-strict`** (script `scripts/build-docs.mjs`): sync + `mkdocs build`.
- **GitHub Action de Docs con `mkdocs build --strict`** (falla ante enlaces rotos).

## [0.17.0] - 2026-10-18

### Añadido

- **Auditoría avanzada**: filtros por acción/recurso/actor/rango de fechas y
  exportación CSV (`GET /audit/export`).
- **Serie temporal** de aperturas/clics por día en el reporte de campañas
  (nueva tabla `EmailClick`).
- **Exportar destinatarios en JSON/XLSX** (además de CSV).
- **Dashboard con métricas globales** (`GET /admin/metrics`).

## [0.16.0] - 2026-10-18

### Añadido

- **2FA obligatoria para admins**: setting `security.require2FAForAdmin`; si un
  rol super_admin/admin no tiene 2FA/passkey, el login exige activarlo (flujo
  con token de setup y página `/setup-2fa`).
- **Vista admin de API tokens**: listar y revocar tokens de todos los usuarios
  (`GET/DELETE /admin/api-tokens`), usando `apiToken.read`/`apiToken.write`.

## [0.15.0] - 2026-10-18

### Añadido

- **Marketplace de bloques**: catálogo (local + índice remoto) con instalación
  desde la UI. Índice configurable vía `BLOCK_REGISTRY_URL` o `blocks/catalog.json`;
  instalación remota por `git clone`.

## [0.14.0] - 2026-10-18

### Añadido

- **Reporte de campañas**: tasas de apertura/clic, clics únicos/totales y gráfico
  de barras por campaña (`GET /email/campaigns/:id/report`).
- **Exportación de destinatarios** en CSV (`GET /email/campaigns/:id/export`).

## [0.13.0] - 2026-10-18

### Añadido

- **FIDO2 / Passkeys**: registro y login sin contraseña (huella/rostro/llave de
  seguridad) vía WebAuthn, con gestión en "Mi cuenta".
- **Cifrado por campo aplicado a contacto**: teléfono, dirección y WhatsApp se
  cifran en reposo (`x-ui.secret`).
- **ROADMAP.md** con elementos futuros y recomendaciones.

## [0.12.0] - 2026-10-18

### Añadido

- **Tokens de API personales**: cualquier usuario gestiona sus propios tokens (ya
  no solo admin); los scopes se validan para no exceder sus permisos.
- **Rate limit por token** (peticiones/minuto) y contador de peticiones.
- **"Recordarme"** en el login: la cookie de sesión dura 90 días (vs 30).

## [0.11.0] - 2026-10-18

### Añadido

- **Bloqueo de cuenta** por intentos fallidos de login (5 intentos → 15 min), a
  nivel de cuenta (además del rate limit por IP).
- **Códigos de respaldo para 2FA** (de un solo uso) y página **Mi cuenta** para
  activar/desactivar 2FA con QR/clave + códigos.
- **Cifrado por campo aplicado**: la contraseña SMTP (y campos `x-ui.secret`) se
  cifran automáticamente al guardar y se descifran al leer.

## [0.10.0] - 2026-10-18

### Añadido

- **Traducciones por bloque**: los bloques declaran `translations` en `block.json`
  y se sirven en `/public/i18n` bajo un namespace propio (su id), solo para
  idiomas habilitados + bloques instalados (cierra "módulos bajo demanda").
- `i18n.t()` del bloque resuelve por defecto en su namespace.

## [0.9.0] - 2026-10-18

### Añadido

- **Arranque "todo en uno" con Docker**: `docker compose up -d --build` levanta
  PostgreSQL, **MySQL**, Redis, API y web. Se agregó MySQL como alternativa.
- **Valores de conexión pre-cargados en el asistente** (presets PostgreSQL/MySQL
  de Docker, SQLite local y PostgreSQL local).
- `.dockerignore`, `Makefile` (`make up/down/logs/reset`) y compose canónico en la raíz.

## [0.8.0] - 2026-10-18

### Añadido

- **Programación de campañas** (fecha/hora) con `schedule`/`cancel` y scheduler
  en segundo plano.
- **Tracking de apertura y clics**: pixel de apertura + reescritura de enlaces,
  con contadores por campaña.
- **Eventos desde bloques**: los bloques declaran eventos en `block.json` y los
  emiten vía `fastify.events.emit(...)`; el bloque de ejemplo emite `order.created`.

## [0.7.0] - 2026-10-18

### Añadido

- **Seguridad integral** (checklist):
  - Cifrado de PII en reposo con **AES-256-GCM** (`lib/crypto.ts` + `ENCRYPTION_KEY`).
  - Sanitización de HTML (**XSS**) con `sanitize-html` en plantillas de correo y contenido.
  - **2FA / TOTP** (Google Authenticator/Authy) con flujo de login y endpoints de setup/confirm/disable.
  - **Rate limiting específico** en login/registro/recuperación de contraseña.
  - Mínimo privilegio en BD (`create-least-privilege-user.sql`) y **Dependabot**.

## [0.6.0] - 2026-10-18

### Añadido

- **API tokens (JWT)** para acceso programático a la API REST con scopes acotados,
  caducidad opcional y revocación inmediata (verificados contra la BD en cada
  petición). Sección "API Tokens" en el panel.
- Permisos nuevos: `apiToken.read`, `apiToken.write`.
- `authenticate` ahora acepta token de acceso (JWT) y token de API (JWT con
  `type: 'api_token'`).

## [0.5.0] - 2026-10-18

### Añadido

- **SSL/TLS opcional para la API** (`SSL_ENABLED` + certificado/clave por archivo
  o PEM): el usuario decide si lo activa.
- **Sección de seguridad en la UI** (HSTS, cookies seguras, CSP) con cabeceras
  aplicadas por plugin.
- Cookies de sesión `Secure` configurables; aviso en producción si `JWT_SECRET`
  usa el valor por defecto.
- Ejemplo de nginx con TLS + redirección HTTP→HTTPS y guía de seguridad.

## [0.4.0] - 2026-10-18

### Añadido

- **Selección de idiomas + carga bajo demanda**: el administrador elige qué
  idiomas habilita (uno o varios) en la instalación o en Ajustes; el frontend
  descarga únicamente los recursos de esos idiomas (`GET /api/v1/public/i18n`).
- Catálogo de idiomas en `@webs/i18n` con `es`, `en` y `pt`.
- Soporte de arrays (multi-selección) en el formulario auto-generado (SchemaForm).

## [0.3.0] - 2026-10-18

### Añadido

- **Módulo de Email marketing/automatización**:
  - Plantillas HTML con **editor visual (WYSIWYG) o HTML crudo** (a elección) y
    variables (`{{ user.name }}`, `{{ site.name }}`, …).
  - **Campañas masivas** (todos los usuarios, por roles o lista manual).
  - **Automatizaciones** por eventos (`user.registered`, `user.email_verified`,
    `user.password_changed`) con extensión por bloques.
  - **Cola de envío** en segundo plano con estado `queued/sent/failed`.
- Permisos nuevos: `email.read`, `email.write`, `email.send`.

## [0.2.0] - 2026-10-18

### Añadido

- **Asistente de instalación gráfico** (frontend multi-paso + API `/api/v1/setup/*`):
  selección de base de datos (PostgreSQL / SQLite / MySQL), configuración del
  sitio (nombre, logo claro/oscuro, icono, favicon), SMTP y creación de la cuenta
  administrador. Sin tocar código.
- **Soporte multi-motor de base de datos** vía esquemas Prisma por motor
  (`prisma db push` + `prisma generate` en la instalación).
- **Módulo de correo (SMTP)** con `nodemailer`: verificación de email y
  restablecimiento de contraseña.
- Estado de instalación persistido en `data/webs.config.json`; la API arranca en
  "modo instalación" si aún no está configurada.
- Páginas de verificación de correo y restablecimiento de contraseña.

## [0.1.0] - 2026-10-18

### Añadido

- Monorepo `pnpm workspaces` con TypeScript estricto.
- Backend **Fastify 5**: REST `/api/v1`, WebSocket `/ws`, Swagger `/docs`,
  health checks, manejo de errores consistente, rate limiting, CORS, helmet.
- **Sistema de bloques/plugins** (manifiesto `block.json` + SDK + loaders + slots).
- Módulos: auth (JWT + refresh token + RBAC), users, roles/permissions,
  settings (JSON Schema → formulario), blocks, content, translations, audit.
- Frontend **React 19 + Vite**: panel de administración, temas claro/oscuro,
  i18n (es/en), formularios auto-generados, editor de CSS, gestión de bloques.
- Bloque de ejemplo (`@webs/block-example`).
- Persistencia con **Prisma 6 + PostgreSQL** (esquema y seed de roles/permisos).
- Docker Compose + Dockerfiles + CI (GitHub Actions).
- Documentación completa (arquitectura, API, guías, ADRs).
