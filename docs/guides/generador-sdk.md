# Generador de SDK/API client (M7)

El generador de APIs (ADR-0020) expone un CRUD genérico bajo `/api/v1/generated/*`.
Para consumirlo con tipos desde el frontend hay **dos capas** complementarias:

1. **Cliente runtime** (`createGeneratedClient`): tipado por genérico, sin codegen.
2. **Codegen estático** (`pnpm run gen:api`): produce un módulo `.ts` tipado por recurso.

Ambos viven en `apps/web/src/lib/generated/` y reutilizan el wrapper `apps/web/src/lib/api.ts`
(authorization Bearer + refresh automático, headers de tenant-scope y manejo de errores
`ApiClientError`), por lo que **no hay que volver a implementar auth ni errores**.

## Estructura

```text
apps/web/src/lib/generated/
├── client.ts          # createGeneratedClient<T>(key) — cliente tipado runtime
├── schema-to-ts.ts    # jsonSchemaToTsType — JSON Schema → tipo TS (puro)
├── codegen.ts         # generateResourceSdk(key, name, schema) — módulo .ts completo
├── index.ts           # barrel de la librería
└── resources/         # salida del codegen (generado, commitearlo)
    ├── testimonials.ts
    └── index.ts
```

## 1. Cliente runtime (sin codegen)

```ts
import { createGeneratedClient } from '@/lib/generated';

// El tipo T describe el payload `data` del registro (validado contra el JSON Schema).
interface Testimonio {
  author: string;
  content: string;
  rating?: number;
}

const testimonios = createGeneratedClient<Testimonio>('testimonials');

await testimonios.list();               // GET /api/v1/generated/testimonials
await testimonios.get(id);              // GET /api/v1/generated/testimonials/:id
await testimonios.create({ author: 'A', content: 'B' });
await testimonios.update(id, { rating: 5 });
await testimonios.remove(id);
await testimonios.schema();             // GET /api/v1/generated/testimonials/schema
```

El contrato de cada endpoint coincide con el motor (`apps/api/src/modules/generated/routes.ts`):
`list`/`get`/`create`/`update` devuelven `GeneratedRecord<T>`; `schema` devuelve
`{ key, schema }` para render dinámico.

## 2. Codegen estático

```bash
pnpm run gen:api
```

Lee `apps/web/generated-resources.json` (un volcado con forma `[{ key, name, schema }]`)
y, para cada recurso, emite `apps/web/src/lib/generated/resources/<key>.ts`:

```ts
// resources/testimonials.ts (generado)
import { createGeneratedClient, type GeneratedRecord } from '../client';

export interface Testimonials {
  author: string;
  content: string;
  rating?: number;
}

export type TestimonialsInput = Testimonials;
export type TestimonialsRecord = GeneratedRecord<Testimonials>;

export const testimonials = createGeneratedClient<Testimonials>('testimonials');
```

Después importás el barrel generado:

```ts
import { testimonials, type Testimonials } from '@/lib/generated/resources';
```

Para regenerar desde una API viva (en vez del JSON local), se genera el volcado con
`GET /api/v1/generated` (permiso `generated.read`) y se pasa `--file=<dump.json>`,
o se define `GEN_API_BASE_URL`/`GEN_API_TOKEN`.

> El mapeo JSON Schema → TS soporta `type` (string/number/integer/boolean/array/object),
> `enum`, `required` (marca opcionales con `?`), `items` y `properties` anidados. El nombre
> del tipo es `toPascalCase(key)` (sin singularizar): `products` → `Products`.

## Colocación en web

- `apps/web/src/lib/generated/` ya está dentro del bundle de Vite (`apps/web`).
- Los módulos generados se importan desde `@/lib/generated/resources` (alias `@` → `src`).
- No requieren configuración adicional: auth/errores vienen de `api.ts`.

## Colocación en móvil (Capacitor)

`apps/mobile` envuelve `apps/web` (host Capacitor), así que **hereda el SDK tal cual**:

1. Generá los clientes con `pnpm run gen:api` (el output queda en `apps/web/src/...`).
2. La app móvil ya importa de `apps/web`, por lo que `@/lib/generated/resources` queda
   disponible sin pasos extra.
3. Como el token se guarda en `apps/web/src/lib/token.ts` y `api.ts` adjunta
   `Authorization: Bearer`, las peticiones desde el WebView de Capacitor autentican
   igual que en el navegador (ver `docs/guides/mobile-capacitor.md`).

## Verificación

- `pnpm --filter @webs/web typecheck` / `lint` / `build` — cubre la librería y el output.
- `pnpm --filter @webs/api exec tsx scripts/test-sdk-codegen.ts` — smoke del codegen (27 checks).

## Relación con el backend

- El motor (`apps/api/src/modules/generated/`) es la **frontera autoritativa**: valida con
  Ajv, sanitiza `format: "html"`, scopea por `organizationId` (fail-closed) y gatea por
  feature (`generator`). El SDK es una capa de conveniencia tipada; nunca reemplaza esa
  validación.
