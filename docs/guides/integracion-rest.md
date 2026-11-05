# Integración REST (Invernadero y SEMA) — Webs

Cómo Webs conecta los dispositivos satélite (Invernadero y SEMA) por HTTP REST a
través de los plugins IoT y el paquete `@webs/iot`. El dispositivo expone su API
bajo `/api/v1`; Webs actúa como **colector central** y guarda las métricas en la
base de tiempo `webs_iot` (ver [ADR-0027](../adr/0027-iot-serie-temporal.md) y
[ADR-0028](../adr/0028-iot-plugin-pattern.md)).

## 1. Dar de alta un dispositivo

1. En la UI de Webs, crear un dispositivo IoT con el `kind` correcto
   (`invernadero` o `sema`) y su `baseUrl`.
2. El `baseUrl` admite **con o sin** `/api/v1`. El helper `deviceApiPrefix(baseUrl)`
   resuelve el prefijo (si ya termina en `/api/v1` no lo repite) y la ruta se
   resuelve **relativa** al `baseUrl`, conservando su path. Ejemplos equivalentes:
   - `http://192.168.1.50`
   - `http://192.168.1.50/api/v1`
3. Configurar el `authMode` (Bearer / X-Auth-Token / X-API-Key) y la credencial.
4. Ajustar `pollIntervalMs` (mínimo **1000 ms**) y, si el dispositivo está en una
   LAN privada, la `ssrfAllowlist`.

## 2. Autenticación

| Dispositivo | Escritura | Lectura |
|-------------|-----------|---------|
| Invernadero | `Authorization: Bearer <token>` o `X-Auth-Token` | Abierta (sin auth) |
| SEMA | `X-API-Key` (opcional) | Pública si no hay keys configuradas |

Detalles por dispositivo:

- **Invernadero** (`v3.29.0`): las rutas de escritura (ej. `POST /actuators`)
  exigen token; las rutas de lectura son abiertas. Sin auth devuelve `401`; con
  pines bloqueados devuelve `403`.
- **SEMA** (`v1.103.0`): la lectura de estado es pública. La key `X-API-Key` se
  compara contra `security.api_key`/`server_key`/`extra_keys`; si las tres están
  vacías, la petición se autoriza. `POST /api/v1/ota` es la **única** ruta que
  exige `X-API-Key` (la cookie de sesión no sirve ahí).

## 3. Prefijo, intervalo y red local

- **Prefijo `/api/v1`**: lo agrega Webs solo (`deviceApiPrefix`); no hace falta
  escribirlo en el `baseUrl` ni duplicarlo en ninguna ruta. Si el `baseUrl` trae
  un path propio (p. ej. un proxy `http://host/greenhouse`), se conserva y las
  peticiones van a `/greenhouse/api/v1/…`.
- **Intervalo mínimo**: `@webs/iot` acota `startCollector` a
  `Math.max(1000, intervalMs)`. Valores menores de 1000 ms se redondean a 1000 ms.
- **Red local (SSRF)**: `@webs/iot` valida la IP destino y **bloquea las IPs
  privadas** salvo que estén en `ssrfAllowlist`. Para un dispositivo en LAN hay
  que agregar la **IP exacta** del dispositivo (o su hostname) a la allowlist;
  **CIDR/subredes no están soportados** (la comparación es por igualdad exacta de
  hostname o de IP). Si no está en la lista, el colector rechaza la petición antes
  de salir.

## 4. Endpoints disponibles vs consumidos hoy

### Invernadero — `GET /api/v1/status`

Payload consumido por Webs (temperatura, humedad, humedad de suelo por zona, nivel
de tanque, luz, bomba/ventilador, alarmas severas) mapeado en
`mapStatusToMeasurements`.

| Endpoint del dispositivo | Webs hoy | Nota |
|--------------------------|----------|------|
| `GET /status` | Consume (telemetría) | Mapeo plano de métricas. |
| `POST /actuators` `{role,index,output}` | Consume (escritura) | `output` 0..100; roles `pump,valve,fan,extractor,heater,humidifier,light,roof,window,shade,alarm`. |
| `GET /sensors`, `/actuators`, `/zones`, `/weather`, `/alarms`, `/events`, `/logs` | No consume todavía | Disponibles en el dispositivo. |
| `/config`, `/config/schema`, `/config/export`, `/config/import`, `/config/rollback`, `/reset`, `/factory-reset` | No consume todavía | Configuración del dispositivo. |
| `/automation`, `/pins`, `/sensors/catalog`, `/hardware`, `/buses`, `/detect`, `/actuators/catalog`, `/modules`, `/storage` | No consume todavía | Gestión de hardware. |
| `/rs485`, `/rs485/scan`, `/modbus`, `/modbus/profiles`, `/modbus/gateway` | No consume todavía | Buses RS485/Modbus. |
| `/network`, `/network/scan`, `/device`, `/capabilities`, `/diagnostics`, `/health`, `/boot` | No consume todavía | Red y diagnóstico. |
| `/ota`, `/firmware` | No consume todavía | Actualización. |
| `/auth/login`, `/token/rotate`, `/token/revoke`, `/token/status` | No consume todavía | Gestión de tokens. |

### SEMA — `GET /api/v1/sensors`

Payload consumido por Webs: medidas en `measurements[]` (`sensor_id`, `channel_id`,
`measurement`, `value`, `unit`, `quality`, `sequence`). `GET /api/v1/status` solo
devuelve identidad (`station`, `name`, `firmware`, `uptime_s`) y **no** se usa para
telemetría.

| Endpoint del dispositivo | Webs hoy | Nota |
|--------------------------|----------|------|
| `GET /api/v1/sensors` | Consume (telemetría) | Medidas en `measurements[]`. |
| `GET /api/v1/status` | Consume on-demand | Proxy por `GET /devices/:id/status` para la UI de detalle; no se usa para telemetría. |
| `GET /api/v1/history?limit=1..3000&series=recent|aggregated&format=json|csv` | No consume todavía | Histórico. |
| `GET /api/v1/events`, `GET /api/v1/alarms` | No consume todavía | `ts` = `millis()` (uptime), no epoch. |
| `GET /api/v1/health`, `/system`, `/capabilities`, `/network`, `/energy`, `/diagnostics` | No consume todavía | Estado y salud. |
| `GET/PUT /api/v1/config`, `POST /config/network|system|sensors|io|buses` | No consume todavía | Configuración. |
| `/gpio`, `/shift`, `/wifi/scan`, `/security/keys`, `/update/check`, `/backup`, `/restart` | No consume todavía | Gestión. |
| `/wind/north`, `/wind/resistors`, `/dashboard/layout` | No consume todavía | Calibración de viento y dashboard. |
| `POST /api/v1/ota` | No consume todavía | Solo `X-API-Key`. |
| Buses `/modbus`, `/can`, `/lora`, `/zigbee` | No consume todavía | Buses de expansión. |

## 5. Troubleshooting

| Síntoma | Causa probable | Qué revisar |
|---------|----------------|-------------|
| `401` en escritura (Invernadero) | Falta token | Configurar `Authorization: Bearer <token>` o `X-Auth-Token`. |
| `401` en SEMA | Key inválida | `X-API-Key` contra `security.api_key`/`server_key`/`extra_keys`. |
| `403` (Invernadero) | Pines bloqueados | Demasiados intentos fallidos; esperar/desbloquear en el dispositivo. |
| `404` | Ruta o `baseUrl` equivocado | El `baseUrl` debe apuntar a la raíz del dispositivo (`http://IP` o `http://IP/api/v1`); el prefijo lo agrega Webs. Un proxy con path propio (`http://host/greenhouse`) conserva ese path. |
| `429` (SEMA) | Login fallido | 5 fallos en 60 s; esperar el backoff. |
| Timeout | Intervalo muy corto o red caída | `pollIntervalMs` ≥ 1000 ms; ping al dispositivo. |
| `quality: DEGRADED` (SEMA) | Sensor degradado | No alarmar; tratar la medida como no confiable. |
| `ts` gigante en `/events`/`/alarms` (SEMA) | `millis()` de uptime | **No** es epoch Unix; no parsear como fecha absoluta. |
| `POST /api/v1/ota` (SEMA) rechaza | Cookie insuficiente | Solo acepta `X-API-Key` (no `Cookie: sema_auth`). |

## 6. Referencias

- Contrato completo del dispositivo: sitio publicado, secciones «Invernadero →
  API REST» y «SEMA → API REST».
- [Ecosistema de repos](ecosistema.md) — mapa de repos y rol de Webs.
- [Serie temporal local IoT](../architecture/iot-serie-temporal.md) y
  [Patrón de plugins IoT](../adr/0028-iot-plugin-pattern.md).
