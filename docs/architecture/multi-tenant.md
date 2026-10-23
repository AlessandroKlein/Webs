# Multi-tenant por cadenas

Implementación del [ADR-0006](../adr/0006-multi-tenant.md): un modelo multi-tenant **por
cadenas** de organizaciones jerárquicas (padre con hijas/sucursales), con **finanzas separadas
por organización** y una **vista consolidada** a nivel de cadena.

## Concepto de cadena

Una **cadena** es un árbol de organizaciones:

```text
Organización raíz (type: chain)          ← «Cadena Franquicias Norte»
├── Sucursal Centro (type: branch)
├── Sucursal Norte  (type: branch)
└── Sucursal Sur    (type: branch)        ← puede tener hijas (jerarquía de varios niveles)
```

Cada organización es un **tenant** con datos aislados. La raíz define la cadena; las sucursales
cuelgan de ella y comparten visibilidad **solo** en las vistas consolidadas (nunca por defecto).

## Modelo de datos

`Organization` (`apps/api/prisma/schema.prisma:378`) gana tres campos para soportar la jerarquía:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `parentId` | `String?` (FK → `Organization.id`) | Define la jerarquía (autorreferencia). |
| `chainId` | `String?` (FK → `Organization.id`) | Apunta a la **raíz** de la cadena (denormalización para agregar sin recorrer el árbol en cada query). |
| `type` | `OrganizationType` | `standalone` \| `chain` \| `branch`. |

- Una **cadena** = la raíz (`type: chain`) y todas sus descendientes (`type: branch`).
- `chainId` siempre referencia la raíz, aunque la jerarquía tenga varios niveles.
- La creación/movimiento de sucursales deriva `chainId` desde la raíz y valida `parentId`/`chainId`
  en un único servicio (`organizationService`) para evitar ciclos.

## Scoping de tenant por filas

El aislamiento se logra con **esquema/tenant compartido + filtro por filas** (`organizationId`),
coherente con Postgres y con la escalabilidad horizontal de ADR-0008 (no se particiona la base).

### Modelos scoped (negocio)

Todos los modelos de negocio exigen `organizationId`:

`Product`, `Order`, `Booking`, `BlogPost`, `Course`, `Enrollment`, `Routine`, `Comment`,
`Ticket`, `Notification`, `ChatMessage`, `CalendarEvent`, `SocialPost`, `Follow`, `Story`,
`Subscription`, `Payment`, `Invoice`, `Shipment`, `Coupon`, `Media`, `InventoryItem`.

`Membership`, `MembershipPlan` y `AttendanceRecord` ya referencian `organizationId`; se
mantienen scoped (la membresía de una sucursal implica pertenencia visual a la cadena vía
`chainId`).

### Modelos globales (no scoped)

Siguen siendo compartidos: `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `Session`,
`ApiToken`, `Passkey`, `OtpCode`, `Setting` (claves globales), `Menu`, `Translation`, `Email*`,
`AuditLog`, y los modelos de extensión `PluginInstallation`/`PluginPlacement`.

## Finanzas separadas + vista consolidada

- **Separación**: cada `Order`, `Payment`, `Invoice` y `Coupon` lleva su `organizationId`; la
  contabilidad se consulta **siempre** dentro del scope de una organización. No hay libro
  compartido por defecto.
- **Consolidación**: un usuario con visibilidad de cadena agrega por `chainId` (o por el closure
  de descendientes de la raíz). La vista consolidada es de **solo lectura agregada**: nunca
  escribe en nombre de las hijas.
- **Inventario**: el flag `shareInventory` define la granularidad — `false` (default):
  inventario por sucursal; `true`: inventario a nivel de cadena (los `InventoryItem` se asocian a
  la raíz).

## Contexto de tenant en runtime

El tenant se resuelve **por petición**:

1. Desde el claim `orgId` del JWT (fuente principal).
2. Para `super_admin` en vista consolidada, un header explícito `X-Org-Id` / `X-Chain-Id`.

El contexto se inyecta en `request.tenant` y se aplica con **fail-closed**: toda query de modelos
scoped pasa por un filtro de tenant; si no hay `organizationId` resuelto y el modelo lo exige, la
operación se rechaza (`403`/`400`), nunca se degrada a una query global.

La implementación prevista es un middleware/extensión de Prisma — `withTenant(orgId)` — que añade
`WHERE organizationId = ?` (o `organizationId IN (closure)` para vista consolidada) de forma
uniforme, en vez de filtros manuales por módulo.

### RBAC de tenant

| Rol | Alcance |
|-----|---------|
| `super_admin` | Todas las cadenas. |
| `admin` de cadena (rol sobre la raíz) | La cadena completa. |
| `manager` / `user` | Su organización (y, si corresponde, la vista de cadena de solo lectura). |

Los permisos existentes `<recurso>.<accion>` (ADR-0004) se evalúan **dentro** del scope de tenant.

## Notas de implementación

- **Migración**: añadir `organizationId` obligatorio a ~20 modelos exige backfill. La estrategia
  (ADR-0006) es crear una «organización raíz por defecto» y asignarle las filas existentes en un
  script de migración/seed, dejando los datos actuales operativos.
- **Riesgo de fuga**: toda query de negocio debe atravesar el scoping; se mitiga con el middleware
  central y tests de aislamiento (un módulo nuevo que omita el filtro debe fallar los tests).
- **Profundidad**: el árbol jerárquico profundo encarece los cierres; se limita la profundidad
  práctica y se apoya en `chainId` para el caso común (un solo nivel de sucursales).
