# Migraciones Prisma — baseline regenerado

## Por qué se regeneró `0001_init`

El historial de migraciones estaba roto de origen: `0001_init` solo creaba 14
tablas (usuarios, roles, permisos, sesiones, settings, bloques, contenido,
traducciones, menús, media y auditoría) mientras que `schema.prisma` declara
**57 modelos**. Las tablas de negocio (`organizations`, `products`, `orders`,
`bookings`, `expenses`, etc.) se habían creado históricamente con
`prisma db push`, sin archivo de migración. Como consecuencia, la migración de
multi-tenant por cadenas (`20261023120000_multi_tenant_chains`) era un delta
`ALTER TABLE` sobre tablas inexistentes y un `prisma migrate deploy` desde una
base vacía fallaba.

El baseline `0001_init` actual **crea el schema completo de forma idempotente**:

- 57 tablas + enum `OrganizationType` (`standalone`/`chain`/`branch`).
- Los 24 modelos de negocio con `organizationId` **NOT NULL** (expenses,
  products, orders, bookings, blog_posts, courses, enrollments, routines,
  comments, tickets, notifications, chat_messages, calendar_events,
  social_posts, follows, stories, subscriptions, payments, invoices,
  shipments, coupons, memberships, attendance_records, inventory_items).
  `media.organizationId` queda nullable (contenido de organización opcional).
- Jerarquía de organizaciones: `Organization.type`, `parentId`, `chainId` con
  auto-FKs `OrgHierarchy`/`OrgChain` (`ON DELETE SET NULL`) e índices.
- Backfill idempotente de la organización raíz `principal`
  (`00000000-0000-4000-8000-000000000001`) al final del SQL, con
  `ON CONFLICT ("slug") DO NOTHING`.

## Escenarios de despliegue

### 1. Base de datos nueva (desde cero)

```bash
DATABASE_URL=postgresql://... pnpm --filter @webs/api exec prisma migrate deploy
DATABASE_URL=postgresql://... pnpm --filter @webs/api exec prisma db seed
```

`migrate deploy` aplica `0001_init` (crea 57 tablas + enum + backfill de la
organización raíz) y el seed crea roles/permisos, el superadmin y la membresía
sobre `principal`.

### 2. Base existente que YA pasó por migraciones

Si la base ya tiene `0001_init` registrado en `_prisma_migrations` (aunque sea
el `0001_init` antiguo de 14 tablas o haya registros "colgados" de la migración
`multi_tenant_chains` ya eliminada), **no hay que hacer nada**:

```bash
DATABASE_URL=postgresql://... pnpm --filter @webs/api exec prisma migrate deploy
# → "No pending migrations to apply" (exit 0)
```

`migrate deploy` solo aplica migraciones cuyo nombre **no** esté en
`_prisma_migrations`; no verifica checksums ni falla por filas colgadas. El
schema ya está completo (fue creado por `db push`), por lo que no hay pérdida
ni modificación.

### 3. Base existente mantenida SOLO con `db push`

Si la base tiene el schema completo pero **no** tiene tabla `_prisma_migrations`
(nunca corrió `migrate`), un `migrate deploy` directo falla con:

```
Error: P3005 — The database schema is not empty.
```

El procedimiento de baseline es marcar `0001_init` como ya aplicado una sola
vez y luego desplegar:

```bash
DATABASE_URL=postgresql://... pnpm --filter @webs/api exec prisma migrate resolve --applied 0001_init
DATABASE_URL=postgresql://... pnpm --filter @webs/api exec prisma migrate deploy
```

`migrate resolve --applied 0001_init` crea `_prisma_migrations` con el registro
del baseline (sin tocar datos ni schema); a partir de ahí `migrate deploy` es
idempotente.

## Notas

- `migration_lock.toml` fija el provider en `postgresql`.
- La organización raíz `principal` usa el id fijo
  `00000000-0000-4000-8000-000000000001` (`DEFAULT_ORG_ID` en
  `src/lib/tenant.ts`); el backfill del baseline es idempotente por `slug`.
