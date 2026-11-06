# CRM (contactos, empresas y pipeline)

Plugin `crm` del repositorio: contactos, empresas, oportunidades con etapas y
actividades. Se instala y activa desde **Integraciones → Plugins**; su página queda
en `/admin/crm` (sección *Ventas*).

## Permisos

- `crm.read`: ver contactos, empresas, pipeline y actividades.
- `crm.write`: crear/editar/borrar.

El plugin declara `"feature": "crm"`: es premium, así que sin licencia activa con
esa feature el registro se omite (fail-closed) y el ítem de menú no aparece. En
desarrollo (`LICENSE_MODE=dev`) está siempre habilitado.

Se definen en `packages/core/src/permissions.ts` y se asignan a los roles con el
seed (`apps/api/prisma/seed.ts`). Si instalás el plugin en una base existente,
volvé a correr el seed o asigná los permisos al rol desde **Usuarios → Roles**.

## API

Base: `/api/v1/plugins/crm` (y el alias `/api/v1/blocks/crm`).

| Método y ruta | Descripción |
| --- | --- |
| `GET /contacts?search=` | Lista/busca por nombre, email o teléfono |
| `POST /contacts` | Alta (`name` obligatorio) |
| `GET/PATCH/DELETE /contacts/:id` | Detalle, edición, baja |
| `GET/POST /companies`, `PATCH/DELETE /companies/:id` | Empresas |
| `GET/POST /deals`, `PATCH/DELETE /deals/:id` | Oportunidades (`stage` incluido) |
| `GET /pipeline` | Totales por etapa (`count`, `total` en centavos) |
| `GET/POST /activities`, `PATCH/DELETE /activities/:id` | Actividades y tareas |
| `GET /contacts/:id/activities` | Historial de un contacto |

Etapas fijas: `prospecting`, `qualified`, `proposal`, `negotiation`, `won`, `lost`.
Tipos de actividad: `call`, `email`, `meeting`, `task`.

## Modelo

`CrmContact`, `CrmCompany`, `CrmDeal` y `CrmActivity`, todos con
`organizationId` y borrado en cascada. Los montos se guardan en **centavos**
(`Int`). Migración: `apps/api/prisma/migrations/0018_crm`.

## Límites de esta versión

- UI mínima (contactos + pipeline); el alta de deals/actividades se hace por API.
- Sin importación CSV, sin campos personalizados y sin adjuntos.
