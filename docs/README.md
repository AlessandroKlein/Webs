# Documentación de la plataforma Webs

Bienvenido a la documentación técnica de **Webs**, una plataforma web modular, escalable y multitenant construida con **Node.js + Fastify + React** y organizada como monorepo pnpm.

Este directorio describe la *arquitectura* del sistema. Para guías operativas (crear un plugin, desplegar, contribuir) se enlazan los documentos correspondientes en cada sección.

## Índice de contenidos

### Arquitectura

| Documento | Contenido |
|-----------|-----------|
| [Visión general](architecture/overview.md) | Qué es Webs, objetivos, decisiones de stack y mapa de componentes. |
| [Monorepo](architecture/monorepo.md) | Estructura de pnpm workspaces, convenciones `@webs/*` y flujo de trabajo. |
| [Sistema de plugins](architecture/plugin-system.md) | **Documento central**: manifiesto `plugin.json`, SDK, slots/placements, menú nativo, loader, registro de cliente y ciclo de vida. |
| [Autenticación y RBAC](architecture/auth-rbac.md) | JWT de acceso + refresh token opaco, flujo de sesión y permisos por rol. |
| [Configuración y temas](architecture/settings-theming.md) | Secciones de ajustes, formularios auto-generados (SchemaForm) y sistema de temas. |
| [Internacionalización](architecture/i18n.md) | i18next, locales base, sobrescritura desde UI y traducciones de plugins. |
| [Builder visual de páginas](architecture/page-builder.md) | GrapesJS autoalojado: editor `/admin/editor`, `Page.layout`, `POST /api/v1/pages/save` y página de inicio configurable. |
| [Escalabilidad](architecture/scalability.md) | API stateless, Redis, PostgreSQL, contenedores, rate limiting y observabilidad. |
| [Licencias locales (Licensify)](architecture/licensing-integration.md) | Módulo `apps/api/src/modules/licenses`: activación offline, node-locking, feature-gating, modelo de venta y anti-reloj. |
| [Multi-tenant por cadenas](architecture/multi-tenant.md) | Organización padre/hija, scoping por filas, finanzas separadas + vista consolidada y contexto de tenant en runtime. |
| [Actualización zero-downtime](architecture/update-system.md) | Módulo `apps/api/src/modules/update`: check/apply/rollback, swap atómico y actualización de plugins. |
| [Base universal](architecture/base-universal.md) | De la base + plugins + plantilla a la app final (blog/tienda/gimnasio/logística), definiendo la página de inicio. |
| [Política de dependencias](architecture/politica-dependencias.md) | «Todo nativo, sin modo de pago»: auditoría de dependencias (MIT/Apache/BSD, sin SaaS de pago). |
| [Móvil y escritorio](architecture/mobile-desktop.md) | Auditoría + plan de integración: PWA/Capacitor (`@webs/mobile`) y companion de escritorio (`@webs/desktop`). |
| [Inventario completo](architecture/inventory.md) | **Spec técnica (ADR-0023)**: variantes SKU/EAN-UPC, catálogo, multi-almacén por sucursal, ledger inmutable, valoración promedio/FIFO, alertas y reportes/CSV. |
| [Compositor social enriquecido](architecture/compositor-social.md) | **Spec técnica (ADR-0024)**: galería multi-media, menciones/hashtags, encuestas, visibilidad, unfurl SSRF-safe y retrocompat. |
| [Refactorización global](architecture/refactor-global.md) | **Diseño objetivo**: plugins, multi-tenant por cadenas, licencias Licensify, escalabilidad y sistema de estilos. |

### Registros de decisiones de arquitectura (ADR)

| ADR | Decisión |
|-----|----------|
| [ADR-0001 — Stack](adr/0001-stack.md) | Fastify + React + TypeScript + Prisma. |
| [ADR-0002 — Monorepo](adr/0002-monorepo.md) | Monorepo con pnpm workspaces. |
| [ADR-0003 — Sistema de bloques](adr/0003-block-system.md) | Manifiesto + SDK + slots. |
| [ADR-0004 — Autenticación](adr/0004-auth.md) | JWT + refresh token opaco + RBAC. |
| [ADR-0005 — Plugins (rename + menú nativo)](adr/0005-plugin-rename.md) | Renombra «Bloques» a «Plugins» e integra ítems nativos al menú. |
| [ADR-0006 — Multi-tenant por cadenas](adr/0006-multi-tenant.md) | Organización padre/hija con finanzas separadas y vista consolidada. |
| [ADR-0007 — Licencias local anti-RE](adr/0007-licensing.md) | Licensify: activación offline, firma Ed25519, node-locking y ofuscación. |
| [ADR-0008 — Escalabilidad](adr/0008-scalability.md) | Rate-limit en Redis, k8s, stateless y auto-scaling. |
| [ADR-0009 — Tailwind + Shadcn UI](adr/0009-ui-styling.md) | Tailwind CSS v4 + primitivas Shadcn UI como sistema de estilos. |
| [ADR-0010 — Actualización zero-downtime](adr/0010-update-system.md) | Botón actualizar app/plugins: GitHub Releases, sha256+Ed25519, swap atómico + hot-reload, rollback. |
| [ADR-0011 — Builder visual de páginas](adr/0011-page-builder.md) | GrapesJS (MIT, autoalojado): `POST /api/v1/pages/save`, render de bloques guardados y página de inicio configurable. |
| [ADR-0012 — Internacionalización](adr/0012-i18n.md) | ES/EN/PT sobre `@webs/i18n`, sobrescritura por UI y language switcher. |
| [ADR-0023 — Modelo de inventario](adr/0023-inventory.md) | Inventario completo: variantes SKU/EAN-UPC, multi-almacén, ledger inmutable, valoración promedio/FIFO y alertas. |
| [ADR-0024 — Compositor social enriquecido](adr/0024-compositor-social-enriquecido.md) | Galería multi-media, menciones/hashtags, encuestas, visibilidad y preview de enlaces (nativo, retrocompatible). |

### Documentos legales (templates)

| Documento | Contenido |
|-----------|-----------|
| [Términos del Servicio](legal/01-terminos-de-servicio.md) | Términos y condiciones generales (ToS). |
| [Aviso Legal / Disclaimer](legal/02-aviso-legal.md) | Identificación del titular y descargo de responsabilidad. |
| [Política de Privacidad](legal/03-politica-de-privacidad.md) | Privacidad alineada con GDPR/LGPD. |
| [Política de Cookies](legal/04-politica-de-cookies.md) | Cookies de sesión y preferencias. |
| [Cumplimiento componentes sin pago](legal/05-cumplimiento-componentes-sin-pago.md) | Licencias de dependencias open-source. |
| [Instrucciones de personalización](legal/README.md) | Cómo adaptar los templates legales. |

## Convenciones de este repositorio de documentación

- Las rutas se expresan en formato POSIX relativas a la raíz del monorepo (por ejemplo, `apps/api/src/app.ts`).
- Los comandos se muestran tal como están definidos en los `package.json` reales.
- Los diagramas son texto/Markdown para que sean legibles sin herramientas externas.

### Guías y referencia de API

Además de este índice, el repositorio de documentación incluye:

- `docs/guides/` — guías operativas (arranque, crear un plugin, configuración desde UI,
  roles y permisos, despliegue).
- `docs/api/` — referencia de la API (visión general, flujo de autenticación, WebSocket).
