# Roadmap y recomendaciones — Webs

Documento vivo de **elementos futuros** y **recomendaciones**. La plataforma es
una **base común para todos** y la diferenciación vive en los **bloques/plugins**
(cada uno con sus rutas, settings, permisos, slots, eventos y traducciones) y en
las **plantillas** que los combinan y activan automáticamente.

---

## 1. Implementado (referencia)

| Elemento | Estado | Versión |
| -------- | ------ | ------- |
| 2FA / TOTP (Authenticator/Authy) | ✅ | 0.7.0 |
| Códigos de respaldo 2FA | ✅ | 0.11.0 |
| FIDO2 / Passkeys | ✅ | 0.13.0 |
| Cifrado AES-256-GCM (PII) aplicado a SMTP y contacto | ✅ | 0.11.0 / 0.13.0 |
| Bloqueo de cuenta por intentos fallidos | ✅ | 0.11.0 |
| Tokens de API personales con scopes validados | ✅ | 0.12.0 |
| Rate limit por API token + contador | ✅ | 0.12.0 |
| "Recordarme" (cookie de sesión 90 días) | ✅ | 0.12.0 |
| Reportes de campañas (tasas + barras) | ✅ | 0.14.0 |
| Exportación de destinatarios (CSV) | ✅ | 0.14.0 |
| Marketplace de bloques (índice + git clone) | ✅ | 0.15.0 |
| Sistema de bloques completo (rutas/settings/permisos/slots/eventos/i18n) | ✅ | — |

---

## 2. Backlog pendiente (priorizado)

### 2.1 Seguridad e identidad
- [ ] **2FA obligatoria para roles privilegiados** (super_admin/admin): forzar activación de 2FA o passkey al iniciar sesión (con período de gracia).
- [ ] **Vista admin de API tokens**: listar/revocar tokens de **todos** los usuarios (reutilizar los permisos `apiToken.read`/`apiToken.write`, hoy sin uso).
- [ ] **Auditoría avanzada**: filtros por actor/recurso/fecha, búsqueda y exportación CSV/JSON.

### 2.2 Email / marketing
- [ ] **Serie temporal de aperturas/clics por día** (gráfico de evolución).
- [ ] **Exportar destinatarios en JSON/XLSX** (además de CSV).
- [ ] **Dashboard con métricas globales** del sitio (visitas, contenido, campañas).

### 2.3 Marketplace / bloques
- [ ] **Instalación desde npm** (además de `git`), con resolución de versiones.
- [ ] **Registro oficial + firma/verificación** de bloques (checksum, autor de confianza).

### 2.4 Documentación / CI
- [ ] **Script de validación de docs**: `scripts/build-docs` (sync → `mkdocs build`) y/o target en el `Makefile`.
- [ ] **GitHub Action del repo Docs** con `mkdocs build --strict` (falla con enlaces rotos).

### 2.5 Operación (al tener la VPS)
- [ ] Validar **build de Docker** (compose + Dockerfiles).
- [ ] Probar **Node en funcionamiento** en la VPS.

---

## 3. Hito: plantillas + bloques configurables

> Visión: la base es igual para todos; los usuarios crean su página como deseen
> eligiendo una **plantilla** (gimnasio, mercado, blog, corporativo…) que
> **instala y activa automáticamente** un conjunto de bloques. Cada bloque tiene
> su **propia página de configuración** en el panel.

### 3.1 Plantillas (templates)
- [ ] Formato `template.json`: `{ id, name, description, blocks[], defaultSettings, menu, theme }`.
- [ ] **Selector de plantillas** en el asistente de instalación.
- [ ] Aplicar plantilla = instalar + activar bloques + cargar settings + crear menú + aplicar tema.
- [ ] Plantillas base: **gimnasio**, **mercado/ecommerce**, **blog**, **corporativo**.

### 3.2 Página de configuración por bloque (admin)
- [ ] Cada bloque con **ruta propia de configuración** en el panel (`/admin/blocks/:id`), además de la vista genérica (ya existe `settings` JSON Schema + `SchemaForm`).
- [ ] El **nav del admin** se alimenta de los bloques instalados (sección "Bloques" con subpáginas por bloque).
- [ ] Configuración de **apariencia** por bloque (slots + `clientEntry`) y vista previa.

### 3.3 Caso de referencia: bloque **Mercado Pago**
- [ ] **Config** (cifrada con `x-ui.secret`/AES-256-GCM): clave pública, clave privada, entorno sandbox/prod, secreto del webhook.
- [ ] **Apariencia de la página de pago**: colores, textos, logo, checkout embebido vs. redirección (settings de UI).
- [ ] **Flujo de pago**: token único de pago, idempotencia (clave de idempotencia), validación de firma del webhook (`x-signature`), estados de pago.
- [ ] **Seguridad**: tokenización (nunca guardar datos de tarjeta → SDK de Mercado Pago), secretos cifrados, webhooks por HTTPS, PCI-DSS (checkout hospedado/SDK), auditoría de cada pago.

---

## 4. Orden sugerido

1. **2FA obligatoria para admins** (seguridad crítica).
2. **Auditoría avanzada** (filtros/exportación).
3. **Plantillas + página de config por bloque** (núcleo de la nueva arquitectura).
4. **Bloque Mercado Pago** como referencia real (valida todo el modelo de bloques).
5. **Vista admin de tokens** + **dashboard de métricas** + **serie temporal de campañas**.
6. **CI de docs** + **validación Docker/Node** (con la VPS).

> Convención: al completar un elemento, movelo a la tabla "implementado" con su
> versión y actualizá este documento.
