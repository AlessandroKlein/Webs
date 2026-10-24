# ADR-0021: Sistema de tickets de soporte

- **Estado:** Aceptado
- **Fecha:** 2026 (versión 2.6.0 del monorepo — Milestone 8)
- **Decisión:** Ampliar el modelo `Ticket` existente (hoy `status` libre y sin prioridad) a un
  sistema de tickets con estados canónicos `pending → in_progress → done`, prioridad,
  asignación opcional y scoping multi-tenant fail-closed; permisos `support.read` /
  `support.manage` (ya en el catálogo) y notificaciones/tiempo-real reutilizando
  `Notification` + el bus WebSocket (ADR-0022). Sin dependencias nuevas.

## Contexto

La plataforma expone un ítem de menú `/admin/support` (permiso `support.read`) y ya dispone
de un modelo `Ticket` mínimo:

- `apps/api/prisma/schema.prisma:307-317` — `Ticket { id, organizationId, subject, message,
  status String @default("open"), createdAt, @@index([organizationId]) @@map("tickets") }`.
  No hay prioridad, ni asignado, ni transiciones de estado (el valor libre `"open"` no es un
  flujo).
- `packages/core/src/constants.ts:105-106` — `SupportRead: 'support.read'`,
  `SupportManage: 'support.manage'` ya existen en el catálogo canónico de permisos
  (ADR-0018) y en el seed (rol `soporte`).
- `apps/api/prisma/schema.prisma:319-334` — `Notification` (title/body/read/priority/
  expiresAt) es el canal de notificación ya disponible.
- `apps/api/src/plugins/websocket.ts` — bus realtime con `sendToUser`/`sendToChannel` y ACL
  fail-closed (ADR-0022).

No existe aún módulo de tickets: el modelo está definido pero sin rutas ni lógica. Este ADR
define el diseño objetivo (M8), no lo implementa.

## Decisión

### 1. Modelo de datos (ampliación de `Ticket`)

Se amplía `Ticket` (migración, no tabla nueva):

```prisma
enum TicketStatus { pending, in_progress, done }
enum TicketPriority { low, normal, high, urgent }

model Ticket {
  id               String   @id @default(uuid())
  organizationId   String
  subject          String
  message          String
  status           TicketStatus  @default(pending)
  priority         TicketPriority @default(normal)
  assignedToUserId String?
  resolvedAt       DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@index([organizationId])
  @@index([status])
  @@index([assignedToUserId])
  @@map("tickets")
}
```

- `status` pasa de `String @default("open")` a enum `pending|in_progress|done`
  (transición `pending → in_progress → done`, con `resolvedAt` fijado al pasar a `done`).
- `priority` (`low|normal|high|urgent`) permite ordenar la cola de soporte.
- `assignedToUserId` es asignación opcional (self-relation a `User`); sin asignar = sin dueño.

### 2. Permisos

Se reutilizan las claves existentes `support.read` (ver/responder) y `support.manage`
(gestionar estados, asignar, priorizar, resolver), ya sembradas y en el catálogo. No se
crean claves nuevas.

### 3. Scoping multi-tenant (ADR-0006)

`Ticket.organizationId` es obligatorio y el módulo usa `requireTenant`/`resolveScope`
(fail-closed). Un agente de cadena ve los tickets de su cadena (`chainId`); un miembro ve
solo los de su organización. Sin tenant → 403. Coherente con el resto de la plataforma.

### 4. Contrato de API

Bajo `API_PREFIX` (`/api/v1`), módulo `apps/api/src/modules/tickets/routes.ts`:

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/tickets` | `support.read` | Lista (filtros `status`/`priority`/`assignedTo`, paginado). |
| `POST` | `/tickets` | `support.read` | Crea un ticket (subject/message/priority). |
| `GET` | `/tickets/:id` | `support.read` | Detalle. |
| `PATCH` | `/tickets/:id` | `support.manage` | Actualiza estado/prioridad/mensaje. |
| `POST` | `/tickets/:id/assign` | `support.manage` | Asigna/desasigna (`assignedToUserId`). |
| `POST` | `/tickets/:id/resolve` | `support.manage` | Transición a `done` + `resolvedAt`. |

### 5. Notificación y tiempo real

Reutiliza el bus existente (ADR-0022): cada transición emite un evento
(`ticket.created`/`ticket.updated`/`ticket.assigned`/`ticket.resolved`) y opcionalmente una
fila `Notification` dirigida al asignado/creador, entregada por `sendToUser(userId, …)` y
vista en la campana del shell (ya escucha `notification.created`).

## Consecuencias

### Positivas

- Cierra el hueco entre el ítem `/admin/support` existente y la ausencia de backend de
  tickets, usando modelos y permisos que ya existen (migración acotada, no tabla nueva).
- Estados y prioridad canónicos hacen la cola ordenable y auditable.
- Scoping fail-closed y permisos ya sembrados mantienen la coherencia multi-tenant y RBAC.

### Negativas

- `status` pasa de `String` libre a enum: los tickets existentes con `"open"` requieren un
  backfill en la migración (`"open" → pending`).
- La asignación opcional añade una self-relation; hay que resolver el borrado de usuario
  (mantener ticket, `assignedToUserId = null`).

## Notas

- No confundir con el «Ticket de Acceso» (TA) de ARCA (`apps/api/src/integrations/arca.ts`,
  `buildLoginTicketRequest`), que es un concepto WSAA/WSFE ajeno a soporte.
- El menú `/admin/support` ya apunta a `support.read` (AdminLayout.tsx:139); no requiere
  cambio de ítem, solo el backend que lo respalda.
- Implementación (M8) y guía operativa de soporte quedan para las tareas siguientes.
