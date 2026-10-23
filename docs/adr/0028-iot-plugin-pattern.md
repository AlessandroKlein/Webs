# ADR-0028: Patrón de plugins IoT (cliente HTTP, collector y contrato de rutas)

- **Estado:** Aceptado
- **Fecha:** 2026 (Milestone 13 — IoT)
- **Decisión:** Todo plugin de integración IoT (invernadero, SEMA) implementa un
  mismo patrón: un **cliente HTTP** de dispositivo (`baseUrl` + token) con
  autenticación Bearer / X-Auth-Token / X-API-Key, un **collector** con intervalo
  configurable que persiste en la base separada `webs_iot` (ADR-0027), validación
  **SSRF-safe** del host, token **cifrado** con `lib/crypto.ts`, y un **contrato de
  rutas** idéntico bajo `/api/v1/plugins/<id>/devices`. Scoping fail-closed por
  organización.

## Contexto

El Milestone 13 agrega dos plugins IoT que hablan con dispositivos locales por
HTTP (`http://<IP>/api/v1`): `invernadero` (v3.29.0, 48 endpoints) y `sema`
(v1.103.0). Ambos comparten la misma mecánica: registrar un dispositivo por
IP/URL + token, sondear sus endpoints, mapear las métricas a la serie temporal
local y exponer el histórico por la API de Webs.

Sin un patrón común, cada plugin reinventaría el cliente HTTP, el cifrado del
token, la defensa SSRF y las rutas de gestión. Un patrón único reduce el código
duplicado, garantiza seguridad consistente (SSRF-safe, token cifrado) y permite
que la UI (t173) y los dashboards (t174/t175) consuman un contrato estable.

## Decisión

### 1. Cliente HTTP de dispositivo

Un helper compartido `apps/api/src/lib/iot-client.ts`:

```ts
interface IotDeviceClient {
  get<T>(path: string): Promise<T>;            // GET con auth inyectada
  post<T>(path: string, body?: unknown): Promise<T>; // POST con auth
}
createIotDeviceClient(baseUrl: string, auth: IotAuth): IotDeviceClient;
```

- `IotAuth` discrimina el mecanismo (elegido por `kind` del `IotDevice`):
  - `{ type: 'bearer', token }` → `Authorization: Bearer <token>`
  - `{ type: 'x-auth-token', token }` → `X-Auth-Token: <token>`
  - `{ type: 'x-api-key', token }` → `X-API-Key: <token>`
- Timeout por request (p. ej. 5 s) y reintento con backoff acotado (máx. 2) para
  lecturas; las escrituras (POST) no reintentan por defecto (evitar doble disparo
  de actuadores).
- Errores tipificados: timeout → `IotTimeoutError`; HTTP 401/403 → `IotAuthError`;
  resto → `IotRequestError` (el collector marca el dispositivo `lastSeenAt`/estado
  sin romper la API).

### 2. Collector con intervalo configurable

- Un `collector` por plugin (invernadero, sema) arranca en el `loadAndActivate`
  del plugin y se registra como job periódico.
- Intervalo por dispositivo: `IotDevice.pollIntervalMs` (default 60 000 ms),
  configurable al registrar/editar el dispositivo.
- Flujo de una pasada: leer `enabled` → `createIotDeviceClient` con token
  descifrado → `GET /status` (o `/sensors` según `kind`) → mapear métricas → `insert`
  en `IoTStore` → actualizar `lastSeenAt`.
- El collector es **tolerante**: un dispositivo caído no detiene la pasada de los
  demás; el error queda en el log y en `lastSeenAt` no se actualiza.

### 3. SSRF-safe

Antes de cada request, el cliente valida el host de `baseUrl`:

- Parsear URL con `new URL(baseUrl)`.
- Denegar por defecto `localhost` y rangos privados/reservados:
  `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
  `169.254.0.0/16`, `::1`, `fc00::/7`, `fe80::/10`.
- Permitir solo `http://`/`https://`.
- **Allowlist explícita**: el operador puede habilitar un rango privado vía
  configuración (`IOT_SSRF_ALLOWLIST`, lista de CIDR/hosts), para los casos de
  dispositivos en red LAN/VPN — el default sigue siendo denegar.
- Rechazo → `IotSsrfError`; nunca se hace el request.

> Nota honesta: la validación es de defensa en profundidad. En un despliegue
> donde la API corre dentro de la misma LAN que los dispositivos, la allowlist es
> necesaria y debe acotarse al mínimo rango posible.

### 4. Token cifrado

- El `token` se guarda en `IotDevice.tokenCipher` cifrado con `encrypt()` de
  `apps/api/src/lib/crypto.ts` (AES-256-GCM, `iv.tag.ciphertext`, clave derivada
  de `ENCRYPTION_KEY`), el mismo mecanismo ya usado para `x-ui.secret`.
- Nunca se expone el token en claro por la API: `GET /devices` devuelve
  `tokenMasked: '••••••••'` (o `hasToken: true`); `POST/PATCH` acepta un token
  nuevo en claro y lo cifra, o la máscara para «sin cambios».

### 5. Contrato de rutas (idéntico por plugin)

Cada plugin (`invernadero`, `sema`) expone, bajo su prefijo
`/api/v1/plugins/<id>` (ver `loader.ts`), el mismo contrato:

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| POST | `/devices` | `iot.write` | Registrar dispositivo con SOLO `{ kind, name, baseUrl, token, pollIntervalMs? }` |
| GET | `/devices` | `iot.read` | Listar dispositivos de la organización (token enmascarado) |
| PATCH | `/devices/:id` | `iot.write` | Editar (name/baseUrl/token/pollIntervalMs/enabled) |
| DELETE | `/devices/:id` | `iot.write` | Eliminar dispositivo |
| GET | `/devices/:id/status` | `iot.read` | Estado en vivo (sondear `/status` o `/sensors` ahora) |
| GET | `/devices/:id/series?metric=&from=&to=&agg=` | `iot.read` | Histórico desde `webs_iot` (agg: avg/min/max/count) |

- Permisos nuevos `iot.read` / `iot.write` (análogos a `inventory.read`/`write`,
  sembrados en `packages/core/src/constants.ts` y `seed.ts`).
- **Scoping fail-closed** por `organizationId` (ADR-0006): todas las rutas
  resuelven `organizationId` del tenant y filtran `IotDevice` por él; sin tenant
  → 403. `series` también valida que el `deviceId` pertenezca a la organización
  antes de consultar `webs_iot`.
- `series` acepta `from`/`to` (ISO 8601 o epoch) y `agg`; sin `agg` devuelve la
  serie cruda (acotada a un límite, p. ej. 5000 puntos).

## Consecuencias

### Positivas

- Un solo cliente/collector/SSRF-guard testeado, reutilizado por todos los plugins
  IoT presentes y futuros.
- Contrato estable para UI (t173) y dashboards (t174/t175) sin acoplar a cada
  dispositivo.
- Seguridad consistente: token cifrado en reposo, SSRF-safe, fail-closed
  multi-tenant.

### Negativas

- El cliente genérico puede no cubrir un endpoint exótico de un dispositivo
  futuro; se resuelve extendiendo el adapter, no rompiendo el contrato.
- La allowlist SSRF exige criterio del operador (si se configura mal, se reduce
  la protección).
- El collector es un proceso más a supervisar (se apoya en el job system
  existente de la API).

## Notas

- La serie temporal y el pool `pg` están en ADR-0027.
- Spec completa con la matriz de mapeo por dispositivo:
  `docs/architecture/iot-serie-temporal.md`.
- Mapeo de métricas anclado a las APIs reales: invernadero `GET /status`
  (temperatura/humedad/suelo/tanque/luz/bomba/ventilador) y SEMA `GET /sensors`
  (catálogo + mediciones con `measurement`/`unit`/`quality`).
- Permisos y seed: mismos patrones que `inventory.read`/`inventory.write`
  (ADR-0023).
