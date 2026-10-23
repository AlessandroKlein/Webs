# Licencias locales (Licensify) — integración en Webs

Implementación del [ADR-0007](../adr/0007-licensing.md) dentro de la API de Webs: un módulo de
licenciamiento **local, offline y node-locked** basado en la biblioteca
`@licensify/core` (repo `Licensify`, vendorizado en `packages/licensify`).

- **Sin servidor externo**: la activación se valida 100 % en el host.
- **No falsificable**: la licencia está firmada con Ed25519; la API solo conoce la **clave
  pública** del vendedor.
- **Ligada a máquina**: la clave de activación se cifra con una clave derivada del fingerprint
  de hardware; copiarla a otro host falla el descifrado.
- **Límite honesto**: es protección en cliente, no inviolable (ver [Límites](#limites)).

## Componentes

| Componente | Ruta | Responsabilidad |
|------------|------|-----------------|
| Plugin `license` | `apps/api/src/plugins/license.ts` | Construye `LicenseService`, lo expone como `fastify.license` e inicia la verificación periódica. |
| Servicio | `apps/api/src/modules/licenses/service.ts` | Activar/verificar/desactivar, feature-gating y anti-reloj. |
| Rutas | `apps/api/src/modules/licenses/routes.ts` | Endpoints HTTP bajo `/api/v1/license`. |
| Catálogo de features | `apps/api/src/modules/licenses/features.ts` | «Plantilla definitiva» de flags firmados. |
| Estado persistido | `apps/api/src/lib/license-state.ts` | `license.json` (estado activado) en `DATA_DIR`. |

## Configuración (variables de entorno)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `LICENSE_PUBLIC_KEY` | Para activar | Clave pública Ed25519 (PEM SPKI) del vendedor. Sin ella, el módulo queda en estado `unconfigured` y `POST /license/activate` responde `400`. La clave privada **nunca** se embebe en la app. |
| `DATA_DIR` | No | Directorio de datos (estado de la licencia y reloj persistido). Por defecto `apps/api/data`. |

La clave pública se puede obtener del CLI de Licensify (`licensify keygen` emite el par; se
configura solo la parte pública) o de una clave ya generada por el vendedor.

## Permisos RBAC

| Permiso | Endpoints |
|---------|-----------|
| `license.read` | `GET /license`, `GET /license/features` |
| `license.manage` | `GET /license/fingerprint`, `POST /license/activate`, `POST /license/deactivate` |

Ambos se siembran (`apps/api/prisma/seed.ts`) y coinciden con `@webs/core` (`Permission.LicenseRead`,
`Permission.LicenseManage`). `super_admin` y `admin` los reciben automáticamente (roles base).

## Endpoints

Todas las rutas exigen autenticación (`fastify.authenticate`) y el permiso correspondiente.

| Método | Ruta | Body | Respuesta |
|--------|------|------|-----------|
| `GET` | `/api/v1/license` | — | Estado fiel (`LicenseState`) tras re-verificar firma, vigencia y reloj. |
| `GET` | `/api/v1/license/features` | — | Catálogo de features con `enabled` (núcleo siempre activo). |
| `GET` | `/api/v1/license/fingerprint` | — | `{ fingerprint }` del host (para que el vendedor emita la clave ligada). |
| `POST` | `/api/v1/license/activate` | `{ activationKey }` | `{ ok, status }` tras activar y persistir. |
| `POST` | `/api/v1/license/deactivate` | — | `{ ok, status }` tras limpiar el estado local. |

`LicenseState` (respuesta de `GET /license`):

```ts
interface LicenseState {
  configured: boolean;          // LICENSE_PUBLIC_KEY presente
  status: 'unconfigured' | 'unlicensed' | 'active' | 'expired' | 'invalid' | 'clock_rollback';
  nodeLocked: boolean;
  productId?: string;
  licensee?: string;
  features: string[];           // flags firmados dentro de la licencia
  limits?: Record<string, number>;
  issuedAt?: string;
  expiresAt?: string;
  fingerprint?: string;         // hash, nunca el dato crudo
  activatedAt?: string;
  lastVerifiedAt?: string;
}
```

Errores de activación mapeados a HTTP:

- Clave malformada / no descifrable → `400` (`Clave de activación inválida o corrupta`).
- Clave ligada a otra máquina (node-lock) → `403` (`no corresponde a esta máquina`).
- Firma inválida (manipulada o de otro vendedor) → `403`.
- Licencia vencida → `400` (`La licencia expiró (…)`).
- Reloj retrocedido → `403` (anti-reloj).

## Feature-gating («plantilla definitiva»)

`apps/api/src/modules/licenses/features.ts` define el **catálogo canónico** de flags que Webs
entiende. La licencia firmada trae un array `features` inmutable; el servicio resuelve qué hay
habilitado combinando ese array con el catálogo:

- **Núcleo** (`core: true`): siempre disponible, no requiere licencia (`core`).
- **Premium** (`core: false`): solo si el flag está firmado en la licencia **y** el estado es
  `active` (`payments`, `shipping`, `inventory`, `ai`, `analytics`, `multitenant`,
  `marketplace`, `templates`).

API de decisión:

```ts
fastify.license.hasFeature('payments')  // false si la licencia no incluye el flag
fastify.license.activeFeatures()        // flags activos de la licencia vigente
```

Esto es lo que permite que un plugin comercial o una sección premium se monte solo con una
licencia válida (complementa la integración del manifiesto `plugin.json` con `commercial` y
`productId` descrita en el ADR-0007 y ADR-0005). Los `limits` firmados se exponen en el estado
pero su **aplicación** es específica de cada dominio (fuera del alcance de este módulo).

## Anti-reloj y verificación periódica

- El servicio usa `ClockGuard` de `@licensify/core` con `FileClockStore` (persiste la última
  marca en `DATA_DIR/license.clock`), tolerancia de **60 s**.
- Si el reloj retrocede más que la tolerancia, la licencia pasa a `clock_rollback` y el
  feature-gating deja de conceder flags premium.
- Cada **6 h** (y en cada arranque) se re-verifica firma + vigencia + reloj; un estado no
  `active` se registra en el log.
- La activación también valida el reloj antes de persistir.

> Nota operativa: con relojes sin NTP, un retroceso real > 60 s suspende la licencia (comportamiento
> intencional de anti-reloj). Corregir la hora y la siguiente verificación restablece el estado.

## Flujo de emisión (vendedor, offline)

```bash
# En el repo Licensify (CLI @licensify/cli), una sola vez:
licensify keygen                 # genera el par Ed25519 (custodiar la privada FUERA del repo)

# Para emitir una licencia ligada al host de despliegue:
# 1) obtener el fingerprint desde la API:  GET /api/v1/license/fingerprint
licensify issue \
  --private-key ./priv.pem \
  --payload '{ "id":"L-0001", "productId":"webs", "licensee":"Cliente X",
               "features":["payments","ai"], "issuedAt":"2026-10-23T00:00:00Z" }' \
  --fingerprint <fingerprint>     # imprime la clave de activación (Crockford/base32)

# 2) activar en la instancia: POST /api/v1/license/activate { "activationKey": "…" }
```

## Dependencia de `@licensify/core`

El core de Licensify está **vendorizado** dentro del monorepo como paquete de workspace
`packages/licensify` (nombre `@licensify/core`, cero dependencias de runtime). `apps/api` lo
consume con `"@licensify/core": "workspace:*"`.

- **Auto-contenido**: sin `file:` ni referencia al repo hermano. `pnpm install --frozen-lockfile`
  funciona desde un checkout limpio (CI) y `docker compose build` compila dentro del contexto de
  build (el Dockerfile COPY-a `packages/` completo).
- **Build**: `packages/licensify` expone `build` (tsup ESM + `.d.ts`). El CI lo compila junto a los
  demás paquetes compartidos (`@licensify/core` en `.github/workflows/ci.yml`, paso de build de
  paquetes) antes del typecheck, igual que `@webs/core`/`@webs/plugin-sdk`.
- **Origen canónico**: el repo `github.com/AlessandroKlein/Licensify` sigue siendo la fuente de
  emisión (CLI `@licensify/cli`: `keygen`, `issue`) y de las pruebas unitarias. El core vendido es
  una copia de `packages/core`; los cambios de upstream se sincronizan manualmente.

## Modelo de venta (plantilla definitiva vs. por features)

El mismo mecanismo (`features` firmados en la licencia) soporta dos modelos comerciales, **sin
servidor ni URL de validación**:

- **Plantilla definitiva (todo incluido)**: el cliente compra el producto completo una sola vez.
  La licencia se emite con **todos** los flags premium del catálogo (`payments`, `shipping`,
  `inventory`, `ai`, `analytics`, `multitenant`, `marketplace`, `templates`). El `productId`
  identifica la plantilla (`webs` o una plantilla concreta).
- **Por features (módulos habilitados)**: el cliente paga solo por lo que activa. La licencia
  firma **un subconjunto** de flags; el feature-gating monta únicamente esos módulos.

En ambos casos el flujo de venta/activación es **idéntico y offline** (ver [Flujo de
emisión](#flujo-de-emision-vendedor-offline)): el vendedor emite la clave de activación con el
`features` correspondiente a lo vendido, y el cliente la pega en `POST /api/v1/license/activate`.
La API valida firma, fingerprint y vigencia localmente; no existe llamada a un servidor de
licencias en ningún punto. Los `limits` firmados (p. ej. `users: 100`, `locations: 3`) permiten
graduar un mismo producto sin re-emitir el catálogo de features.

## Límites

Protección en cliente, **no** inviolable: un atacante con acceso al binario y recursos puede
parchear la verificación. Licensify eleva el coste (firma, cifrado, split-key, node-locking,
anti-reloj) pero no promete imposibilidad. Para funcionalidad crítica, complementar con checks
server-side cuando sea viable (fuera del alcance «sin servidor externo» del ADR-0007).
