# Sistema de tickets y soporte

Guía operativa del sistema de tickets (ADR-0021). Un ticket es un pedido de soporte
(solicitud, bug o consulta) que un usuario crea y el staff de soporte gestiona hasta
cerrarlo. El backend vive en `apps/api/src/modules/support.ts` (5 rutas bajo
`/api/v1/support/tickets`).

## 1. Modelo de datos

Modelo `Ticket` (`apps/api/prisma/schema.prisma:321-337`):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | Identificador. |
| `organizationId` | string (NOT NULL) | Organización dueña (scoping multi-tenant, ADR-0006). |
| `subject` | string | Asunto (obligatorio al crear). |
| `message` | string | Cuerpo del pedido. |
| `status` | `TicketStatus` | `pending` → `in_progress` → `done` (default `pending`). |
| `priority` | `TicketPriority` | `low` / `normal` / `high` / `urgent` (default `normal`). |
| `assignedToUserId` | string? | Staff asignado (opcional). |
| `authorId` | string? | Usuario que creó el ticket. |
| `resolvedAt` | DateTime? | Fecha de cierre (se setea al pasar a `done`, se limpia al reabrir). |
| `createdAt` / `updatedAt` | DateTime | Timestamps. |

Índices: `@@index([organizationId])` y `@@index([status])`. Migración `0008_tickets`
con backfill de estados legacy (`open`→`pending`, `closed`→`done`).

## 2. Endpoints

Todas las rutas viven bajo `/api/v1/support/tickets`. Salvo `POST`, requieren
`requireTenant` (fail-closed) y el scope se resuelve con `resolveScope` (solo se ven los
tickets de la organización del tenant).

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/support/tickets` | `support.read` | Lista los tickets del tenant (orden `createdAt desc`). Devuelve `{ items: [...] }`. |
| `GET` | `/support/tickets/:id` | `support.read` | Detalle de un ticket (scoped). |
| `POST` | `/support/tickets` | *(autenticado)* | Crea un ticket. **Cualquier usuario autenticado** puede crear; el autor es `request.user.sub`. |
| `PATCH` | `/support/tickets/:id` | `support.manage` | Actualiza estado/prioridad/asunto/asignación. |
| `DELETE` | `/support/tickets/:id` | `support.manage` | Elimina un ticket. |

### 2.1 Crear ticket (`POST`)

Body:

```json
{ "subject": "No puedo subir imágenes", "message": "Me da error 500 al subir", "priority": "high" }
```

Reglas:

- `subject` es obligatorio (trim no vacío) → 400 `El asunto es obligatorio`.
- `priority` opcional; si no es `low/normal/high/urgent` se ignora y queda `normal`.
- `status` siempre arranca en `pending`; `authorId` = usuario autenticado.
- `organizationId` = tenant activo (fallback `DEFAULT_ORG_ID`).

### 2.2 Actualizar ticket (`PATCH`)

Body parcial (todos los campos opcionales):

```json
{ "status": "done", "priority": "urgent", "assignedToUserId": "<staff-id>", "subject": "..." }
```

Reglas:

- `status` debe ser `pending/in_progress/done`; si se pasa a `done`, se setea
  `resolvedAt = now`; si se reabre (`pending`/`in_progress`), `resolvedAt = null`.
- `priority` inválida → 400 `Prioridad inválida`.
- `assignedToUserId` acepta `null` (desasignar).
- `subject`/`message` se aplican solo si son strings no vacíos.

## 3. Permisos

Los permisos ya existían (`packages/core/src/constants.ts`): `support.read`
(listar/leer) y `support.manage` (actualizar/eliminar). Crear **no** exige un permiso
de soporte: cualquier usuario autenticado puede abrir un ticket. Los roles con soporte
(`soporte`, `admin`, `super_admin`) llevan `support.read`/`support.manage` sembrados.

## 4. Scoping multi-tenant (fail-closed)

- `GET`/`GET :id`/`PATCH`/`DELETE` usan `requireTenant` + `resolveScope`:
  solo acceden a tickets con `organizationId` dentro del scope del usuario (su
  organización, o todas las de la cadena si es chain-admin, o todas si es super_admin).
- Sin tenant → 403 (fail-closed). Un ticket de otra organización no se ve ni se edita.

## 5. Retrocompatibilidad (plugin `support` legacy)

`plugins/support/src/server.ts` (el plugin de soporte histórico) mapea estados legacy
`open`/`closed` a los nuevos `pending`/`done` y setea `resolvedAt` al cerrar, para no
romper clientes viejos que usaban esos strings.

## 6. Verificación rápida

```bash
# Crear (cualquier usuario autenticado)
curl -X POST http://localhost:4000/api/v1/support/tickets \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"subject":"Problema de prueba","priority":"high"}'

# Listar (staff: support.read)
curl http://localhost:4000/api/v1/support/tickets -H 'Authorization: Bearer <token>'

# Cerrar (staff: support.manage)
curl -X PATCH http://localhost:4000/api/v1/support/tickets/<id> \
  -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' \
  -d '{"status":"done"}'
```

Referencias: [ADR-0021](../adr/0021-tickets.md), [Multi-tenant por cadenas](../architecture/multi-tenant.md).
