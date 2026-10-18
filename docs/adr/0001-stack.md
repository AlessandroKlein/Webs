# ADR-0001: Elección de Fastify + React + TypeScript + Prisma

- **Estado:** Aceptado
- **Fecha:** 2026 (versión 0.1.0 del monorepo)
- **Decisión:** Fastify (backend), React + Vite (frontend), TypeScript (todo el monorepo), Prisma (acceso a datos).

## Contexto

Webs necesita una plataforma web modular y escalable. El backend debe ser de alto
rendimiento, con validación de esquemas y un sistema de plugins que permita extenderlo
(rutas y decoradores) desde bloques de terceros. El frontend debe soportar un panel de
administración y un sitio público donde los bloques se montan en slots. El acceso a datos
debe ser seguro en tipos y compatible con PostgreSQL y columnas JSON.

## Decisión

| Capa | Elección | Alternativas rechazadas |
|------|----------|-------------------------|
| HTTP | **Fastify v5** | Express: menor rendimiento y validación de esquemas no integrada. |
| UI | **React 19 + Vite 6** | Vue: React se eligió por ecosistema y porque el contrato de bloques de cliente solo exige montar un `HTMLElement` (agnóstico de framework). |
| Lenguaje | **TypeScript 5 (ES2022, `strict`)** | JavaScript plano: el contrato plataforma↔bloque requiere tipos estructurales estables. |
| ORM | **Prisma 6** | TypeORM/Knex/SQL crudo: Prisma aporta cliente tipado, migraciones y tipos `Json` para config y contenido. |

## Consecuencias

**Positivas**

- Fastify da validación de entrada nativa (JSON Schema) reutilizada también por el
  formulario auto-generado (`SchemaForm`).
- El sistema de plugins/decoradores de Fastify es la base del sistema de bloques
  (`register(instance, config)` bajo `/api/v1/blocks/<id>`).
- Prisma provee un único `PrismaClient` (`fastify.prisma`) y migraciones reproducibles.
- TypeScript `strict` + `verbatimModuleSyntax` mantiene contratos claros entre `@webs/*`.

**Negativas / costes**

- Fastify es menos conocido que Express; el equipo debe dominar sus hooks y decoradores.
- Prisma introduce una capa de generación (`prisma generate`) que debe ejecutarse en CI y
  builds.
- React 19 requiere alinear el ecosistema (react-router v7, react-query, zustand).

## Notas

El `README.md` raíz aún dice «Node.js (Vue.js)», un resto desactualizado: la decisión real
y el código usan React (ver `apps/web/package.json`).
