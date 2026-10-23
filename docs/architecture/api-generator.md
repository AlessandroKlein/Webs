# Generador de APIs de acceso rápido (spec técnica)

Spec del **ADR-0020**. Describe el modelo de datos, el router genérico, el formato de
definición, la generación del SDK tipado y la integración con plugins / feature-gating.

## 1. Modelo de datos (Prisma)

Dos modelos estáticos nuevos (migración única, no por recurso):

```prisma
model GeneratedResource {
  id             String   @id @default(uuid())
  key            String   @unique           // slug: /api/v1/generated/<key>
  name           String                     // nombre legible
  schema         Json                       // JSON Schema del registro
  description    String?
  feature        String   @default("generator") // feature premium por defecto
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@map("generated_resources")
}

model GeneratedRecord {
  id             String   @id @default(uuid())
  resourceId     String
  organizationId String                     // scoping multi-tenant (ADR-0006)
  data           Json                       // fila JSONB validada por `schema`
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([resourceId, organizationId])
  @@map("generated_records")
}
```

- `GeneratedResource` es **global** (como `Setting`/`Menu`/`Translation`): la definición se
  comparte entre tenants.
- `GeneratedRecord` es **scoped**: cada fila pertenece a una organización (vista consolidada
  por cadena vía `chainId`, igual que ADR-0006).
- Relación lógica: `GeneratedRecord.resourceId → GeneratedResource.key` (sin FK estricta,
  por coherencia con el patrón JSONB de ADR-0027).

## 2. Formato de definición (JSON Schema)

`GeneratedResource.schema` es un JSON Schema (subconjunto draft 2020-12) del **registro**:

```json
{
  "type": "object",
  "required": ["titulo"],
  "properties": {
    "titulo":      { "type": "string", "maxLength": 120 },
    "descripcion": { "type": "string", "format": "html" },
    "cantidad":    { "type": "integer", "minimum": 0 },
    "activo":      { "type": "boolean", "default": true },
    "etiquetas":   { "type": "array", "items": { "type": "string" } }
  },
  "additionalProperties": false
}
```

Tipos soportados (v1): `string` (con `format: "html"` para sanitizar), `number`/`integer`,
`boolean`, `array`, `object` anidado, `enum`, `default`, `required`, `min/max`,
`minLength/maxLength`, `additionalProperties: false`. El builder UI (`/admin/generated`)
genera este esquema desde un formulario; también se acepta pegarlo como JSON.

## 3. Router genérico (contrato de API)

Un único plugin Fastify registrado en build-time (`apps/api/src/modules/generated/routes.ts`,
bajo `API_PREFIX`), con rutas wildcard:

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/generated` | `generated.read` | Lista recursos definidos (key, name, schema, feature, enabled). |
| `POST` | `/generated` | `generated.manage` | Crea/reemplaza un recurso (valida el schema). |
| `PATCH` | `/generated/:key` | `generated.manage` | Edita definición (name/schema/feature/enabled). |
| `DELETE` | `/generated/:key` | `generated.manage` | Elimina recurso (y sus registros). |
| `GET` | `/generated/:resource` | `gen.<key>.read` | Lista registros (paginado, filtros por `q` y campos). |
| `POST` | `/generated/:resource` | `gen.<key>.write` | Crea registro (valida `data` contra schema). |
| `GET` | `/generated/:resource/:id` | `gen.<key>.read` | Obtiene un registro. |
| `PATCH` | `/generated/:resource/:id` | `gen.<key>.write` | Actualiza (merge parcial validado). |
| `DELETE` | `/generated/:resource/:id` | `gen.<key>.write` | Elimina registro. |
| `GET` | `/generated/:resource/schema` | `gen.<key>.read` | Devuelve el JSON Schema (render/validación runtime). |

Flujo por request:

1. `requireTenant`/`resolveScope` (ADR-0006) — fail-closed sin tenant.
2. Resolver `GeneratedResource` por `key` (Prisma + caché Redis `generated:resource:<key>`).
3. Gate de licencia: `isLicensed(fastify, resource.feature ?? 'generator')` — 403
   `feature_not_licensed` si no está licenciado.
4. Validar body contra `resource.schema` (Ajv) → 422 con detalles si falla.
5. Sanitizar campos `format:"html"` con `sanitize-html`.
6. Operar sobre `GeneratedRecord` con `organizationId` del scope.

Los permisos `gen.<key>.read`/`gen.<key>.write` se crean automáticamente al crear el recurso
(reutilizando el mecanismo de `registerPluginPermissions`, `apps/api/src/plugins/loader.ts:213`)
y aparecen en `GET /api/v1/permissions` agrupados bajo `area: 'generated'`.

## 4. SDK tipado web/móvil

`apps/mobile` es un host Capacitor de `apps/web`, así que el SDK es **un solo cliente
tipado** para `apps/web`.

### 4.1 Codegen estático (exportable)

Script `pnpm run gen:api` (en `packages/generated`) que:

1. Lee `GeneratedResource` de la API (`GET /api/v1/generated`).
2. Emite por recurso:
   - Tipos TS: `export interface Visita { titulo: string; cantidad: number; ... }`.
   - Cliente tipado que envuelve `apps/web/src/lib/api.ts`:
     ```ts
     export const visitas = {
       list: (q?: { q?: string }) => api.get<Paginated<Visita>>('/api/v1/generated/visitas', q),
       create: (data: Visita) => api.post<Visita>('/api/v1/generated/visitas', data),
       update: (id: string, data: Partial<Visita>) => api.patch<Visita>(`/api/v1/generated/visitas/${id}`, data),
       remove: (id: string) => api.del<void>(`/api/v1/generated/visitas/${id}`),
     };
     ```
3. Escribe en `apps/web/src/lib/generated/` (o un paquete `@webs/generated`).

Resultado: tipos en compilación para `apps/web` y, por herencia, para la PWA de
`apps/mobile`.

### 4.2 Schema en runtime

`GET /api/v1/generated/:resource/schema` permite renderizar formularios/tablas dinámicamente
(con `SchemaForm`, el componente ya usado en settings/plugins) sin recompilar. Es el «acceso
rápido»: definir el recurso y en segundos tener CRUD funcional en la UI, incluso antes de
regenerar el SDK.

## 5. Integración con plugins y feature-gating

- **Menú admin**: ítem `/admin/generated` (sección «Integraciones», permiso
  `generated.read`), declarado como un item nativo más en `AdminLayout.tsx` `navItems`.
- **Feature premium `generator`**: décima flag en `LICENSE_FEATURES`
  (`apps/api/src/modules/licenses/features.ts`, `area:'extensions'`, `core:false`).
  El menú/catálogo/router la gobiernan con `hasFeature('generator')` (ADR-0019). El
  `GeneratedResource.feature` permite además marcar recursos individuales como premium.
- **Recursos generados vs plugins**: un recurso generado es CRUD declarativo; si necesita
  relaciones reales o lógica de negocio, se «promueve» a plugin vía plantilla (escape hatch).

## 6. Seguridad

- Validación Ajv (body) antes de persistir; `additionalProperties:false` por defecto para
  evitar campos no declarados.
- Sanitización `sanitize-html` en `format:"html"`; escape al serializar strings planos.
- Permisos auto-generados por recurso + `generated.manage`/`generated.read`.
- Tenant scoping fail-closed (ADR-0006); sin `organizationId` no se lee/escribe.
- Sin dependencias de pago (Ajv/Prisma/sanitize-html/Redis, ya en el repo).

## 7. Trazabilidad

- ADR-0020 (este diseño) → `docs/adr/0020-api-generator.md`.
- Coherente con ADR-0019 (feature-gating), ADR-0018 (permisos), ADR-0006 (multi-tenant),
  ADR-0027 (tabla genérica JSONB) y `docs/architecture/politica-dependencias.md`.
