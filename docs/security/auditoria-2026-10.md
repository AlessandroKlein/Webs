# Informe de auditoría y hardening de seguridad — Webs

> Autor: `seguridad` · Tarea `t10-security` · Fecha: 2026-10-22
> Base de código: monorepo `Webs` @ `v1.57.0` (apps/api Fastify + Prisma, blocks/ plugins).
> Alcance: arquitectura de licencias/activación anti-RE (repo Licensify), RBAC, JWT/OAuth, cifrado en tránsito/reposo, XSS/SQLi/CSRF y gap de rate-limit por instancia.

---

## 1. Resumen ejecutivo

La plataforma tiene una base de autenticación **sólida** (bcrypt, rotación de refresh tokens, 2FA/passkeys, saneamiento HTML, CORS por allowlist). Sin embargo existen **4 hallazgos críticos** que deben cerrarse antes de cualquier despliegue multi-tenant o público, y un conjunto de **gaps de hardening** que habilitan el roadmap de Milestone 2.

Prioridad global: **P0** = bloqueante para producción, **P1** = alto, **P2** = medio/bajo.

| # | Severidad | Hallazgo | Área |
|---|-----------|----------|------|
| F1 | P0 | Secretos JWT con defaults inseguros y sin enforcement en producción | JWT/Auth |
| F2 | P0 | Instalación remota de bloques ejecuta código arbitrario en el proceso (RCE / supply-chain) | Plugins |
| F3 | P0 | `social-login /verify` vincula cuentas por email auto-afirmado sin OAuth real | OAuth |
| F4 | P1 | `register /request-invite` público con rol heredado del `defaultRole` (escalada) | RBAC |
| F5 | P1 | `register /register` reenvía la password a un host controlable (SSRF / exfil) | Red |
| F6 | P1 | Rate-limit global por instancia (memoria) → bypass con balanceo/escalado | Escalabilidad |
| F7 | P1 | WebSocket `publish`/`subscribe` sin autorización por canal | Realtime |
| F8 | P2 | Cifrado de secretos fail-open + secretos de bloque sin cifrar | Cifrado |
| F9 | P2 | Credenciales de setup en claro en disco | Setup |
| F10 | P2 | Endpoints de passkey sin rate-limit; `rpId` default `localhost` | Auth |
| F11 | P2 | CSP desactivado y HSTS/CSP opt-in (no aplicados por defecto) | Headers |
| F12 | P2 | Sin aislamiento multi-tenant en datos de negocio (conocido, M2) | Multi-tenant |
| F13 | P2 | `SECURITY.md` obsoleto (tabla 0.1.x, sin scope actual) | Docs |

---

## 2. Hallazgos detallados

### F1 — P0 · Secretos JWT con default y sin enforcement (JWT)
**Evidencia:** `apps/api/src/config/env.ts` define `JWT_SECRET` con default `"dev-secret-change-me-please-0123456789"` y `JWT_REFRESH_SECRET` con default `"dev-refresh-secret-change-me-0123456789"`. No existe validación de que `NODE_ENV==='production'` haya sobrescrito estos valores (tampoco longitud mínima).
**Impacto:** Si se despliega sin `JWT_SECRET`, cualquier actor puede forjar access tokens (`role: 'admin'`, permisos arbitrarios) y refresh tokens → **bypass total de autenticación/RBAC**. Además, los **API tokens** son JWTs firmados con `JWT_SECRET` (no hasheados en BD), por lo que el mismo leak los compromete a todos.
**Fix:** fail-fast en producción si el secreto es el default o `length < 32`; rotar secretos ante cualquier sospecha de leak; documentar en `.env.example` con placeholder no operativo.

### F2 — P0 · RCE / supply-chain por instalación remota de bloques (Plugins)
**Evidencia:** `apps/api/src/blocks/loader.ts` `installRemoteBlock` descarga código (`git clone`/`npm pack`/tarball) y `loadBlockEntry` hace `import(entryPath)`, es decir **ejecuta el código descargado dentro del proceso de la API** (sin sandbox). La verificación de integridad (`sha256`/firma Ed25519) es **opcional** y solo se aplica si el manifiesto del registro trae esos campos. La ruta `POST /blocks/install` con `url` directa (`apps/api/src/modules/blocks/routes.ts`) construye la entrada **sin** `sha256`/`publicKey`/`signature`, por lo que una URL directa instala código sin ninguna verificación.
**Impacto:** Un atacante con `block.manage` (o cualquier vector que permita instalar) obtiene **ejecución remota de código** como el proceso servidor. Es el riesgo más grave del modelo de plugins y bloquea el marketplace público.
**Fix (M1):** exigir firma Ed25519 + `sha256` para **todo** bloque no firmado localmente; prohibir `url` directa sin manifiesto firmado. **Fix (M2):** aislar la ejecución de plugins (worker thread / VM / sandbox de procesos) y separar el manifiesto (declarativo) del código. Reutilizar el patrón de verificación Ed25519 ya presente en `catalog.ts` y `loader.ts` para el marketplace curado.

### F3 — P0 · `social-login /verify` sin OAuth real (OAuth)
**Evidencia:** `blocks/social-login/src/server.ts` `POST /verify` acepta `{provider, providerId, email, displayName}` **sin autenticación** y, si `email` coincide con un usuario, **vincula** la `SocialAccount` a ese `User`. El propio código declara que el flujo OAuth2 (`authorize → redirect → callback → exchange`) es un **TODO no implementado**; el cliente (`client.ts`) simula el callback con un `providerId` dummy y un email.
**Impacto:** Cualquier persona puede vincular una cuenta social a un usuario víctima por email auto-afirmado (account-linking arbitrario / precursor de account-takeover). No hay `state`/`nonce` ni intercambio de código que pruebe la posesión de la cuenta del proveedor.
**Fix:** no exponer `/verify` hasta implementar el flujo OAuth2 real (authorize + callback con `state`/PKCE + `clientSecret` del lado servidor). La posesión del proveedor debe ser la única fuente de verdad del vínculo; nunca el email del body.

### F4 — P1 · `register /request-invite` público + rol heredado (RBAC / escalada)
**Evidencia:** `blocks/register/src/server.ts` `POST /request-invite` es **público** (sin autenticación ni rate-limit) y crea `Invite` con `role: defaultRole` (el config del bloque). El núcleo de auth (`registerUser`) consume la invitación y **asigna el rol de la invitación**. Si el admin configura `defaultRole: 'admin'` (configuración plausible), un atacante puede auto-registrar una cuenta **admin**.
**Impacto:** escalada de privilegios completa en instalaciones con `defaultRole` elevado.
**Fix:** hacer `/request-invite` admin-only (o con rate-limit estricto), y **nunca permitir** que `defaultRole` sea un rol con permisos administrativos (whitelist `user`/`member`); validar el rol de la invitación contra una lista no privilegiada en el núcleo de auth.

### F5 — P1 · SSRF / exfiltración de credenciales vía Host header (Red)
**Evidencia:** `blocks/register/src/server.ts` `POST /register` reenvía el body (incluida la **password en claro**) a `${req.protocol}://${req.host}/api/v1/auth/register`. Con `trustProxy: true` (`app.ts`), `req.host` se deriva del header `Host`, controlable por el atacante. Un request con `Host: evil.example` hace que el servidor **envíe la password del usuario a un host controlado por el atacante**.
**Impacto:** exfiltración de credenciales + SSRF interno.
**Fix:** no reconstruir la URL desde el Host; invocar el servicio de auth **directamente** (sin HTTP) o, si es imprescindible, apuntar a `127.0.0.1`/`localhost` fijo y validar/ignorar el Host.

### F6 — P1 · Rate-limit global por instancia (Escalabilidad)
**Evidencia:** `apps/api/src/plugins/rate-limit.ts` registra `@fastify/rate-limit` con `max: 300`/1min **en memoria** (sin `store` de Redis); el propio comentario reconoce que es por instancia. `apps/api/src/lib/token-rate-limit.ts` mantiene un `Map` en memoria por API token. `apps/api/src/lib/rate-limiter.ts` sí implementa el patrón correcto (Redis si existe, memoria fallback), pero **no se usa** para el límite global ni para tokens.
**Impacto:** con load-balancing / auto-scaling (objetivo M2), cada instancia tiene su propio contador → **bypass de rate-limit** (fuerza bruta, abuso de API, DoS).
**Fix:** reutilizar `createRateLimiter`/Redis (`rate-limiter-flexible` + Redis) para el límite global y el de API tokens; documentar el conteo distribuido como prerrequisito del stateless/k8s (ADR-0008).

### F7 — P1 · WebSocket sin autorización por canal (Realtime)
**Evidencia:** `apps/api/src/plugins/websocket.ts` autentica el socket (`?token=` o Bearer), pero los mensajes `publish`/`subscribe` aceptan **cualquier** `channel` de cualquier usuario autenticado (`broadcast(channel, payload)` sin ACL).
**Impacto:** cualquier usuario autenticado puede publicar/suscribirse a canales de otros usuarios/orgs si la app llega a usar nombres de canal como frontera de secreto (p. ej. `user:<id>` o `org:<id>`).
**Fix:** ACL por canal: `user:<id>` solo owner; `org:<id>` solo miembros; `admin:*` solo roles admin; validar el canal en `publish`/`subscribe`.

### F8 — P2 · Cifrado fail-open y secretos de bloque sin cifrar (Cifrado)
**Evidencia:** `apps/api/src/lib/crypto.ts` `encryptSecretFields` retorna el **texto en claro** si no hay `ENCRYPTION_KEY` (solo `console.warn`). Los secretos `x-ui.secret` de los **bloques** no se cifran (el cifrado solo se aplica en `modules/settings/service.ts`, no en `modules/blocks/routes.ts` para `PUT /blocks/:id/settings`). `User.twoFactorSecret` se almacena en claro.
**Impacto:** secretos (SMTP, proveedores, TOTP) legibles si se compromete la BD o el disco; el comportamiento fail-open oculta la falta de `ENCRYPTION_KEY` en producción.
**Fix:** fail-closed en producción (arrojar si falta la clave); extender `encryptSecretFields` a la configuración de bloques; documentar el cifrado de `twoFactorSecret` (o aceptar el riesgo explícitamente).

### F9 — P2 · Credenciales de setup en claro en disco (Setup)
**Evidencia:** `apps/api/src/modules/setup/service.ts` escribe `data/setup-payload.json` con la **password del admin** y la **password de la BD** en claro. La ruta de instalación (`/setup/install`, `/setup/test-db`) es pública cuando `!state.installed`.
**Impacto:** credenciales en claro en disco + ventana de instalación abierta si la app queda expuesta durante el primer arranque.
**Fix:** no persistir el payload (o eliminarlo tras el éxito) y guardar la password del admin hasheada; acotar la ventana de instalación (token de un solo uso / bind a `localhost`).

### F10 — P2 · Passkeys sin rate-limit y `rpId` default (Auth)
**Evidencia:** `apps/api/src/modules/auth/passkeys.ts`: `rpId()` devuelve `WEBAUTHN_RP_ID ?? 'localhost'` (en producción fallará salvo que se configure); `origin()` usa `CORS_ORIGIN[0]` (rompe multi-origen). Los endpoints `/auth/passkey/login/options` y `/login/verify` son públicos y **sin** rate-limit.
**Impacto:** WebAuthn roto en producción por default; generación de challenges sin límite.
**Fix:** exigir `WEBAUTHN_RP_ID`/origen en producción; rate-limit en opciones/verify.

### F11 — P2 · CSP desactivado y HSTS opt-in (Headers)
**Evidencia:** `apps/api/src/plugins/helmet.ts` registra `@fastify/helmet` con `contentSecurityPolicy: false`. HSTS/CSP se aplican solo si existe el setting `security` (cargado una vez en el arranque, `security.ts`), es decir **no por defecto**.
**Impacto:** sin CSP, el XSS mitigado por `sanitize-html` queda con menos defensa en profundidad; sin HSTS no hay upgrade automático a TLS.
**Fix:** habilitar CSP razonable por defecto y HSTS en producción (los canales dinámicos de plugins se pueden acomodar vía `nonce`/allowlist).

### F12 — P2 · Sin aislamiento multi-tenant en datos de negocio (Multi-tenant)
**Evidencia:** los modelos de negocio (`Product`, `Order`, `Booking`, `BlogPost`, etc. en `apps/api/prisma/schema.prisma`) **no** tienen `organizationId`; el RBAC es global por permisos (no por tenant). `grep organizationId` en `apps/api/src` no arroja scoping en las consultas.
**Impacto:** al habilitar cadenas multi-tenant (M2), existirá IDOR entre tenants salvo que se implemente el scoping fail-closed definido en **ADR-0006**.
**Fix:** seguir ADR-0006 (scoping obligatorio `organizationId` + middleware fail-closed) antes de exponer el multi-tenant.

### F13 — P2 · `SECURITY.md` obsoleto (Docs)
**Evidencia:** `SECURITY.md` mantiene tabla de versiones `0.1.x` (el repo está en `v1.57.0`) y no refleja las capacidades nuevas (2FA/passkeys/API tokens) ni un contacto/scope actualizado.
**Fix:** actualizar tabla de versiones soportadas y añadir el alcance + proceso de reporte.

---

## 3. Verificación por área

### Licencias / activación local anti-RE (repo Licensify)
Diseño cubierto por **ADR-0007** (`docs/adr/0007-licensing.md`): firma Ed25519, clave de activación offline, node-locking por fingerprint, AES-256-GCM + split-key + ofuscación + anti-tamper/anti-reloj, con límite honesto de la protección en cliente. Reutiliza los patrones de cifrado/firma ya presentes en `apps/api/src/lib/crypto.ts` y `apps/api/src/blocks/catalog.ts`.
**Estado:** diseño validado; la implementación queda para **M2** (repo `Licensify` con `@licensify/core`). Recomendación de seguridad: el nodo debe persistir el estado de activación de forma que la **desactivación por ingeniería inversa** exija re-derivar la clave de hardware (vincular el fingerprint al key-split), y **nunca** confiar en reloj/almacenamiento manipulable sin atestación.

### RBAC
- Permisos granulares por `Role → Permission → UserRole` (`schema.prisma`), `authorize(permission)` en el plugin de auth.
- API tokens: `scopes` validados contra los permisos del creador y con revocación por BD (`revokedAt`).
- `shouldRequireTwoFactor` fuerza 2FA para admins cuando el setting está activo.
- **Gaps:** ver F4 (rol heredado de invitación) y F12 (sin aislamiento por tenant).

### JWT / OAuth
- Access token firmado (HS256, `JWT_SECRET`) + refresh token opaco aleatorio (48 bytes hex) con hash SHA-256 en `Session` y **rotación** en cada refresh.
- **Gaps:** F1 (secret default), F3 (OAuth sin implementar), F10 (passkey).

### Cifrado en tránsito / reposo
- TLS opcional vía `loadTls` (`lib/tls.ts`); CORS por allowlist; contraseñas con bcrypt (cost 10); refresh/OTP hasheados.
- **Gaps:** F8 (fail-open + secretos de bloque/TOTP), F9 (setup en claro), F11 (HSTS).

### XSS / SQLi / CSRF
- **XSS:** `sanitize-html` (`lib/sanitize.ts`) con `rel="nofollow noopener noreferrer"` forzado; esquemas `http/https/mailto`. Punto de atención: se permite `style`/`class`/`align` en todas las etiquetas (`*`).
- **SQLi:** acceso vía Prisma (consultas parametrizadas) — riesgo bajo; revisar cualquier raw query futura.
- **CSRF:** refresh token en cookie `httpOnly` (no accesible por JS); access token en `Authorization` header (no CSRF por header). Falta verificación de `Origin`/`SameSite` explícita en endpoints con cookie (refresh) — recomendación: fijar `SameSite=Lax/Strict` y validar `Origin`.

### Gap de rate-limit por instancia
Ver **F6** — es el gap pedido explícitamente; afecta al objetivo de escalabilidad/stateless (ADR-0008).

---

## 4. Plan de remediación priorizado

**Antes de producción / M1 (bloqueante):**
1. F1 — enforcement de secretos JWT en producción.
2. F2 — firma obligatoria + `sha256` en instalación de bloques; prohibir `url` directa sin manifiesto firmado.
3. F3 — deshabilitar/cerrar `social-login /verify` hasta OAuth real.
4. F5 — eliminar el fetch interno por Host header (invocar servicio directamente).
5. F4 — `/request-invite` admin-only + rol de invitación no privilegiado.

**M2 (junto con multi-tenant + escalabilidad):**
6. F6 — rate-limit global Redis (`rate-limiter-flexible`).
7. F7 — ACL de canales WebSocket.
8. F12 — scoping `organizationId` fail-closed (ADR-0006).
9. F8/F9/F10/F11/F13 — hardening de cifrado, setup, passkey, headers y docs.
