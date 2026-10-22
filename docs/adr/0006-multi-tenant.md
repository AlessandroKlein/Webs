# ADR-0006: Multi-tenant por cadenas (organización padre/hija con finanzas separadas)

- **Estado:** Aceptado
- **Fecha:** 2026 (refactorización global de Webs, Milestone 2)
- **Decisión:** Modelar el multi-tenant como **cadenas** de organizaciones jerárquicas
  (organización padre con hijas/sucursales) usando un `parentId` autorreferenciado más un
  `chainId` denormalizado a la raíz; con **finanzas separadas por organización** y **vista
  consolidada** a nivel de cadena, aplicado mediante scoping de tenant en cada modelo de
  negocio y en cada query (fail-closed).

## Contexto

Hoy existe el modelo `Organization` (`apps/api/prisma/schema.prisma:378`) pero está **aislado**:
solo `id`, `name`, `slug?`, `plan`, `active`, `shareInventory`, `logoUrl?`, `createdAt` — sin
relación padre/hijo y sin relaciones a los modelos de negocio. Los modelos de negocio
(`Product`, `Order`, `Booking`, `BlogPost`, `Course`, `Enrollment`, `Routine`, `Comment`,
`Ticket`, `Notification`, `ChatMessage`, `CalendarEvent`, `SocialPost`, `Follow`, `Story`,
`Subscription`, `Payment`, `Invoice`) son **globales**: no referencian ninguna organización.
`Membership`, `MembershipPlan`, `AttendanceRecord` sí referencian `organizationId`, y
`InventoryItem.organizationId` es opcional.

No existe módulo API `organizations` (el glob de `apps/api/src/modules/` no lo lista); el
modelo no está cableado a ningún módulo, y el frontend (`OrganizationsPage.tsx`) y el bloque
`blocks/organizaciones` usan los modelos de membresía/asistencia.

El objetivo pide multi-tenant «por cadenas»: organizaciones padre/hija con finanzas separadas
y vista consolidada (caso típico: franquicias, gimnasios, cadenas de comercio).

## Decisión

### 1. Modelo de jerarquía

- `Organization` gana:
  - `parentId` (String?, FK a `Organization.id`, autorreferencia) — define la jerarquía.
  - `chainId` (String?, FK a `Organization.id`) — apunta a la **raíz** de la cadena para
    agrupar sin recorrer el árbol en cada query (denormalización de la raíz).
  - `type` (`OrganizationType`: `standalone` | `chain` | `branch`) — cadena raíz, sucursal u
    organización independiente.
- Una **cadena** = la organización raíz (`type: chain`) y todas sus descendientes
  (`type: branch`). Se admite jerarquía de varios niveles; `chainId` siempre referencia la raíz.
- Consistencia: al crear/mover una sucursal, `chainId` se deriva de la raíz; `parentId` y
  `chainId` se validan en un único servicio (`organizationService`) para evitar ciclos.

### 2. Scoping de tenant en los modelos de negocio

- Se añade `organizationId` **obligatorio** a todos los modelos de negocio listados en
  Contexto (y a los existentes opcionales se les exige): `Product`, `Order`, `Booking`,
  `BlogPost`, `Course`, `Enrollment`, `Routine`, `Comment`, `Ticket`, `Notification`,
  `ChatMessage`, `CalendarEvent`, `SocialPost`, `Follow`, `Story`, `Subscription`, `Payment`,
  `Invoice`, `Shipment`, `Coupon`, `Media` (cuando sea contenido de una organización),
  `InventoryItem`.
- Los modelos **globales** (compartidos y no scoped) siguen siendo `User`, `Role`,
  `Permission`, `RolePermission`, `UserRole`, `Session`, `ApiToken`, `Passkey`, `OtpCode`,
  `Setting` (claves globales), `Menu`, `Translation`, `Email*`, `AuditLog`, y los modelos de
  extensión `PluginInstallation`/`PluginPlacement`.
- `Membership` se mantiene scoped por `organizationId`; la membresía de una sucursal implica
  pertenencia visual a la cadena (resolución vía `chainId` para la vista consolidada).

### 3. Finanzas separadas + vista consolidada

- **Separación**: cada `Order`, `Payment`, `Invoice` y `Coupon` lleva su `organizationId`; la
  contabilidad se consulta **siempre** dentro del scope de una organización. No hay libro
  compartido por defecto.
- **Consolidación**: para un usuario con visibilidad de cadena, las consultas financieras
  agregan por `chainId` (o por el closure de descendientes de la organización raíz). La vista
  consolidada es de **solo lectura agregada** y nunca escribe en nombre de las hijas.
- **Inventario**: el flag `shareInventory` existente define la granularidad — `false`
  (default): inventario por sucursal; `true`: inventario a nivel de cadena (los `InventoryItem`
  se asocian a la raíz).

### 4. Contexto de tenant en runtime

- El tenant se resuelve por petición desde el claim `orgId` del JWT (o, para super_admin en
  vista consolidada, un header explícito `X-Org-Id`/`X-Chain-Id`). El contexto se inyecta en
  `request.tenant`.
- **Fail-closed**: toda query de modelos scoped pasa por un filtro de tenant; si no hay
  `organizationId` resuelto y el modelo lo exige, la operación se rechaza (403/400), nunca se
  degrada a una query global.
- Implementación: un middleware/extensión de Prisma (`withTenant(orgId)`) que añade
  `WHERE organizationId = ?` (o `organizationId IN (closure)` para vista consolidada) de forma
  uniforme, en vez de filtros manuales por módulo.
- **RBAC de tenant**: `super_admin` ve todas las cadenas; `admin` de cadena (rol sobre la raíz)
  ve la cadena completa; `manager`/`user` ven su organización (y, si corresponde, la vista de
  cadena de solo lectura). Los permisos existentes `<recurso>.<accion>` (ADR-0004) se evalúan
  **dentro** del scope de tenant.

## Consecuencias

**Positivas**

- Aislamiento real de datos entre organizaciones (multi-tenant seguro por filas).
- Modela el negocio de cadenas: finanzas separadas por sucursal + consolidado por cadena.
- `chainId` denormalizado permite agregar sin recorrer el árbol en caliente.

**Negativas / costes**

- **Migración grande**: añadir `organizationId` obligatorio a ~20 modelos exige backfill. La
  estrategia es crear una «organización raíz por defecto» y asignarle las filas existentes en
  un script de migración/seed, dejando los datos actuales operativos.
- Toda query de negocio debe atravesar el scoping: riesgo de fugas si un módulo nuevo omite el
  filtro; se mitiga con el middleware central y tests de aislamiento.
- El árbol jerárquico profundo encarece los cierres; se limita la profundidad práctica y se
  apoya en `chainId` para el caso común (un solo nivel de sucursales).

## Notas

- Baseline sync requerida: `docs/architecture/overview.md` (mapa de componentes) y un nuevo
  `docs/architecture/multi-tenant.md` describirán el modelo de cadenas; `schema.prisma` se
  migra en la tarea de implementación. El bloque `organizaciones` debe adaptarse a la jerarquía.
- Este ADR no decide el mecanismo de despliegue por tenant (compartido vs. base por tenant);
  se opta por **esquema/tenant compartido con scoping por filas** (`organizationId`), coherente
  con Postgres y con la escalabilidad horizontal de ADR-0008.
