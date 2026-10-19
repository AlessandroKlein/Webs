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
| Instalación de bloques desde npm + firma sha256 | ✅ | 0.18.0 |
| 2FA obligatoria para admins | ✅ | 0.16.0 |
| Vista admin de API tokens (todos los usuarios) | ✅ | 0.16.0 |
| Auditoría avanzada (filtros + export CSV) | ✅ | 0.17.0 |
| Serie temporal de aperturas/clics por día | ✅ | 0.17.0 |
| Exportar destinatarios JSON/XLSX | ✅ | 0.17.0 |
| Dashboard con métricas globales | ✅ | 0.17.0 |
| CI de docs: `make docs` + `mkdocs build --strict` | ✅ | 0.18.0 |
| Plantillas (template.json + selector + aplicar) | ✅ | 0.19.0 |
| Página de configuración por bloque (admin) | ✅ | 0.19.0 |
| Bloque Mercado Pago de referencia (seguridad) | ✅ | 0.20.0 |
| Arquitectura de pagos + bloques de pasarela (MP, MODO, Payway, Stripe, PayPal, EBANX, POS) | ✅ | 0.21.0 |
| Panel de pagos (admin), reembolsos y tienda | ✅ | 0.22.0 |
| Rate limit + caché Redis | ✅ | 0.23.0 |
| Cola de tareas BullMQ | ✅ | 0.24.0 |
| Media (multipart + sharp) + storage S3/R2/MinIO | ✅ | 0.25.0 |
| Notificaciones + bloque Twilio | ✅ | 0.26.0 |
| Firma Ed25519 de bloques + cola BullMQ genérica | ✅ | 0.27.0 |
| 2FA por SMS (OTP) | ✅ | 0.28.0 |
| Marketplace enriquecido (icono/downloadUrl) + plantilla en instalación | ✅ | 0.29.0 |
| Editor WYSIWYG (Quill) + badges de confianza | ✅ | 0.30.0 |
| Dashboard de costos (ganancias/gastos/beneficio) | ✅ | 0.31.0 |
| Bootstrap Icons + CSS responsive | ✅ | 0.32.0 |
| QR visual de 2FA + renombrar dispositivos FIDO2 | ✅ | 0.33.0 |
| Releases automáticas + plantillas blog/corporativo + bloque mapa | ✅ | 0.34.0 |
| WebAuthn en Redis + plantilla cursos + bloques carrito/facturación/push | ✅ | 0.37.0 |
| Núcleo: modo mantenimiento + zona horaria + respaldos | ✅ | 0.38.0 |
| Módulos opcionales: SEO, analítica, marketing, comentarios, búsqueda, soporte | ✅ | 0.39.0 |
| Bloques de negocio: ecommerce, reservas, blog, academia/LMS | ✅ | 0.40.0 |
| **v1.0.0 estable**: datos persistentes + sistema de versiones/actualización | ✅ | 1.0.0 |
| Bloques: notificaciones, chat, chat-ia, calendario, social | ✅ | 1.1.0 |
| Instalación automática de dependencias de bloques | ✅ | 1.2.0 |
| Selector de proveedores (provides/requiresProviders) | ✅ | 1.3.0 |
| Sistema de bloques completo (rutas/settings/permisos/slots/eventos/i18n) | ✅ | — |

---

## 2. Backlog pendiente (priorizado)

### 2.1 Seguridad e identidad
- [ ] (sin pendientes)

### 2.2 Email / marketing
- [ ] (sin pendientes)

### 2.3 Marketplace / bloques
- [ ] (sin pendientes)

### 2.4 Documentación / CI
- [ ] (sin pendientes)

### 2.5 Operación (al tener la VPS)
- [ ] Validar **build de Docker** (compose + Dockerfiles).
- [ ] Probar **Node en funcionamiento** en la VPS.

---

## 3. Hito completado: plantillas + bloques configurables

- ✅ Plantillas (`templates/gym.json`, `templates/market.json`) que instalan y activan bloques.
- ✅ Página de configuración por bloque (`/blocks/:id`).
- ✅ Bloque **Mercado Pago** de referencia (secretos cifrados, webhook firmado, idempotencia).

### Siguientes plantillas/bloques sugeridos
- ✅ Plantillas: gimnasio, mercado, blog, corporativo, **cursos**.
- ✅ Bloques: pagos (varias pasarelas), storage, Twilio, mapa, **carrito**, **facturación**, **push**.


---

## 4. Orden sugerido (backlog restante)

1. **Operación (con la VPS)**: validar Docker + Node → declarar **`v1.0.0`**.

> Todo el backlog de features está implementado (v0.7.0 → v0.37.0).

> Previsualizá el estilo del frontend sin servidor abriendo
> [`docs/estilo-frontend.html`](estilo-frontend.html) en el navegador.

> Convención: al completar un elemento, movelo a la tabla "implementado" con su
> versión y actualizá este documento.

> Versionado: seguimos **SemVer** (ver [VERSIONING.md](VERSIONING.md)). Hoy estamos
> en `v0.x.x` (desarrollo inicial); pasamos a `v1.0.0` al validar Docker + ejecución
> en producción.
