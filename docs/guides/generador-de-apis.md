# Generador de APIs de acceso rápido (guía de uso)

El **generador de APIs** (ADR-0020) te permite crear un recurso CRUD completo —
modelo, validación, permisos y endpoints — **sin tocar el monorepo ni reiniciar**.
Definís el recurso desde la UI de administración, el backend lo expone en caliente
bajo `/api/v1/generated/:recurso`, y consumís los datos con un **SDK tipado** desde
la web (`apps/web`) o la app móvil (`apps/mobile`, host Capacitor).

Es una feature **premium** (`generator`, 10.ª flag de `LICENSE_FEATURES`): sin la
licencia activa, el botón «Generar API» y el ítem de menú `/admin/generated` quedan
deshabilitados y el backend responde `403 feature_not_licensed`.

> Referencias: [ADR-0020](../adr/0020-api-generator.md) (decisiones),
> [spec técnica](../architecture/api-generator.md) (modelo y contrato),
> [guía del SDK](./generador-sdk.md) (cliente runtime + codegen en detalle).

## 1. Flujo de uso (3 pasos)

### 1. Definir el recurso

En **Admin → Acceso rápido** (`/admin/generated`) pulsá **«Generar API»**. En el
formulario:

1. **Nombre** → la **clave** (slug) se auto-genera (`normalizeKey`): minúsculas, sin
   acentos, los no-alfanuméricos se vuelven `-`, recorte a 64 caracteres. Ej.:
   `Reseñas de clientes` → `resenas-de-clientes`. Podés editarla antes de guardar.
2. **Descripción** (opcional) y **feature** (por defecto `generator`; podés marcarla
   `core` o cualquier otra flag premium para gatear *este* recurso).
3. **Campos**: agregás campos con tipo y opciones:

   | Tipo | Opciones | JSON Schema generado |
   |------|----------|----------------------|
   | `string` | `required`, `unique`, `html` | `{ "type": "string" }` (+ `format:"html"`, `x-unique:true`) |
   | `integer` | `required`, `unique` | `{ "type": "integer" }` |
   | `number` | `required`, `unique` | `{ "type": "number" }` |
   | `boolean` | `required` | `{ "type": "boolean" }` |
   | `array` | `required` | `{ "type": "array", "items": { "type": "string" } }` |
   | `enum` | `required`, valores separados por coma | `{ "enum": ["a","b"] }` |

   El formulario muestra una **vista previa del JSON Schema** (draft 2020-12) que se
   está construyendo.

Al guardar (`POST /api/v1/generated`) el backend valida el schema, crea el recurso y
**genera automáticamente los permisos** `gen.<clave>.read` / `gen.<clave>.write`
(aparecen en Roles → Permisos bajo el área `generated`).

### 2. Consumir los endpoints

El recurso queda disponible al instante (caché Redis invalidada):

- `GET /api/v1/generated/<clave>` — lista los registros (scope del tenant activo).
- `POST /api/v1/generated/<clave>` — crea un registro (valida + sanitiza).
- `GET /api/v1/generated/<clave>/:id` / `PATCH` / `DELETE` — CRUD por registro.
- `GET /api/v1/generated/<clave>/schema` — JSON Schema (render dinámico).

### 3. Generar el SDK y consumir desde web/móvil

Dos opciones complementarias (detalle en [generador-sdk.md](./generador-sdk.md)):

- **Runtime** (sin codegen): `createGeneratedClient<T>(clave)` desde
  `apps/web/src/lib/generated`.
- **Estático**: `pnpm run gen:api` emite `apps/web/src/lib/generated/resources/<clave>.ts`
  con tipos + cliente tipado.

La app móvil **hereda el SDK tal cual**: `apps/mobile` envuelve `apps/web` (Capacitor),
así que los clientes generados y el token (`apps/web/src/lib/token.ts`) funcionan igual
dentro del WebView.

## 2. Referencia del formato de definición (JSON Schema)

El recurso se guarda como JSON Schema (draft 2020-12) en `GeneratedResource.schema`.
El builder UI lo construye desde los campos; también podés pegarlo como JSON. Subconjunto
soportado por el motor:

```json
{
  "type": "object",
  "required": ["author", "content"],
  "properties": {
    "author":  { "type": "string", "maxLength": 80 },
    "content": { "type": "string", "format": "html" },
    "rating":  { "type": "integer", "minimum": 0, "maximum": 5 },
    "active":  { "type": "boolean", "default": true },
    "tags":    { "type": "array", "items": { "type": "string" } },
    "status":  { "enum": ["borrador", "publicado", "archivado"] }
  },
  "additionalProperties": false
}
```

- `additionalProperties: false` (por defecto en el builder) — rechaza campos no declarados.
- `format: "html"` — el valor se **sanitiza** con `sanitize-html` server-side (anti-XSS).
- `x-unique: true` — el motor valida unicidad del campo dentro del recurso.
- Tipos válidos v1: `string`, `integer`, `number`, `boolean`, `array` (de strings),
  `enum`. Objetos anidados y arrays de objetos se soportan en el schema, aunque el
  builder UI v1 solo expone los tipos simples.

## 3. Endpoints generados

Todos viven bajo `/api/v1/generated` (módulo `apps/api/src/modules/generated/routes.ts`).

### Recursos (globales)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/generated` | `generated.read` | Lista recursos (key, name, schema, feature, enabled). |
| `POST` | `/generated` | `generated.manage` | Crea recurso (valida schema, `ensureGenPermissions`). |
| `PATCH` | `/generated/:key` | `generated.manage` | Edita nombre/descripción/feature/enabled/schema. |
| `DELETE` | `/generated/:key` | `generated.manage` | Elimina recurso y sus registros. |

### Registros (scoped por organización)

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/generated/:resource` | `gen.<key>.read` | Lista registros del tenant (`resolveScope`). |
| `POST` | `/generated/:resource` | `gen.<key>.write` | Crea registro (valida + sanitiza). |
| `GET` | `/generated/:resource/schema` | `gen.<key>.read` | JSON Schema del recurso. |
| `GET` | `/generated/:resource/:id` | `gen.<key>.read` | Un registro. |
| `PATCH` | `/generated/:resource/:id` | `gen.<key>.write` | Actualiza (merge parcial validado). |
| `DELETE` | `/generated/:resource/:id` | `gen.<key>.write` | Elimina registro. |

**Seguridad por request** (ADR-0020): `requireTenant` (fail-closed) → resolución del
recurso → gate de feature `isLicensed(resource.feature)` → validación Ajv (422 con
detalles) → sanitización `format:"html"` → operación scoped por `organizationId`.

## 4. SDK tipado

- **Cliente runtime** — `createGeneratedClient<T>(key)` (métodos `list/get/create/
  update/remove/schema`), reusa `api.ts` (auth + refresh + tenant-scope + `ApiClientError`).
- **Codegen estático** — `pnpm run gen:api` lee el volcado JSON y emite módulos `.ts`
  tipados (tipos de entidad + cliente + barrel).

Ambos se detallan en [generador-sdk.md](./generador-sdk.md).

## 5. Integración en apps/web

1. Importá desde `@/lib/generated` (runtime) o `@/lib/generated/resources` (codegen).
2. Los módulos ya están en el bundle de Vite; no requieren configuración extra.
3. Auth/errores vienen de `apps/web/src/lib/api.ts`.

```ts
import { createGeneratedClient } from '@/lib/generated';
interface Resena { author: string; content: string; rating?: number; }
const resenas = createGeneratedClient<Resena>('resenas-de-clientes');
await resenas.create({ author: 'Ana', content: 'Excelente' });
```

## 6. Integración en apps/mobile (Capacitor)

`apps/mobile` es un host Capacitor de `apps/web` (`@webs/mobile`, `@capacitor/core ^6`),
así que **no hay SDK móvil separado**:

1. Generá los clientes con `pnpm run gen:api` (la salida queda en `apps/web/src/...`).
2. La PWA móvil ya importa de `apps/web`, por lo que `@/lib/generated/*` queda
   disponible sin pasos extra.
3. El token se guarda en `apps/web/src/lib/token.ts` y `api.ts` adjunta
   `Authorization: Bearer`, de modo que las peticiones desde el WebView autentican
   igual que en el navegador (ver [App nativa (Capacitor)](./mobile-capacitor.md)).

## 7. Verificación rápida

- `pnpm --filter @webs/web typecheck` / `lint` / `build` — cubre la librería + output.
- `pnpm --filter @webs/api exec tsx scripts/test-generated.ts` — smoke del motor (15 checks).
- `pnpm --filter @webs/api exec tsx scripts/test-sdk-codegen.ts` — smoke del codegen (27 checks).
