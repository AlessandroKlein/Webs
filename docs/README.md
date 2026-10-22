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
| [Escalabilidad](architecture/scalability.md) | API stateless, Redis, PostgreSQL, contenedores, rate limiting y observabilidad. |
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

## Convenciones de este repositorio de documentación

- Las rutas se expresan en formato POSIX relativas a la raíz del monorepo (por ejemplo, `apps/api/src/app.ts`).
- Los comandos se muestran tal como están definidos en los `package.json` reales.
- Los diagramas son texto/Markdown para que sean legibles sin herramientas externas.

### Guías y referencia de API

Además de este índice, el repositorio de documentación incluye:

- `docs/guides/` — guías operativas (arranque, crear un plugin, configuración desde UI,
  roles y permisos, despliegue).
- `docs/api/` — referencia de la API (visión general, flujo de autenticación, WebSocket).
