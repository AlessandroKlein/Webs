# Roadmap y recomendaciones

Documento vivo de **elementos futuros** y **recomendaciones** de la plataforma
Webs. Las versiones referenciadas corresponden al release donde se implementó
cada elemento.

## Estado de los elementos solicitados

| Elemento | Estado | Versión |
| -------- | ------ | ------- |
| 2FA / TOTP (Google Authenticator/Authy) | ✅ Implementado | 0.7.0 |
| Códigos de respaldo para 2FA | ✅ Implementado | 0.11.0 |
| FIDO2 / Passkeys | ✅ Implementado | 0.13.0 |
| Cifrado de PII en reposo (AES-256-GCM) | ✅ Implementado | 0.7.0 |
| Cifrado aplicado a campos concretos (SMTP, teléfono/contacto) | ✅ Implementado | 0.11.0 / 0.13.0 |
| Rate limit por API token | ✅ Implementado | 0.12.0 |
| Bloqueo de cuenta por intentos fallidos | ✅ Implementado | 0.11.0 |
| Tokens de API personales con scopes validados | ✅ Implementado | 0.12.0 |

## Recomendaciones futuras (pendientes)

### Seguridad e identidad
- **2FA obligatoria para roles privilegiados** (super_admin/admin): forzar la
  activación de 2FA/passkey al iniciar sesión.
- **Vista admin de API tokens**: listar y revocar tokens de todos los usuarios.
- **Rate limit y desafíos WebAuthn en Redis**: compartidos entre instancias para
  despliegues en clúster.
- **Scopes por endpoint más finos** (permisos por recurso/acción específicos).
- **Auditoría avanzada**: filtros por actor/recurso/fecha y exportación.

### Email / marketing
- **Cola de envío con BullMQ/Redis**: reemplazar la cola en memoria para alto
  volumen y reintentos robustos.
- **Reportes de campañas**: tasa de apertura/clic, gráficos y comparativas.
- **Editor WYSIWYG profesional** (TipTap/Quill) en plantillas de correo.
- **QR visual** para el alta de 2FA (además de la clave/URL).

### Plataforma / bloques
- **Marketplace/catálogo de bloques** instalable desde la UI (índice remoto).
- **Cifrado de PII extensible a campos de bloques** (marcando `x-ui.secret` en sus
  ajustes, ya soportado por el framework).
- **Multitenancy**: aislamiento por organización/cliente en la misma instancia.
- **Tests automatizados**: unitarios (Vitest) y end-to-end (Playwright).
- **Observabilidad**: métricas Prometheus, tracing y dashboards.

### Operación / infraestructura
- **Backup y restauración** de la base de datos y de `data/`.
- **CDN** para assets del frontend y medios.
- **Módulo de Media** (gestión de archivos) — el modelo ya existe; falta la UI y
  el almacenamiento (local/S3).
- **Releases automáticas** con generación de notas (CI/CD + `gh release create`).

> Convención: al completar un elemento, movelo a la tabla "implementado" con su
> versión y actualizá este documento.
